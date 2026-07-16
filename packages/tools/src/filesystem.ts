// ─────────────────────────────────────────────────────────────────────────────
// File System Tools — Supabase Storage Backend
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { NotFoundError, WorkspaceError, ValidationError } from '@ibm-agent/shared';
import { getFileExtension, getLanguageFromExtension, formatBytes } from '@ibm-agent/shared';
import type { WorkspaceFile } from '@ibm-agent/types';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

export class FileSystemTool {
  private readonly supabase: any;

  // workspaceRoot is now the Workspace ID (used as a prefix in Supabase Storage)
  constructor(private readonly workspaceRoot: string, token?: string) {
    if (this.workspaceRoot.startsWith('/')) {
      this.workspaceRoot = this.workspaceRoot.substring(1);
    }
    
    // Create an authenticated client if a JWT token is provided
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: token ? { headers: { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } } : {},
    });
  }

  private getPath(relativePath: string): string {
    const clean = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
    if (clean === '' || clean === '.') return this.workspaceRoot;
    return `${this.workspaceRoot}/${clean}`;
  }

  async readFile(relativePath: string, encoding: 'utf-8' | 'base64' = 'utf-8'): Promise<string> {
    const fullPath = this.getPath(relativePath);
    
    const { data, error } = await this.supabase.storage.from('workspaces').download(fullPath);
    if (error) {
      throw new NotFoundError(`File: ${relativePath} (${error.message})`);
    }

    const buffer = await data.arrayBuffer();
    if (encoding === 'base64') {
      return Buffer.from(buffer).toString('base64');
    }
    return Buffer.from(buffer).toString('utf-8');
  }

  async writeFile(
    relativePath: string,
    content: string,
    createDirectories = true,
  ): Promise<{ path: string; size: number; created: boolean }> {
    const fullPath = this.getPath(relativePath);
    
    // Check if exists
    let created = false;
    const { data: existingData } = await this.supabase.storage.from('workspaces').list(this.getPath(relativePath.split('/').slice(0, -1).join('/')), {
      search: relativePath.split('/').pop()!
    });
    
    if (!existingData || existingData.length === 0) {
      created = true;
    }

    const buffer = Buffer.from(content, 'utf-8');
    const { data, error } = await this.supabase.storage.from('workspaces').upload(fullPath, buffer, {
      upsert: true,
      contentType: 'text/plain;charset=UTF-8'
    });

    if (error) {
      throw new WorkspaceError(`Failed to write file ${relativePath}: ${error.message}`);
    }

    return { path: relativePath, size: buffer.length, created };
  }

  async deleteFile(relativePath: string, recursive = true): Promise<string> {
    const fullPath = this.getPath(relativePath);
    
    // In Supabase storage, to delete a "folder" recursively, we must list and delete all files with that prefix
    if (recursive) {
      const { data, error } = await this.supabase.storage.from('workspaces').list(fullPath);
      if (error) throw new WorkspaceError(error.message);
      
      if (data && data.length > 0) {
        const paths = data.map((f: { name: string }) => `${fullPath}/${f.name}`);
        await this.supabase.storage.from('workspaces').remove(paths);
        return `Directory deleted: ${relativePath}`;
      }
    }

    const { error } = await this.supabase.storage.from('workspaces').remove([fullPath]);
    if (error) throw new NotFoundError(`File: ${relativePath}`);

    return `File deleted: ${relativePath}`;
  }

  async renameFile(oldPath: string, newPath: string): Promise<string> {
    const oldFull = this.getPath(oldPath);
    const newFull = this.getPath(newPath);

    const { error } = await this.supabase.storage.from('workspaces').move(oldFull, newFull);
    if (error) throw new WorkspaceError(error.message);

    return `Renamed: ${oldPath} → ${newPath}`;
  }

  async moveFile(source: string, destination: string): Promise<string> {
    return this.renameFile(source, destination);
  }

  async listFiles(
    relativePath = '.',
    recursive = false,
    includeHidden = false,
    maxDepth = 3,
  ): Promise<WorkspaceFile[]> {
    const fullPath = this.getPath(relativePath);
    
    const { data, error } = await this.supabase.storage.from('workspaces').list(fullPath, {
      limit: 1000,
    });
    
    if (error) throw new NotFoundError(`Directory: ${relativePath}`);
    
    const files: WorkspaceFile[] = [];
    
    for (const item of data) {
      if (!includeHidden && item.name.startsWith('.')) continue;
      
      const isDir = !item.id; // Supabase returns null id for 'folders' (prefixes)
      
      files.push({
        path: relativePath === '.' ? item.name : `${relativePath}/${item.name}`,
        name: item.name,
        type: isDir ? 'directory' : 'file',
        size: item.metadata?.size,
        lastModified: item.created_at ? new Date(item.created_at) : undefined,
        language: isDir ? undefined : getLanguageFromExtension(getFileExtension(item.name)),
      });
    }

    return files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async createFolder(relativePath: string): Promise<string> {
    // Supabase Storage doesn't have real folders. We create an empty .keep file to force the prefix to exist.
    await this.writeFile(`${relativePath}/.keep`, '');
    return `Created directory: ${relativePath}`;
  }

  async readDirectory(relativePath = '.', maxDepth = 4): Promise<string> {
    const files = await this.listFiles(relativePath, true, false, maxDepth);
    return files.map(f => f.path).join('\n');
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.storage.from('workspaces').list(this.getPath(relativePath.split('/').slice(0, -1).join('/')), {
        search: relativePath.split('/').pop()!
      });
      return !error && data && data.length > 0;
    } catch {
      return false;
    }
  }

  get root(): string {
    return this.workspaceRoot;
  }
}
