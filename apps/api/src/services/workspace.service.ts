// ─────────────────────────────────────────────────────────────────────────────
// Workspace Service — Supabase implementation
// ─────────────────────────────────────────────────────────────────────────────

import type { Workspace } from '@ibm-agent/types';
import { NotFoundError, WorkspaceError, generateId } from '@ibm-agent/shared';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@ibm-agent/shared';
import {
  listWorkspaceRecords,
  insertWorkspaceRecord,
  patchWorkspaceRecord,
  deleteWorkspaceRecord,
  type WorkspaceRecord,
} from '../lib/store';

export class WorkspaceService {
  async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    if (!input.name && !input.path) {
      throw new WorkspaceError('A workspace name or path is required.');
    }

    const now = new Date().toISOString();
    const record: WorkspaceRecord = {
      id: generateId(),
      name: input.name || input.path || 'Untitled Workspace',
      description: input.description,
      ownerId: userId,
      path: input.path || `/${generateId()}`,
      gitUrl: input.gitUrl,
      gitBranch: input.gitBranch ?? 'main',
      status: 'active',
      isPinned: false,
      lastOpenedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await insertWorkspaceRecord(record);
    return this.mapToWorkspace(record);
  }

  async findAll(userId: string): Promise<Workspace[]> {
    const records = await listWorkspaceRecords(userId);
    return records.map((r) => this.mapToWorkspace(r));
  }

  async findById(workspaceId: string, userId: string): Promise<Workspace> {
    const records = await listWorkspaceRecords(userId);
    const record = records.find((r) => r.id === workspaceId);
    if (!record) throw new NotFoundError('Workspace');
    return this.mapToWorkspace(record);
  }

  async update(workspaceId: string, userId: string, input: UpdateWorkspaceInput): Promise<Workspace> {
    await this.findById(workspaceId, userId); // existence check
    
    const updates = {
      ...input,
      updatedAt: new Date().toISOString()
    };
    
    await patchWorkspaceRecord(workspaceId, updates);
    return this.findById(workspaceId, userId);
  }

  async delete(workspaceId: string, userId: string): Promise<void> {
    await this.findById(workspaceId, userId); // existence check
    await deleteWorkspaceRecord(workspaceId);
  }

  async pin(workspaceId: string, userId: string, pin: boolean): Promise<Workspace> {
    return this.update(workspaceId, userId, { isPinned: pin } as UpdateWorkspaceInput);
  }

  async analyze(workspaceId: string, userId: string): Promise<object> {
    // ProjectAnalyzer uses local fs, so we return a stub for web-mode
    const summary = { message: "Project analysis is disabled in web mode." };
    await patchWorkspaceRecord(workspaceId, { projectSummary: summary });
    return summary;
  }

  async updateLastOpened(workspaceId: string): Promise<void> {
    await patchWorkspaceRecord(workspaceId, { lastOpenedAt: new Date().toISOString() });
  }

  async getRecord(workspaceId: string, userId: string): Promise<WorkspaceRecord | undefined> {
    const records = await listWorkspaceRecords(userId);
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
