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
    description: 'Delete a file or directory. This is a destructive operation that requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path relative to the workspace root' },
        recursive: { type: 'boolean', description: 'Delete directories recursively (default: false)' },
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
    name: 'run_terminal',
    description: 'Execute a shell command in the workspace terminal. Dangerous commands require confirmation.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory relative to workspace root (default: root)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        env: { type: 'object', description: 'Additional environment variables' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_tests',
    description: 'Run the project test suite or specific tests.',
    parameters: {
      type: 'object',
      properties: {
        testPattern: { type: 'string', description: 'Pattern to match test files or test names' },
        framework: { type: 'string', description: 'Test framework (jest, vitest, pytest, etc.)', enum: ['jest', 'vitest', 'mocha', 'pytest', 'cargo test', 'go test'] },
        coverage: { type: 'boolean', description: 'Generate coverage report (default: false)' },
        watch: { type: 'boolean', description: 'Run in watch mode (default: false)' },
      },
    },
  },
  {
    name: 'install_packages',
    description: 'Install one or more packages using a package manager.',
    parameters: {
      type: 'object',
      properties: {
        packages: { type: 'array', description: 'List of package names to install', items: { type: 'string', description: 'Package name' } },
        packageManager: { type: 'string', description: 'Package manager to use', enum: ['npm', 'pnpm', 'yarn', 'pip', 'pip3', 'cargo', 'go get', 'gradle', 'mvn'] },
        dev: { type: 'boolean', description: 'Install as dev dependency (default: false)' },
      },
      required: ['packages'],
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
    name: 'lint_project',
    description: 'Run linting on the project or specific files.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to lint (default: entire project)' },
        fix: { type: 'boolean', description: 'Automatically fix fixable issues (default: false)' },
      },
    },
  },
  {
    name: 'build_project',
    description: 'Build or compile the project.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Build target (e.g. production, development)' },
        clean: { type: 'boolean', description: 'Clean before building (default: false)' },
      },
    },
  },
  {
    name: 'start_dev_server',
    description: 'Start the development server.',
    parameters: {
      type: 'object',
      properties: {
        port: { type: 'number', description: 'Port to run on (default: from package.json)' },
        command: { type: 'string', description: 'Custom start command (optional)' },
      },
    },
  },
  {
    name: 'stop_dev_server',
    description: 'Stop the running development server.',
    parameters: {
      type: 'object',
      properties: {
        port: { type: 'number', description: 'Port of the server to stop' },
      },
    },
  },
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}
