// ─────────────────────────────────────────────────────────────────────────────
// Agent Tool Definitions for IBM Granite Code
// ─────────────────────────────────────────────────────────────────────────────

import type { ToolDefinition } from '@ibm-agent/types';

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. Returns the file content as a string.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path relative to the workspace root' },
        encoding: { type: 'string', description: 'File encoding (default: utf-8)', enum: ['utf-8', 'base64'] },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist or overwriting it if it does.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path relative to the workspace root' },
        content: { type: 'string', description: 'The full content to write to the file' },
        createDirectories: { type: 'boolean', description: 'Create parent directories if they do not exist (default: true)' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory (folders are deleted recursively by default). Use this whenever the user asks to delete, remove, or clean up files or folders — never tell the user to run rm themselves.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file or folder path relative to the workspace root' },
        recursive: { type: 'boolean', description: 'Delete directories recursively (default: true)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file from one path to another.',
    parameters: {
      type: 'object',
      properties: {
        oldPath: { type: 'string', description: 'Current file path relative to the workspace root' },
        newPath: { type: 'string', description: 'New file path relative to the workspace root' },
      },
      required: ['oldPath', 'newPath'],
    },
  },
  {
    name: 'move_file',
    description: 'Move a file from a source path to a destination path.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file path relative to the workspace root' },
        destination: { type: 'string', description: 'Destination file path relative to the workspace root' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'list_files',
    description: 'List files and directories in a given directory path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to workspace root (default: root)' },
        recursive: { type: 'boolean', description: 'List files recursively (default: false)' },
        includeHidden: { type: 'boolean', description: 'Include hidden files/directories (default: false)' },
        maxDepth: { type: 'number', description: 'Maximum recursion depth (default: 3)' },
      },
    },
  },
  {
    name: 'create_folder',
    description: 'Create a new directory and all necessary parent directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_directory',
    description: 'Read the structure of a directory as a tree, useful for understanding project layout.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to workspace root' },
        maxDepth: { type: 'number', description: 'Maximum depth (default: 4)' },
      },
    },
  },
  {
    name: 'search_code',
    description: 'Search for a pattern in files across the workspace. Supports regex patterns.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex supported)' },
        path: { type: 'string', description: 'Directory to search in (default: workspace root)' },
        filePattern: { type: 'string', description: 'Glob pattern to filter files (e.g. "**/*.ts")' },
        caseSensitive: { type: 'boolean', description: 'Case sensitive search (default: false)' },
        maxResults: { type: 'number', description: 'Maximum number of results (default: 50)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'replace_code',
    description: 'Find and replace text in a file. Can use literal strings or regex.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
        search: { type: 'string', description: 'Text or pattern to search for' },
        replace: { type: 'string', description: 'Text to replace with' },
        useRegex: { type: 'boolean', description: 'Treat search as a regex pattern (default: false)' },
        all: { type: 'boolean', description: 'Replace all occurrences (default: true)' },
      },
      required: ['path', 'search', 'replace'],
    },
  },

  {
    name: 'git_status',
    description: 'Get the current git status of the workspace, including staged, unstaged, and untracked files.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'git_commit',
    description: 'Stage files and create a git commit with a message.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        files: { type: 'array', description: 'Files to stage (default: all changed files)', items: { type: 'string', description: 'File path' } },
        push: { type: 'boolean', description: 'Push after committing (default: false)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'git_branch',
    description: 'List, create or delete git branches.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action to perform', enum: ['list', 'create', 'delete'] },
        name: { type: 'string', description: 'Branch name (required for create/delete)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'git_checkout',
    description: 'Switch to a different git branch.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name to checkout' },
        create: { type: 'boolean', description: 'Create branch if it does not exist (default: false)' },
      },
      required: ['branch'],
    },
  },
  {
    name: 'git_diff',
    description: 'Get the diff of changes in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Specific file to diff (optional)' },
        staged: { type: 'boolean', description: 'Show staged changes (default: false)' },
        commit: { type: 'string', description: 'Commit hash to diff against' },
      },
    },
  },
  {
    name: 'git_push',
    description: 'Push commits to the remote repository.',
    parameters: {
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name (default: origin)' },
        branch: { type: 'string', description: 'Branch to push (default: current branch)' },
        force: { type: 'boolean', description: 'Force push (requires user confirmation)' },
      },
    },
  },
  {
    name: 'git_pull',
    description: 'Pull latest changes from the remote repository.',
    parameters: {
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name (default: origin)' },
        branch: { type: 'string', description: 'Branch to pull (default: current branch)' },
      },
    },
  },
  {
    name: 'git_log',
    description: 'View git commit history.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of commits to show (default: 20)' },
        author: { type: 'string', description: 'Filter by author' },
        since: { type: 'string', description: 'Show commits since date (e.g. "1 week ago")' },
      },
    },
  },
  {
    name: 'analyze_code_complexity',
    description: 'Calculate complexity scores, logical density, and nesting levels of functions in a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'audit_security_rules',
    description: 'Audit code for unsafe vulnerabilities (SQLi, XSS, eval) and hardcoded secrets/passwords.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'lint_and_format',
    description: 'Prettify and clean up syntax formatting in a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate_scaffold',
    description: 'Generate boilerplate code files for components, APIs, Docker, and CI/CD pipelines.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Destination file path relative to workspace root' },
        template: {
          type: 'string',
          description: 'Boilerplate template type',
          enum: ['react-component', 'express-route', 'dockerfile', 'github-action', 'sql-migration'],
        },
        name: { type: 'string', description: 'Name of the component, route, or table' },
      },
      required: ['path', 'template', 'name'],
    },
  },
  {
    name: 'generate_openapi_schema',
    description: 'Scan Express/Next.js API route definitions in a file and generate an OpenAPI 3.0 JSON specification.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'API route file path relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'convert_code_format',
    description: 'Convert data formats (JSON, YAML, CSV, or TypeScript interfaces).',
    parameters: {
      type: 'object',
      properties: {
        fromFormat: { type: 'string', enum: ['json', 'yaml', 'csv', 'typescript-interface'], description: 'Format to convert from' },
        toFormat: { type: 'string', enum: ['json', 'yaml', 'csv', 'typescript-interface'], description: 'Format to convert to' },
        content: { type: 'string', description: 'The raw string content to convert' },
      },
      required: ['fromFormat', 'toFormat', 'content'],
    },
  },
  {
    name: 'generate_mock_data',
    description: 'Generate fake mock data datasets based on a schema description.',
    parameters: {
      type: 'object',
      properties: {
        schema: { type: 'string', description: 'JSON structure template or description of keys (e.g. name, email, age)' },
        count: { type: 'number', description: 'Number of rows to generate (default: 5)' },
      },
      required: ['schema'],
    },
  },
  {
    name: 'search_symbols',
    description: 'List classes, functions, and exports in a specific file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'analyze_dependencies',
    description: 'Scan package.json for deprecated modules, licenses, and version statuses.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to package.json relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate_readme_summary',
    description: 'Build a standard README markdown summary structure for the project.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the project' },
        description: { type: 'string', description: 'A short overview of what the project does' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'refactor_helper',
    description: 'Refactor code to optimize loops, simplify promises, or modernize ES6+ syntax.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
        refactorType: { type: 'string', enum: ['performance', 'readability', 'modernization'], description: 'Type of refactoring to apply' },
      },
      required: ['path', 'refactorType'],
    },
  },
  {
    name: 'generate_unit_tests',
    description: 'Auto-scaffold Vitest/Jest unit test suites for a source code file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Source code file path relative to workspace root' },
      },
      required: ['path'],
    },
  },
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}
