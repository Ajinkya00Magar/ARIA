'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io, Socket } from 'socket.io-client';

interface IntegratedTerminalProps {
  workspacePath: string;
  visible?: boolean;
}

export function IntegratedTerminal({ workspacePath, visible = true }: IntegratedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const fitTerminal = useCallback(() => {
    try {
      if (
        containerRef.current &&
        containerRef.current.clientWidth > 0 &&
        containerRef.current.clientHeight > 0 &&
        fitAddonRef.current
      ) {
        fitAddonRef.current.fit();
        // Notify backend about resize
        if (socketRef.current && termRef.current) {
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

  // ── Trigger fit when visibility changes ──────────────────────────────────
  useEffect(() => {
    if (visible) {
      fitTerminal();
      const timer = setTimeout(fitTerminal, 150);
      return () => clearTimeout(timer);
    }
  }, [visible, fitTerminal]);

  useEffect(() => {
    if (!containerRef.current) return;

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

    // Fit after DOM settles
    setTimeout(fitTerminal, 150);

    // ── Socket.io connection ──────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const socket = io(`${baseUrl}/terminal`, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      term.writeln('\r\n\x1b[32m[Connected to terminal]\x1b[0m\r\n');
      socket.emit('init', { workspacePath });
      fitTerminal();
    });

    socket.on('data', (data: string) => {
      term.write(data);
    });

    socket.on('disconnect', () => {
      term.writeln('\r\n\x1b[33m[Terminal disconnected. Reconnecting...]\x1b[0m\r\n');
    });

    socket.on('connect_error', () => {
      term.writeln('\r\n\x1b[31m[Cannot connect to terminal backend. Make sure the API is running.]\x1b[0m\r\n');
    });

    // Send user input to backend
    term.onData((data) => {
      socket.emit('data', data);
    });

    // ── Resize observer ────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', fitTerminal);

    return () => {
      window.removeEventListener('resize', fitTerminal);
      resizeObserver.disconnect();
      socket.disconnect();
      term.dispose();
    };
  }, [workspacePath, fitTerminal]);

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
