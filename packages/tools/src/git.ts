// ─────────────────────────────────────────────────────────────────────────────
// Git Tool — Wraps simple-git with workspace-safe operations
// ─────────────────────────────────────────────────────────────────────────────

import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import type { GitStatus, GitCommit, GitBranch, GitFileChange } from '@ibm-agent/types';
import { ToolExecutionError } from '@ibm-agent/shared';

export class GitTool {
  private readonly git: SimpleGit;

  constructor(workspaceRoot: string) {
    this.git = simpleGit({ baseDir: workspaceRoot, maxConcurrentProcesses: 1 });
  }

  // ── Status ─────────────────────────────────────────────────────────────────────

  async status(): Promise<GitStatus> {
    try {
      const status: StatusResult = await this.git.status();

      const mapStatus = (files: Array<{ path: string; from?: string; index?: string; working_dir?: string }>): GitFileChange[] =>
        files.map((f) => ({
          path: f.path,
          status: (f.index ?? f.working_dir ?? 'M') as GitFileChange['status'],
          oldPath: f.from,
        }));

      return {
        branch: status.current ?? 'HEAD',
        ahead: status.ahead,
        behind: status.behind,
        staged: mapStatus(status.staged.map((p) => ({ path: p, index: 'M' }))),
        unstaged: mapStatus(status.modified.map((p) => ({ path: p, working_dir: 'M' }))),
        untracked: status.not_added,
        conflicted: status.conflicted,
      };
    } catch (err) {
      throw new ToolExecutionError('git_status', String(err));
    }
  }

  // ── Commit ─────────────────────────────────────────────────────────────────────

  async commit(
    message: string,
    files?: string[],
    push = false,
  ): Promise<string> {
    try {
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }

      const result = await this.git.commit(message);
      let output = `Committed: ${result.commit}\n${result.summary.changes} files changed`;

      if (push) {
        await this.git.push();
        output += '\nPushed to remote.';
      }

      return output;
    } catch (err) {
      throw new ToolExecutionError('git_commit', String(err));
    }
  }

  // ── Branch ─────────────────────────────────────────────────────────────────────

  async branch(
    action: 'list' | 'create' | 'delete',
    name?: string,
  ): Promise<GitBranch[] | string> {
    try {
      if (action === 'list') {
        const branches = await this.git.branchLocal();
        return branches.all.map((b) => ({
          name: b,
          isCurrent: b === branches.current,
          isRemote: false,
        }));
      }

      if (!name) throw new ToolExecutionError('git_branch', 'Branch name required');

      if (action === 'create') {
        await this.git.checkoutLocalBranch(name);
        return `Created and switched to branch: ${name}`;
      }

      if (action === 'delete') {
        await this.git.deleteLocalBranch(name);
        return `Deleted branch: ${name}`;
      }

      return 'Unknown action';
    } catch (err) {
      if (err instanceof ToolExecutionError) throw err;
      throw new ToolExecutionError('git_branch', String(err));
    }
  }

  // ── Checkout ──────────────────────────────────────────────────────────────────

  async checkout(branchName: string, create = false): Promise<string> {
    try {
      if (create) {
        await this.git.checkoutLocalBranch(branchName);
      } else {
        await this.git.checkout(branchName);
      }
      return `Switched to branch: ${branchName}`;
    } catch (err) {
      throw new ToolExecutionError('git_checkout', String(err));
    }
  }

  // ── Diff ──────────────────────────────────────────────────────────────────────

  async diff(filePath?: string, staged = false, commit?: string): Promise<string> {
    try {
      const args: string[] = [];
      if (staged) args.push('--staged');
      if (commit) args.push(commit);
      if (filePath) args.push('--', filePath);

      const result = await this.git.diff(args);
      return result || 'No differences found.';
    } catch (err) {
      throw new ToolExecutionError('git_diff', String(err));
    }
  }

  // ── Push ──────────────────────────────────────────────────────────────────────

  async push(remote = 'origin', branch?: string, force = false): Promise<string> {
    try {
      const options = force ? ['--force'] : [];
      const current = await this.git.status();
      const targetBranch = branch ?? current.current ?? 'main';

      await this.git.push(remote, targetBranch, options);
      return `Pushed to ${remote}/${targetBranch}`;
    } catch (err) {
      throw new ToolExecutionError('git_push', String(err));
    }
  }

  // ── Pull ──────────────────────────────────────────────────────────────────────

  async pull(remote = 'origin', branch?: string): Promise<string> {
    try {
      const result = await this.git.pull(remote, branch);
      return `Pulled: ${result.summary.changes} changes, ${result.summary.insertions} insertions`;
    } catch (err) {
      throw new ToolExecutionError('git_pull', String(err));
    }
  }

  // ── Log ───────────────────────────────────────────────────────────────────────

  async log(limit = 20, author?: string, since?: string): Promise<GitCommit[]> {
    try {
      const options: Record<string, string | number> = { '--max-count': limit };
      if (author) options['--author'] = author;
      if (since) options['--since'] = since;

      const result = await this.git.log(options);
      return result.all.map((c) => ({
        hash: c.hash,
        shortHash: c.hash.slice(0, 8),
        message: c.message,
        author: c.author_name,
        email: c.author_email,
        date: new Date(c.date),
      }));
    } catch (err) {
      throw new ToolExecutionError('git_log', String(err));
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  async init(): Promise<string> {
    await this.git.init();
    return 'Initialized empty git repository';
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async clone(url: string, targetDir: string, branch?: string): Promise<string> {
    try {
      const options = branch ? ['--branch', branch, '--single-branch'] : [];
      await this.git.clone(url, targetDir, options);
      return `Cloned ${url} to ${targetDir}`;
    } catch (err) {
      throw new ToolExecutionError('git_clone', String(err));
    }
  }
}
