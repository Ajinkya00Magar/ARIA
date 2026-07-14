// ─────────────────────────────────────────────────────────────────────────────
// Terminal Tool — Secure command execution inside workspace
// ─────────────────────────────────────────────────────────────────────────────

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { ToolExecutionError, ValidationError } from '@ibm-agent/shared';
import { DANGEROUS_COMMANDS } from '@ibm-agent/shared';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface RunningProcess {
  pid: number;
  command: string;
  startedAt: Date;
  process: ChildProcess;
}

const BLOCKED_PATTERNS = [
  /\$\(.*\)/,         // Command substitution
  /`[^`]*`/,          // Backtick execution
  />\s*\/dev\/sd/,    // Writing to block devices
  /\|\s*bash/,        // Pipe to bash
  /\|\s*sh\b/,        // Pipe to sh
  /curl.*\|\s*(bash|sh)/, // curl | bash
  /wget.*\|\s*(bash|sh)/, // wget | sh
];

// bash is not available on stock Windows — spawning it makes every
// run_terminal call fail, so the agent falls back to telling the user to run
// commands manually. Use the platform's native shell instead.
function shellSpawnArgs(command: string): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    return { cmd: 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }
  return { cmd: 'bash', args: ['-c', command] };
}

export class TerminalTool {
  private readonly runningProcesses: Map<string, RunningProcess> = new Map();

  constructor(
    private readonly workspaceRoot: string,
    private readonly requirePermission: (cmd: string) => Promise<boolean>,
  ) {}

  // ── Command Validation ────────────────────────────────────────────────────────

  private isDangerous(command: string): boolean {
    const lower = command.toLowerCase();
    for (const dangerous of DANGEROUS_COMMANDS) {
      if (lower.includes(dangerous.toLowerCase())) return true;
    }
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) return true;
    }
    return false;
  }

  private validateCommand(command: string): void {
    // Block absolute path escapes
    const trimmed = command.trim();
    if (trimmed.startsWith('cd /') || trimmed.startsWith('cd ..')) {
      const target = trimmed.replace(/^cd\s+/, '');
      if (!target.startsWith(this.workspaceRoot) && target !== '..') {
        throw new ValidationError(`Cannot change to directory outside workspace: ${target}`);
      }
    }
  }

  // ── Run Command ────────────────────────────────────────────────────────────────

  async execute(
    command: string,
    cwdRelative = '.',
    timeoutMs = 30_000,
    env?: Record<string, string>,
  ): Promise<ExecResult> {
    this.validateCommand(command);

    const dangerous = this.isDangerous(command);
    if (dangerous) {
      const approved = await this.requirePermission(command);
      if (!approved) {
        throw new ValidationError(`Dangerous command was rejected: ${command}`);
      }
    }

    const cwd = path.resolve(this.workspaceRoot, cwdRelative);

    // Ensure cwd is within workspace
    if (!cwd.startsWith(path.resolve(this.workspaceRoot))) {
      throw new ValidationError('Working directory must be within workspace');
    }

    return new Promise<ExecResult>((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const shell = shellSpawnArgs(command);
      const child = spawn(shell.cmd, shell.args, {
        cwd,
        env: {
          ...process.env,
          HOME: this.workspaceRoot,
          WORKSPACE: this.workspaceRoot,
          ...env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new ToolExecutionError('run_terminal', `Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > 1024 * 1024) {
          stdout = stdout.slice(-512 * 1024) + '\n[...output truncated...]';
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 0,
          duration: Date.now() - startTime,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new ToolExecutionError('run_terminal', err.message));
      });
    });
  }

  // ── Long-Running Processes ────────────────────────────────────────────────────

  async startProcess(
    id: string,
    command: string,
    cwdRelative = '.',
    onOutput?: (data: string, type: 'stdout' | 'stderr') => void,
  ): Promise<{ pid: number }> {
    if (this.runningProcesses.has(id)) {
      throw new ValidationError(`Process ${id} is already running`);
    }

    const cwd = path.resolve(this.workspaceRoot, cwdRelative);

    const shell = shellSpawnArgs(command);
    const child = spawn(shell.cmd, shell.args, {
      cwd,
      env: { ...process.env, HOME: this.workspaceRoot },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.runningProcesses.set(id, {
      pid: child.pid ?? 0,
      command,
      startedAt: new Date(),
      process: child,
    });

    child.stdout?.on('data', (data: Buffer) => {
      onOutput?.(data.toString(), 'stdout');
    });

    child.stderr?.on('data', (data: Buffer) => {
      onOutput?.(data.toString(), 'stderr');
    });

    child.on('close', () => {
      this.runningProcesses.delete(id);
    });

    return { pid: child.pid ?? 0 };
  }

  async stopProcess(id: string): Promise<string> {
    const proc = this.runningProcesses.get(id);
    if (!proc) {
      return `No process with id ${id}`;
    }

    proc.process.kill('SIGTERM');
    this.runningProcesses.delete(id);
    return `Process ${id} (PID ${proc.pid}) stopped`;
  }

  getRunningProcesses(): Array<{ id: string; pid: number; command: string; startedAt: Date }> {
    return Array.from(this.runningProcesses.entries()).map(([id, p]) => ({
      id,
      pid: p.pid,
      command: p.command,
      startedAt: p.startedAt,
    }));
  }

  // ── Convenience methods ───────────────────────────────────────────────────────

  async runTests(
    testPattern?: string,
    framework = 'jest',
    coverage = false,
  ): Promise<ExecResult> {
    const cmds: Record<string, string> = {
      jest: `npx jest ${testPattern ?? ''} ${coverage ? '--coverage' : ''} --forceExit`,
      vitest: `npx vitest run ${testPattern ?? ''} ${coverage ? '--coverage' : ''}`,
      mocha: `npx mocha ${testPattern ?? '**/*.test.{js,ts}'}`,
      pytest: `python -m pytest ${testPattern ?? ''} ${coverage ? '--cov' : ''} -v`,
      'cargo test': `cargo test ${testPattern ?? ''}`,
      'go test': `go test ./... ${testPattern ? `-run ${testPattern}` : ''}`,
    };

    const cmd = cmds[framework] ?? cmds['jest'];
    return this.execute(cmd, '.', 120_000);
  }

  async installPackages(
    packages: string[],
    packageManager = 'npm',
    dev = false,
  ): Promise<ExecResult> {
    const flagMap: Record<string, string> = {
      npm: dev ? '--save-dev' : '',
      pnpm: dev ? '--save-dev' : '',
      yarn: dev ? '--dev' : '',
      pip: '',
      pip3: '',
      cargo: '',
      'go get': '',
    };

    const flag = flagMap[packageManager] ?? '';
    const cmd = `${packageManager} ${packageManager.startsWith('go') ? '' : 'install'} ${packages.join(' ')} ${flag}`.trim();

    return this.execute(cmd, '.', 120_000);
  }

  async lintProject(filePath?: string, fix = false): Promise<ExecResult> {
    const target = filePath ?? '.';
    const fixFlag = fix ? '--fix' : '';
    const cmd = `npx eslint ${target} ${fixFlag} --ext .ts,.tsx,.js,.jsx`;
    return this.execute(cmd, '.', 60_000);
  }

  async buildProject(clean = false): Promise<ExecResult> {
    const cleanCmd = clean ? 'rm -rf dist && ' : '';
    return this.execute(`${cleanCmd}npm run build`, '.', 120_000);
  }
}
