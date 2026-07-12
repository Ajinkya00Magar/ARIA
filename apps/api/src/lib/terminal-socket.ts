import { Server as SocketServer, Socket } from 'socket.io';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger } from './logger';

const logger = createLogger('terminal');

// Lazily load node-pty so the server still starts if it's not built
// (node-pty requires native bindings that may need a rebuild on the server)
let pty: typeof import('node-pty') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  pty = require('node-pty') as typeof import('node-pty');
  logger.info('node-pty loaded — full PTY terminal support enabled');
} catch {
  logger.warn('node-pty not available — using child_process fallback');
}

export function initTerminalSockets(io: SocketServer) {
  const terminalNs = io.of('/terminal');

  terminalNs.on('connection', (socket: Socket) => {
    logger.info(`Terminal client connected: ${socket.id}`);

    let ptyProcess: import('node-pty').IPty | null = null;
    let fallbackProcess: import('node:child_process').ChildProcess | null = null;

    socket.on('init', (data: { workspacePath: string }) => {
      const cwd = data.workspacePath || os.homedir();

      // Clean up any previous process
      try { ptyProcess?.kill(); } catch { /* ignore */ }
      try { fallbackProcess?.kill(); } catch { /* ignore */ }

      if (pty) {
        // ── Full PTY mode (interactive shell) ─────────────────────────────
        const shell = os.platform() === 'win32'
          ? (process.env.COMSPEC ?? 'cmd.exe')
          : (process.env.SHELL ?? 'bash');

        const shellArgs = os.platform() === 'win32' ? [] : [];

        logger.info(`Spawning PTY shell: ${shell} in ${cwd}`);

        try {
          ptyProcess = pty.spawn(shell, shellArgs, {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd,
            env: process.env as Record<string, string>,
          });

          ptyProcess.onData((data) => {
            socket.emit('data', data);
          });

          ptyProcess.onExit(({ exitCode }) => {
            logger.info(`PTY process exited with code ${exitCode}`);
            socket.emit('data', `\r\n[Process exited with code ${exitCode}]\r\n`);
            ptyProcess = null;
          });
        } catch (err) {
          logger.error({ err }, 'Failed to spawn PTY process');
          socket.emit('data', `\r\n[Failed to start terminal: ${String(err)}]\r\n`);
        }
      } else {
        // ── Fallback: child_process (no PTY, limited interactivity) ───────
        const { spawn } = require('node:child_process') as typeof import('node:child_process');
        const shell = os.platform() === 'win32' ? 'cmd.exe' : (process.env.SHELL ?? 'bash');

        logger.info(`Spawning fallback shell: ${shell} in ${cwd}`);
        fallbackProcess = spawn(shell, [], {
          cwd,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        fallbackProcess.stdout?.on('data', (d: Buffer) => socket.emit('data', d.toString()));
        fallbackProcess.stderr?.on('data', (d: Buffer) => socket.emit('data', d.toString()));
        fallbackProcess.on('exit', (code) => {
          socket.emit('data', `\r\n[Process exited with code ${code}]\r\n`);
          fallbackProcess = null;
        });
        socket.emit('data', `\r\n[Connected to ${shell} in ${cwd}]\r\n`);
      }
    });

    // Handle terminal resize
    socket.on('resize', (data: { cols: number; rows: number }) => {
      try {
        ptyProcess?.resize(data.cols, data.rows);
      } catch { /* ignore */ }
    });

    // Send user input to shell
    socket.on('data', (data: string) => {
      try {
        if (ptyProcess) {
          ptyProcess.write(data);
        } else if (fallbackProcess?.stdin) {
          fallbackProcess.stdin.write(data);
        }
      } catch { /* ignore */ }
    });

    socket.on('disconnect', () => {
      logger.info(`Terminal client disconnected: ${socket.id}`);
      try { ptyProcess?.kill(); } catch { /* ignore */ }
      try { fallbackProcess?.kill(); } catch { /* ignore */ }
    });
  });
}
