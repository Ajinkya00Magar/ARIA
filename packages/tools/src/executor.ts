// ─────────────────────────────────────────────────────────────────────────────
// Tool Executor — Dispatches agent tool calls to implementations
// ─────────────────────────────────────────────────────────────────────────────

import type { ToolName } from '@ibm-agent/types';
import { ToolExecutionError, createConsoleLogger } from '@ibm-agent/shared';
import { FileSystemTool } from './filesystem';
import { TerminalTool } from './terminal';
import { GitTool } from './git';
import { SearchTool } from './search';

const logger = createConsoleLogger('info');

export class ToolExecutor {
  private readonly fs: FileSystemTool;
  private readonly terminal: TerminalTool;
  private readonly git: GitTool;
  private readonly search: SearchTool;

  constructor(
    workspaceRoot: string,
    requirePermission: (cmd: string) => Promise<boolean>,
  ) {
    this.fs = new FileSystemTool(workspaceRoot);
    this.terminal = new TerminalTool(workspaceRoot, requirePermission);
    this.git = new GitTool(workspaceRoot);
    this.search = new SearchTool(workspaceRoot);
  }

  async execute(
    toolName: ToolName,
    args: Record<string, unknown>,
  ): Promise<string> {
    const start = Date.now();
    logger.debug('Executing tool', { toolName, args });

    try {
      const result = await this.dispatch(toolName, args);
      logger.debug('Tool completed', { toolName, duration: Date.now() - start });
      return result;
    } catch (err) {
      if (err instanceof ToolExecutionError) throw err;
      throw new ToolExecutionError(toolName, String(err));
    }
  }

  private async dispatch(
    toolName: ToolName,
    args: Record<string, unknown>,
  ): Promise<string> {
    switch (toolName) {
      // ── File System ──────────────────────────────────────────────────────────

      case 'read_file': {
        const content = await this.fs.readFile(
          args.path as string,
          (args.encoding as 'utf-8' | 'base64') ?? 'utf-8',
        );
        return content;
      }

      case 'write_file': {
        const result = await this.fs.writeFile(
          args.path as string,
          args.content as string,
          (args.createDirectories as boolean) ?? true,
        );
        return `${result.created ? 'Created' : 'Updated'} file: ${result.path} (${result.size} bytes)`;
      }

      case 'delete_file': {
        return await this.fs.deleteFile(
          args.path as string,
          (args.recursive as boolean) ?? false,
        );
      }

      case 'rename_file': {
        return await this.fs.renameFile(args.oldPath as string, args.newPath as string);
      }

      case 'move_file': {
        return await this.fs.moveFile(args.source as string, args.destination as string);
      }

      case 'list_files': {
        const files = await this.fs.listFiles(
          (args.path as string) ?? '.',
          (args.recursive as boolean) ?? false,
          (args.includeHidden as boolean) ?? false,
          (args.maxDepth as number) ?? 3,
        );

        const format = (items: typeof files, indent = 0): string =>
          items
            .map((f) => {
              const prefix = '  '.repeat(indent);
              const suffix = f.type === 'directory' ? '/' : '';
              const size = f.size ? ` (${f.size}b)` : '';
              let line = `${prefix}${f.name}${suffix}${size}`;
              if (f.children && f.children.length > 0) {
                line += '\n' + format(f.children, indent + 1);
              }
              return line;
            })
            .join('\n');

        return format(files) || 'Directory is empty';
      }

      case 'create_folder': {
        return await this.fs.createFolder(args.path as string);
      }

      case 'read_directory': {
        return await this.fs.readDirectory(
          (args.path as string) ?? '.',
          (args.maxDepth as number) ?? 4,
        );
      }

      // ── Search ───────────────────────────────────────────────────────────────

      case 'search_code': {
        const results = await this.search.search({
          pattern: args.pattern as string,
          searchPath: args.path as string | undefined,
          filePattern: (args.filePattern as string) ?? '**/*',
          caseSensitive: (args.caseSensitive as boolean) ?? false,
          maxResults: (args.maxResults as number) ?? 50,
        });

        if (results.length === 0) return 'No matches found.';

        return results
          .map(
            (r) =>
              `${r.file}:${r.line}:${r.column}\n${r.context.map((l, i) => `  ${r.line - 2 + i}: ${l}`).join('\n')}`,
          )
          .join('\n\n');
      }

      case 'replace_code': {
        const result = await this.search.replace(
          args.path as string,
          args.search as string,
          args.replace as string,
          (args.useRegex as boolean) ?? false,
          (args.all as boolean) ?? true,
        );
        return `Replaced ${result.replacements} occurrence(s).\n${result.preview}`;
      }

      // ── Terminal ─────────────────────────────────────────────────────────────

      case 'run_terminal': {
        const result = await this.terminal.execute(
          args.command as string,
          (args.cwd as string) ?? '.',
          (args.timeout as number) ?? 30_000,
          args.env as Record<string, string> | undefined,
        );
        const output = [];
        if (result.stdout) output.push(`STDOUT:\n${result.stdout}`);
        if (result.stderr) output.push(`STDERR:\n${result.stderr}`);
        output.push(`Exit code: ${result.exitCode} (${result.duration}ms)`);
        return output.join('\n\n');
      }

      case 'run_tests': {
        const result = await this.terminal.runTests(
          args.testPattern as string | undefined,
          (args.framework as string) ?? 'jest',
          (args.coverage as boolean) ?? false,
        );
        return [result.stdout, result.stderr, `Exit: ${result.exitCode}`].filter(Boolean).join('\n\n');
      }

      case 'install_packages': {
        const result = await this.terminal.installPackages(
          args.packages as string[],
          (args.packageManager as string) ?? 'npm',
          (args.dev as boolean) ?? false,
        );
        return [result.stdout, result.stderr, `Exit: ${result.exitCode}`].filter(Boolean).join('\n\n');
      }

      case 'lint_project': {
        const result = await this.terminal.lintProject(
          args.path as string | undefined,
          (args.fix as boolean) ?? false,
        );
        return [result.stdout, result.stderr].filter(Boolean).join('\n\n') || 'No lint issues found.';
      }

      case 'build_project': {
        const result = await this.terminal.buildProject((args.clean as boolean) ?? false);
        return [result.stdout, result.stderr, `Exit: ${result.exitCode}`].filter(Boolean).join('\n\n');
      }

      case 'start_dev_server': {
        const cmd = (args.command as string) ?? 'npm run dev';
        const { pid } = await this.terminal.startProcess('dev-server', cmd);
        return `Development server started (PID: ${pid})`;
      }

      case 'stop_dev_server': {
        return await this.terminal.stopProcess('dev-server');
      }

      // ── Git ──────────────────────────────────────────────────────────────────

      case 'git_status': {
        const status = await this.git.status();
        const lines = [
          `Branch: ${status.branch} (↑${status.ahead} ↓${status.behind})`,
          status.staged.length > 0 ? `Staged:\n${status.staged.map((f) => `  ${f.status} ${f.path}`).join('\n')}` : '',
          status.unstaged.length > 0 ? `Modified:\n${status.unstaged.map((f) => `  ${f.status} ${f.path}`).join('\n')}` : '',
          status.untracked.length > 0 ? `Untracked:\n${status.untracked.map((f) => `  ? ${f}`).join('\n')}` : '',
          status.conflicted.length > 0 ? `Conflicted:\n${status.conflicted.map((f) => `  ! ${f}`).join('\n')}` : '',
        ];
        return lines.filter(Boolean).join('\n') || 'Working tree clean';
      }

      case 'git_commit': {
        return await this.git.commit(
          args.message as string,
          args.files as string[] | undefined,
          (args.push as boolean) ?? false,
        );
      }

      case 'git_branch': {
        const result = await this.git.branch(
          args.action as 'list' | 'create' | 'delete',
          args.name as string | undefined,
        );
        if (Array.isArray(result)) {
          return result.map((b) => `${b.isCurrent ? '* ' : '  '}${b.name}`).join('\n');
        }
        return result;
      }

      case 'git_checkout': {
        return await this.git.checkout(
          args.branch as string,
          (args.create as boolean) ?? false,
        );
      }

      case 'git_diff': {
        return await this.git.diff(
          args.path as string | undefined,
          (args.staged as boolean) ?? false,
          args.commit as string | undefined,
        );
      }

      case 'git_push': {
        return await this.git.push(
          (args.remote as string) ?? 'origin',
          args.branch as string | undefined,
          (args.force as boolean) ?? false,
        );
      }

      case 'git_pull': {
        return await this.git.pull(
          (args.remote as string) ?? 'origin',
          args.branch as string | undefined,
        );
      }

      case 'git_log': {
        const commits = await this.git.log(
          (args.limit as number) ?? 20,
          args.author as string | undefined,
          args.since as string | undefined,
        );
        return commits
          .map((c) => `${c.shortHash} ${c.date.toISOString().split('T')[0]} ${c.author}: ${c.message}`)
          .join('\n');
      }

      default:
        throw new ToolExecutionError(toolName, `Unknown tool: ${toolName}`);
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────────

  get fileSystem(): FileSystemTool {
    return this.fs;
  }

  get gitTool(): GitTool {
    return this.git;
  }

  get searchTool(): SearchTool {
    return this.search;
  }

  get terminalTool(): TerminalTool {
    return this.terminal;
  }
}
