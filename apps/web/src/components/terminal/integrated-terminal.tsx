'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

interface IntegratedTerminalProps {
  workspacePath: string;
}

export function IntegratedTerminal({ workspacePath }: IntegratedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Guards against xterm calls after dispose (React Strict Mode double-mounts,
  // socket events firing during teardown) → "reading 'dimensions'" crashes
  const disposedRef = useRef(false);

  const fitTerminal = useCallback(() => {
    try {
      if (
        !disposedRef.current &&
        containerRef.current &&
        containerRef.current.clientWidth > 0 &&
        containerRef.current.clientHeight > 0 &&
        fitAddonRef.current &&
        termRef.current?.element // only fit once xterm is attached to the DOM
      ) {
        fitAddonRef.current.fit();
        // Notify backend about resize
        if (socketRef.current?.connected && termRef.current) {
          socketRef.current.emit('resize', {
            cols: termRef.current.cols,
            rows: termRef.current.rows,
          });
        }
      }
    } catch {
      // Ignore fit errors
    }
  }, []);

  /** Write to the terminal only while it's alive */
  const safeWrite = useCallback((fn: (t: Terminal) => void) => {
    const term = termRef.current;
    if (!term || disposedRef.current) return;
    try {
      fn(term);
    } catch {
      // terminal was torn down mid-write — ignore
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    disposedRef.current = false;

    // ── Initialize xterm.js ────────────────────────────────────────────────
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'IBM Plex Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: '#0e0e0e',
        foreground: '#f4f4f4',
        cursor: '#4589ff',
        cursorAccent: '#0e0e0e',
        black: '#262626',
        red: '#ff8389',
        green: '#42be65',
        yellow: '#f1c21b',
        blue: '#4589ff',
        magenta: '#be95ff',
        cyan: '#08bdba',
        white: '#f4f4f4',
        brightBlack: '#525252',
        brightRed: '#ff8389',
        brightGreen: '#42be65',
        brightYellow: '#f1c21b',
        brightBlue: '#4589ff',
        brightMagenta: '#be95ff',
        brightCyan: '#08bdba',
        brightWhite: '#ffffff',
        selectionBackground: '#0f62fe40',
      },
      allowTransparency: true,
      scrollback: 1000,
      convertEol: true,
    });

    termRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);

    // Fit after DOM settles (cleared on unmount)
    const fitTimeout = setTimeout(fitTerminal, 150);

    // ── Socket.io connection ──────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
    const socket = io(`${baseUrl}/terminal`, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      safeWrite((t) => t.writeln('\r\n\x1b[32m[Connected to terminal]\x1b[0m\r\n'));
      socket.emit('init', { workspacePath });
      fitTerminal();
    });

    socket.on('data', (data: string) => {
      safeWrite((t) => t.write(data));
    });

    socket.on('disconnect', () => {
      safeWrite((t) => t.writeln('\r\n\x1b[33m[Terminal disconnected. Reconnecting...]\x1b[0m\r\n'));
    });

    socket.on('connect_error', () => {
      safeWrite((t) =>
        t.writeln('\r\n\x1b[31m[Cannot connect to terminal backend. Make sure the API is running.]\x1b[0m\r\n'),
      );
    });

    // Send user input to backend
    term.onData((data) => {
      if (!disposedRef.current) socket.emit('data', data);
    });

    // ── Resize observer ────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserver.observe(containerRef.current);

    window.addEventListener('resize', fitTerminal);

    return () => {
      // Mark disposed FIRST so in-flight socket events / timers become no-ops
      disposedRef.current = true;
      clearTimeout(fitTimeout);
      window.removeEventListener('resize', fitTerminal);
      resizeObserver.disconnect();
      // Detach socket handlers before disconnecting — disconnect() fires the
      // 'disconnect' event, which would otherwise write to a disposed terminal
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      fitAddonRef.current = null;
      termRef.current = null;
      try {
        term.dispose();
      } catch {
        // already disposed
      }
    };
  }, [workspacePath, fitTerminal, safeWrite]);

  return (
    <div className="w-full h-full bg-[#0e0e0e] overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full p-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
