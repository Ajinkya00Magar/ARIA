// ─────────────────────────────────────────────────────────────────────────────
// Terminal Tools — Execute shell commands within the workspace
// ─────────────────────────────────────────────────────────────────────────────

import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolExecutionError } from '@ibm-agent/shared';

const execAsync = promisify(exec);

export class TerminalTool {
  constructor(private readonly workspaceRoot: string) {}

  async runTerminal(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.workspaceRoot });
      let output = stdout || '';
      if (stderr) {
        output += `\nStderr:\n${stderr}`;
      }
      return output || 'Command executed successfully with no output.';
    } catch (err: any) {
      throw new ToolExecutionError(
        'run_terminal' as any,
        `Command failed: ${err.message}\nStdout: ${err.stdout || ''}\nStderr: ${err.stderr || ''}`
      );
    }
  }

  async runTests(framework: string): Promise<string> {
    let command = 'npm test';
    if (framework === 'vitest') command = 'npx vitest run';
    else if (framework === 'jest') command = 'npx jest';
    else if (framework === 'mocha') command = 'npx mocha';
    else if (framework === 'playwright') command = 'npx playwright test';
    
    return this.runTerminal(command);
  }

  async installPackages(packages: string[]): Promise<string> {
    if (packages.length === 0) return 'No packages specified to install.';
    const command = `npm install ${packages.join(' ')}`;
    return this.runTerminal(command);
  }
}
