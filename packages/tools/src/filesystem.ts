// ─────────────────────────────────────────────────────────────────────────────
// File System Tools — Safe workspace-sandboxed file operations
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { NotFoundError, WorkspaceError, ValidationError } from '@ibm-agent/shared';
import { sanitizePath, getFileExtension, getLanguageFromExtension, formatBytes } from '@ibm-agent/shared';
import type { WorkspaceFile } from '@ibm-agent/types';

const FORBIDDEN_PATHS = [
  '/etc',
  '/sys',
  '/proc',
  '/dev',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/boot',
  '/root',
  'C:\\Windows',
  'C:\\System32',
];

export class FileSystemTool {
  constructor(private readonly workspaceRoot: string) {}

  // ── Path Safety ───────────────────────────────────────────────────────────────

  private resolveSafe(relativePath: string): string {
    const cleaned = sanitizePath(relativePath);
    const resolved = path.resolve(this.workspaceRoot, cleaned);

    // Ensure we stay within workspace
    if (!resolved.startsWith(path.resolve(this.workspaceRoot))) {
      throw new ValidationError(`Path escape attempt detected: ${relativePath}`);
    }

    // Check forbidden system paths
    for (const forbidden of FORBIDDEN_PATHS) {
      if (resolved.startsWith(forbidden)) {
        throw new ValidationError(`Access to system path is not allowed: ${resolved}`);
      }
    }

    return resolved;
  }

  // ── Read File ─────────────────────────────────────────────────────────────────

  async readFile(
    relativePath: string,
    encoding: 'utf-8' | 'base64' = 'utf-8',
  ): Promise<string> {
    const fullPath = this.resolveSafe(relativePath);

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        throw new ValidationError(`Path is a directory, not a file: ${relativePath}`);
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (stat.size > maxSize) {
        throw new ValidationError(
          `File too large (${formatBytes(stat.size)}). Max 10MB. Consider using search_code instead.`,
        );
      }

      if (encoding === 'base64') {
        const buf = await fs.readFile(fullPath);
        return buf.toString('base64');
      }

      return await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(`File: ${relativePath}`);
      }
      throw err;
    }
  }

  // ── Write File ────────────────────────────────────────────────────────────────

  async writeFile(
    relativePath: string,
    content: string,
    createDirectories = true,
  ): Promise<{ path: string; size: number; created: boolean }> {
    const fullPath = this.resolveSafe(relativePath);

    let created = false;
    try {
      await fs.access(fullPath);
    } catch {
      created = true;
    }

    if (createDirectories) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
    }

    await fs.writeFile(fullPath, content, 'utf-8');
    const stat = await fs.stat(fullPath);

    return { path: relativePath, size: stat.size, created };
  }

  // ── Delete File ───────────────────────────────────────────────────────────────

  async deleteFile(relativePath: string, recursive = false): Promise<string> {
    const fullPath = this.resolveSafe(relativePath);

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        if (!recursive) {
          throw new ValidationError('Cannot delete directory without recursive=true');
        }
        await fs.rm(fullPath, { recursive: true, force: true });
        return `Directory deleted: ${relativePath}`;
      } else {
        await fs.unlink(fullPath);
        return `File deleted: ${relativePath}`;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(`File: ${relativePath}`);
      }
      throw err;
    }
  }

  // ── Rename File ───────────────────────────────────────────────────────────────

  async renameFile(oldPath: string, newPath: string): Promise<string> {
    const fullOld = this.resolveSafe(oldPath);
    const fullNew = this.resolveSafe(newPath);

    await fs.mkdir(path.dirname(fullNew), { recursive: true });
    await fs.rename(fullOld, fullNew);
    return `Renamed: ${oldPath} → ${newPath}`;
  }

  // ── Move File ─────────────────────────────────────────────────────────────────

  async moveFile(source: string, destination: string): Promise<string> {
    return this.renameFile(source, destination);
  }

  // ── List Files ────────────────────────────────────────────────────────────────

  async listFiles(
    relativePath = '.',
    recursive = false,
    includeHidden = false,
    maxDepth = 3,
  ): Promise<WorkspaceFile[]> {
    const fullPath = this.resolveSafe(relativePath);

    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundError(`Directory: ${relativePath}`);
    }

    return this.readDirRecursive(fullPath, this.workspaceRoot, recursive ? maxDepth : 1, includeHidden);
  }

  private async readDirRecursive(
    dirPath: string,
    rootPath: string,
    depth: number,
    includeHidden: boolean,
  ): Promise<WorkspaceFile[]> {
    if (depth <= 0) return [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: WorkspaceFile[] = [];

    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);
      const ext = getFileExtension(entry.name);

      const file: WorkspaceFile = {
        path: relativePath.replace(/\\/g, '/'),
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        language: entry.isFile() ? getLanguageFromExtension(ext) : undefined,
      };

      if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          file.size = stat.size;
          file.lastModified = stat.mtime;
        } catch {
          // ignore stat errors
        }
      }

      if (entry.isDirectory() && depth > 1) {
        file.children = await this.readDirRecursive(fullPath, rootPath, depth - 1, includeHidden);
      }

      files.push(file);
    }

    return files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // ── Create Folder ─────────────────────────────────────────────────────────────

  async createFolder(relativePath: string): Promise<string> {
    const fullPath = this.resolveSafe(relativePath);
    await fs.mkdir(fullPath, { recursive: true });
    return `Created directory: ${relativePath}`;
  }

  // ── Directory Tree ────────────────────────────────────────────────────────────

  async readDirectory(relativePath = '.', maxDepth = 4): Promise<string> {
    const fullPath = this.resolveSafe(relativePath);
    const lines: string[] = [];
    await this.buildTree(fullPath, '', 0, maxDepth, lines);
    return lines.join('\n');
  }

  private async buildTree(
    dirPath: string,
    prefix: string,
    depth: number,
    maxDepth: number,
    lines: string[],
  ): Promise<void> {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      return;
    }

    const filtered = entries.filter(
      (e) => !e.startsWith('.') && e !== 'node_modules' && e !== 'dist' && e !== '.git',
    );

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const fullPath = path.join(dirPath, entry);
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      lines.push(`${prefix}${connector}${entry}${stat.isDirectory() ? '/' : ''}`);

      if (stat.isDirectory()) {
        await this.buildTree(fullPath, prefix + childPrefix, depth + 1, maxDepth, lines);
      }
    }
  }

  // ── File Exists ───────────────────────────────────────────────────────────────

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolveSafe(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  get root(): string {
    return this.workspaceRoot;
  }
}
