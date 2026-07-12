import { Server as SocketServer, Socket } from 'socket.io';
import * as pty from 'node:child_process';
import os from 'node:os';
import { createLogger } from './logger';

const logger = createLogger('terminal');

export function initTerminalSockets(io: SocketServer) {
  const terminalNs = io.of('/terminal');

  terminalNs.on('connection', (socket: Socket) => {
    logger.info(`Terminal client connected: ${socket.id}`);
    
    let currentProcess: pty.ChildProcess | null = null;

    socket.on('init', (data: { workspacePath: string }) => {
      if (currentProcess) {
        currentProcess.kill();
      }

      const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
      
      logger.info(`Spawning ${shell} in ${data.workspacePath}`);
      
      currentProcess = pty.spawn(shell, [], {
        cwd: data.workspacePath,
        env: process.env,
      });

      if (!currentProcess.stdout || !currentProcess.stderr || !currentProcess.stdin) {
        socket.emit('data', '\\r\\nFailed to allocate standard I/O for process.\\r\\n');
        return;
      }

      currentProcess.stdout.on('data', (data) => {
        socket.emit('data', data.toString());
      });

      currentProcess.stderr.on('data', (data) => {
        socket.emit('data', data.toString());
      });

      currentProcess.on('exit', (code) => {
        logger.info(`Terminal process exited with code ${code}`);
        socket.emit('data', `\\r\\n[Process exited with code ${code}]\\r\\n`);
        currentProcess = null;
      });
    });

    socket.on('data', (data: string) => {
      if (currentProcess && currentProcess.stdin) {
        currentProcess.stdin.write(data);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Terminal client disconnected: ${socket.id}`);
      if (currentProcess) {
        currentProcess.kill();
      }
    });
  });
}
