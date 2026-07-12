'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import 'xterm/css/xterm.css';

interface IntegratedTerminalProps {
  workspacePath: string;
}

export function IntegratedTerminal({ workspacePath }: IntegratedTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    const safeFit = () => {
      try {
        if (terminalRef.current && terminalRef.current.clientWidth > 0 && terminalRef.current.clientHeight > 0) {
          fitAddon.fit();
        }
      } catch (e) {
        // Ignore fit errors if dimensions are unavailable
      }
    };

    // Fit the terminal after a small delay to ensure container is rendered
    setTimeout(() => safeFit(), 100);

    // Handle window resize
    const handleResize = () => safeFit();
    window.addEventListener('resize', handleResize);

    // Initialize Socket.io connection to backend terminal namespace
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const newSocket = io(`${baseUrl}/terminal`);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      term.writeln('\\r\\n[Connected to local terminal]\\r\\n');
      newSocket.emit('init', { workspacePath });
    });

    newSocket.on('data', (data: string) => {
      term.write(data);
    });

    newSocket.on('disconnect', () => {
      term.writeln('\\r\\n[Terminal disconnected]\\r\\n');
    });

    // Send user input to backend
    term.onData((data) => {
      newSocket.emit('data', data);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      newSocket.disconnect();
      term.dispose();
    };
  }, [workspacePath]);

  return (
    <div className="w-full h-full bg-[#1e1e1e] p-2 overflow-hidden flex flex-col">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
        <span>Terminal</span>
      </div>
      <div ref={terminalRef} className="flex-1 w-full h-full overflow-hidden" />
    </div>
  );
}
