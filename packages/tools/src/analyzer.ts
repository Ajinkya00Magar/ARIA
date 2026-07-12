// ─────────────────────────────────────────────────────────────────────────────
// Project Analyzer — Scans repos, builds dependency graph, creates summary
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';
import type { ProjectSummary, RepositorySymbol, DependencyGraph, DependencyNode, DependencyEdge } from '@ibm-agent/types';
import { generateId } from '@ibm-agent/shared';

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', cs: 'C#',
  cpp: 'C++', c: 'C', rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin',
};

const FRAMEWORK_SIGNALS: Record<string, string> = {
  'next.config': 'Next.js',
  'nuxt.config': 'Nuxt.js',
  'angular.json': 'Angular',
  'vue.config': 'Vue.js',
  'remix.config': 'Remix',
  'svelte.config': 'SvelteKit',
  'cargo.toml': 'Rust/Cargo',
  'go.mod': 'Go Modules',
  'pom.xml': 'Maven/Java',
  'build.gradle': 'Gradle/Java',
  'requirements.txt': 'Python',
  'pyproject.toml': 'Python/Poetry',
  'express': 'Express.js',
  'fastapi': 'FastAPI',
  'django': 'Django',
  'flask': 'Flask',
};

export class ProjectAnalyzer {
  constructor(private readonly workspaceRoot: string) {}

  async analyze(): Promise<ProjectSummary> {
    const [packageInfo, fileStats, structure] = await Promise.all([
      this.readPackageJson(),
      this.analyzeFiles(),
      this.buildStructure(),
    ]);

    const symbols = await this.extractSymbols();

    return {
      name: packageInfo.name ?? path.basename(this.workspaceRoot),
      description: packageInfo.description,
      language: fileStats.primaryLanguage,
      framework: this.detectFramework(packageInfo),
      entryPoints: this.findEntryPoints(packageInfo),
      totalFiles: fileStats.totalFiles,
      totalLines: fileStats.totalLines,
      dependencies: packageInfo.dependencies ?? {},
      devDependencies: packageInfo.devDependencies ?? {},
      symbols,
      structure,
      createdAt: new Date(),
    };
  }

  private async readPackageJson(): Promise<Record<string, unknown> & {
    name?: string;
    description?: string;
    main?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }> {
    try {
      const pkgPath = path.join(this.workspaceRoot, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private async analyzeFiles(): Promise<{
    totalFiles: number;
    totalLines: number;
    primaryLanguage: string;
  }> {
    const files = await fg('**/*', {
      cwd: this.workspaceRoot,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      onlyFiles: true,
    });

    const langCount: Record<string, number> = {};
    let totalLines = 0;

    for (const file of files.slice(0, 500)) {
      const ext = path.extname(file).slice(1).toLowerCase();
      const lang = LANGUAGE_EXTENSIONS[ext];
      if (lang) {
        langCount[lang] = (langCount[lang] ?? 0) + 1;
      }

      try {
        const content = await fs.readFile(path.join(this.workspaceRoot, file), 'utf-8');
        totalLines += content.split('\n').length;
      } catch {
        // skip unreadable files
      }
    }

    const primaryLanguage =
      Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';

    return { totalFiles: files.length, totalLines, primaryLanguage };
  }

  private detectFramework(pkg: Record<string, unknown>): string | undefined {
    const deps = {
      ...(pkg.dependencies as Record<string, string> ?? {}),
      ...(pkg.devDependencies as Record<string, string> ?? {}),
    };
    const depNames = Object.keys(deps).join(' ').toLowerCase();

    for (const [signal, framework] of Object.entries(FRAMEWORK_SIGNALS)) {
      if (depNames.includes(signal)) return framework;
    }

    return undefined;
  }

  private findEntryPoints(pkg: Record<string, unknown>): string[] {
    const entries: string[] = [];
    if (pkg.main) entries.push(pkg.main as string);

    const scripts = pkg.scripts as Record<string, string> ?? {};
    if (scripts.start) entries.push(`npm run start`);
    if (scripts.dev) entries.push(`npm run dev`);
    if (scripts.build) entries.push(`npm run build`);

    return entries;
  }

  private async buildStructure(): Promise<string> {
    const lines: string[] = [];
    await this.buildTree(this.workspaceRoot, '', 0, 3, lines);
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

    const filtered = entries
      .filter((e) => !e.startsWith('.') && e !== 'node_modules' && e !== 'dist' && e !== '__pycache__')
      .sort();

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

  private async extractSymbols(): Promise<RepositorySymbol[]> {
    const symbols: RepositorySymbol[] = [];

    const files = await fg('**/*.{ts,tsx,js,jsx,py,go,rs,java}', {
      cwd: this.workspaceRoot,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      onlyFiles: true,
    });

    const patterns: Array<{ regex: RegExp; kind: RepositorySymbol['kind'] }> = [
      { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: 'class' },
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' },
      { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
      { regex: /^(?:export\s+)?type\s+(\w+)\s*=/gm, kind: 'type' },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*(?::\s*\w+)?\s*=/gm, kind: 'variable' },
      { regex: /app\.(?:get|post|put|delete|patch)\s*\(['"]([^'"]+)['"]/gm, kind: 'route' },
      { regex: /router\.(?:get|post|put|delete|patch)\s*\(['"]([^'"]+)['"]/gm, kind: 'route' },
    ];

    for (const file of files.slice(0, 100)) {
      let content: string;
      try {
        content = await fs.readFile(path.join(this.workspaceRoot, file), 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');

      for (const { regex, kind } of patterns) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null && symbols.length < 500) {
          const lineNumber = content.slice(0, match.index).split('\n').length;
          const lineContent = lines[lineNumber - 1] ?? '';

          symbols.push({
            name: match[1],
            kind,
            filePath: file.replace(/\\/g, '/'),
            line: lineNumber,
            description: lineContent.trim().slice(0, 100),
          });
        }
      }
    }

    return symbols;
  }

  async buildDependencyGraph(): Promise<DependencyGraph> {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];
    const nodeMap: Map<string, string> = new Map();

    const files = await fg('**/*.{ts,tsx,js,jsx}', {
      cwd: this.workspaceRoot,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      onlyFiles: true,
    });

    for (const file of files.slice(0, 100)) {
      const id = generateId();
      const label = path.basename(file, path.extname(file));
      nodes.push({ id, label, filePath: file, type: 'module' });
      nodeMap.set(file, id);
    }

    for (const file of files.slice(0, 100)) {
      let content: string;
      try {
        content = await fs.readFile(path.join(this.workspaceRoot, file), 'utf-8');
      } catch {
        continue;
      }

      const importRegex = /(?:import|require)\s*(?:\{[^}]*\}|[^'"]*)\s*(?:from\s*)?['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;

      while ((match = importRegex.exec(content)) !== null) {
        const imported = match[1];
        if (imported.startsWith('.')) {
          const resolved = path.resolve(path.dirname(file), imported);
          const candidates = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`];

          for (const candidate of candidates) {
            const relCandidate = path.relative(this.workspaceRoot, candidate).replace(/\\/g, '/');
            if (nodeMap.has(relCandidate)) {
              edges.push({
                from: nodeMap.get(file)!,
                to: nodeMap.get(relCandidate)!,
                type: 'import',
              });
              break;
            }
          }
        }
      }
    }

    return { nodes, edges };
  }
}
