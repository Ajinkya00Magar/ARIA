// ─────────────────────────────────────────────────────────────────────────────
// Code Search Tool — Regex/glob-based code search across workspace
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';
import { sanitizePath } from '@ibm-agent/shared';

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  context: string[];
}

export interface SearchOptions {
  pattern: string;
  searchPath?: string;
  filePattern?: string;
  caseSensitive?: boolean;
  maxResults?: number;
  contextLines?: number;
}

export class SearchTool {
  constructor(private readonly workspaceRoot: string) {}

  // ── Code Search ───────────────────────────────────────────────────────────────

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const {
      pattern,
      searchPath = '.',
      filePattern = '**/*',
      caseSensitive = false,
      maxResults = 50,
      contextLines = 2,
    } = opts;

    const basePath = path.resolve(this.workspaceRoot, sanitizePath(searchPath));
    if (!basePath.startsWith(path.resolve(this.workspaceRoot))) {
      throw new Error('Search path must be within workspace');
    }

    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    const results: SearchResult[] = [];

    // Find matching files
    const files = await fg(filePattern, {
      cwd: basePath,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/*.lock'],
      onlyFiles: true,
      dot: false,
    });

    for (const file of files) {
      if (results.length >= maxResults) break;

      const fullPath = path.join(basePath, file);
      let content: string;

      try {
        content = await fs.readFile(fullPath, 'utf-8');
      } catch {
        continue;
      }

      // Skip binary files
      if (content.includes('\0')) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;

        regex.lastIndex = 0;
        const match = regex.exec(lines[i]);
        if (!match) continue;

        const context = lines.slice(
          Math.max(0, i - contextLines),
          Math.min(lines.length, i + contextLines + 1),
        );

        results.push({
          file: file.replace(/\\/g, '/'),
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          context,
        });
      }
    }

    return results;
  }

  // ── Replace in File ───────────────────────────────────────────────────────────

  async replace(
    relativePath: string,
    searchStr: string,
    replaceStr: string,
    useRegex = false,
    replaceAll = true,
  ): Promise<{ replacements: number; preview: string }> {
    const fullPath = path.resolve(this.workspaceRoot, sanitizePath(relativePath));
    if (!fullPath.startsWith(path.resolve(this.workspaceRoot))) {
      throw new Error('File path must be within workspace');
    }

    const content = await fs.readFile(fullPath, 'utf-8');

    const pattern = useRegex ? new RegExp(searchStr, replaceAll ? 'g' : '') : searchStr;
    let replacements = 0;

    const newContent = replaceAll
      ? content.replace(
          typeof pattern === 'string' ? new RegExp(escapeRegex(pattern), 'g') : pattern,
          (match) => {
            replacements++;
            return replaceStr;
          },
        )
      : content.replace(
          typeof pattern === 'string' ? pattern : pattern,
          (match) => {
            replacements++;
            return replaceStr;
          },
        );

    if (replacements === 0) {
      return { replacements: 0, preview: 'No matches found' };
    }

    await fs.writeFile(fullPath, newContent, 'utf-8');

    // Generate a preview diff
    const origLines = content.split('\n');
    const newLines = newContent.split('\n');
    const preview: string[] = [];
    for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
      if (origLines[i] !== newLines[i]) {
        if (origLines[i] !== undefined) preview.push(`- ${origLines[i]}`);
        if (newLines[i] !== undefined) preview.push(`+ ${newLines[i]}`);
      }
    }

    return {
      replacements,
      preview: preview.slice(0, 40).join('\n'),
    };
  }

  // ── Symbol Search ─────────────────────────────────────────────────────────────

  async findSymbols(symbolName: string): Promise<SearchResult[]> {
    const patterns = [
      `(function|const|let|var|class|interface|type|enum)\\s+${symbolName}`,
      `def\\s+${symbolName}`,
      `fn\\s+${symbolName}`,
      `func\\s+${symbolName}`,
    ];

    const results: SearchResult[] = [];
    for (const p of patterns) {
      const r = await this.search({ pattern: p, caseSensitive: false, maxResults: 20 });
      results.push(...r);
      if (results.length > 50) break;
    }

    return results;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
