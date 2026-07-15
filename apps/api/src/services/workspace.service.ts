// ─────────────────────────────────────────────────────────────────────────────
// Workspace Service — direct folder access (no database).
// A "workspace" is simply a folder on disk registered in the recents list.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import type { Workspace } from '@ibm-agent/types';
import { NotFoundError, WorkspaceError, generateId } from '@ibm-agent/shared';
import { GitTool, ProjectAnalyzer } from '@ibm-agent/tools';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@ibm-agent/shared';
import {
  listWorkspaceRecords,
  updateWorkspaceRecords,
  type WorkspaceRecord,
} from '../lib/store';

export class WorkspaceService {
  /**
   * Open (or create) a folder as a workspace.
   * - input.path provided + exists → open that folder directly
   * - input.path provided + missing → create the folder (optionally git clone)
   * - no path → error: the desktop app always sends a folder picked by the user
   */
  async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    if (!input.path) {
      throw new WorkspaceError('A folder path is required. Use "Open Folder" to pick a directory.');
    }

    const workspacePath = path.resolve(input.path);
    let isExisting = false;
    try {
      const stats = await fs.stat(workspacePath);
      if (stats.isDirectory()) isExisting = true;
      else throw new WorkspaceError(`Path exists but is not a directory: ${workspacePath}`);
    } catch (err) {
      if (err instanceof WorkspaceError) throw err;
      // Folder doesn't exist — create it below
    }

    if (!isExisting) {
      await fs.mkdir(workspacePath, { recursive: true });
      if (input.gitUrl) {
        try {
          const git = new GitTool(path.dirname(workspacePath));
          await git.clone(input.gitUrl, workspacePath, input.gitBranch);
        } catch (err) {
          await fs.rm(workspacePath, { recursive: true, force: true });
          throw new WorkspaceError(`Failed to clone repository: ${String(err)}`);
        }
      }
    }

    // If this folder is already registered, just reopen it (no duplicates)
    const existingRecords = await listWorkspaceRecords();
    const existing = existingRecords.find((r) => path.resolve(r.path) === workspacePath);
    if (existing) {
      await this.updateLastOpened(existing.id);
      return this.mapToWorkspace({ ...existing, lastOpenedAt: new Date().toISOString() });
    }

    const now = new Date().toISOString();
    const record: WorkspaceRecord = {
      id: generateId(),
      name: input.name || path.basename(workspacePath),
      description: input.description,
      ownerId: userId,
      path: workspacePath,
      gitUrl: input.gitUrl,
      gitBranch: input.gitBranch ?? 'main',
      status: 'active',
      isPinned: false,
      lastOpenedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await updateWorkspaceRecords((records) => {
      records.unshift(record);
    });

    return this.mapToWorkspace(record);
  }

  async findAll(_userId: string): Promise<Workspace[]> {
    const records = await listWorkspaceRecords();
    // Drop entries whose folder no longer exists on disk
    const alive: WorkspaceRecord[] = [];
    for (const r of records) {
      try {
        const stats = await fs.stat(r.path);
        if (stats.isDirectory()) alive.push(r);
      } catch {
        // folder was deleted/moved — hide from recents
      }
    }
    alive.sort((a, b) => (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt));
    return alive.map((r) => this.mapToWorkspace(r));
  }

  async findById(workspaceId: string, _userId: string): Promise<Workspace> {
    const records = await listWorkspaceRecords();
    const record = records.find((r) => r.id === workspaceId);
    if (!record) throw new NotFoundError('Workspace');
    return this.mapToWorkspace(record);
  }

  async update(workspaceId: string, userId: string, input: UpdateWorkspaceInput): Promise<Workspace> {
    await this.findById(workspaceId, userId); // existence check
    let updated: WorkspaceRecord | undefined;
    await updateWorkspaceRecords((records) => {
      const record = records.find((r) => r.id === workspaceId);
      if (record) {
        Object.assign(record, input, { updatedAt: new Date().toISOString() });
        updated = record;
      }
    });
    if (!updated) throw new NotFoundError('Workspace');
    return this.mapToWorkspace(updated);
  }

  /**
   * Remove a workspace from the recents list.
   * NEVER deletes the actual folder — it belongs to the user.
   */
  async delete(workspaceId: string, _userId: string): Promise<void> {
    await updateWorkspaceRecords((records) => records.filter((r) => r.id !== workspaceId));
  }

  async pin(workspaceId: string, userId: string, pin: boolean): Promise<Workspace> {
    return this.update(workspaceId, userId, { isPinned: pin } as UpdateWorkspaceInput);
  }

  async analyze(workspaceId: string, userId: string): Promise<object> {
    const ws = await this.findById(workspaceId, userId);
    const analyzer = new ProjectAnalyzer(ws.path);
    const summary = await analyzer.analyze();

    await updateWorkspaceRecords((records) => {
      const record = records.find((r) => r.id === workspaceId);
      if (record) record.projectSummary = summary;
    });

    return summary;
  }

  async updateLastOpened(workspaceId: string): Promise<void> {
    await updateWorkspaceRecords((records) => {
      const record = records.find((r) => r.id === workspaceId);
      if (record) record.lastOpenedAt = new Date().toISOString();
    });
  }

  /** Resolve a workspace's project summary (used by the agent). */
  async getRecord(workspaceId: string): Promise<WorkspaceRecord | undefined> {
    const records = await listWorkspaceRecords();
    return records.find((r) => r.id === workspaceId);
  }

  private mapToWorkspace(r: WorkspaceRecord): Workspace {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      ownerId: r.ownerId,
      path: r.path,
      gitUrl: r.gitUrl,
      gitBranch: r.gitBranch,
      status: r.status as Workspace['status'],
      isPinned: r.isPinned,
      lastOpenedAt: r.lastOpenedAt ? new Date(r.lastOpenedAt) : undefined,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }
}

export const workspaceService = new WorkspaceService();
