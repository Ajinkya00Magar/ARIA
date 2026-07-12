// ─────────────────────────────────────────────────────────────────────────────
// Workspace Service
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import { eq, and, desc } from 'drizzle-orm';
import type { Workspace } from '@ibm-agent/types';
import { NotFoundError, AuthorizationError, WorkspaceError, generateId } from '@ibm-agent/shared';
import { getDb } from '../db/connection';
import { workspaces, workspaceMembers } from '../db/schema';
import { GitTool } from '@ibm-agent/tools';
import { ProjectAnalyzer } from '@ibm-agent/tools';
import { env } from '../lib/env';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@ibm-agent/shared';

export class WorkspaceService {
  private getWorkspacePath(workspaceId: string): string {
    return path.join(env.WORKSPACE_ROOT, workspaceId);
  }

  async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    console.log("WorkspaceService.create called with", {userId, input});
    const db = getDb();
    console.log("Got DB");
    const workspaceId = generateId();
    let workspacePath = this.getWorkspacePath(workspaceId);
    let isExisting = false;

    if (input.path) {
      console.log("Resolving custom path:", input.path);
      workspacePath = path.resolve(input.path);
      try {
        const stats = await fs.stat(workspacePath);
        if (stats.isDirectory()) {
          console.log("Custom path exists as directory");
          isExisting = true;
        }
      } catch (err) {
        console.log("Custom path does not exist, will create");
      }
    }

    if (!isExisting) {
      console.log("Creating directory:", workspacePath);
      await fs.mkdir(workspacePath, { recursive: true });

      if (input.gitUrl) {
        console.log("Cloning from Git");
        try {
          const git = new GitTool(path.dirname(workspacePath));
          await git.clone(input.gitUrl, workspacePath, input.gitBranch);
        } catch (err) {
          console.error("Git clone failed", err);
          await fs.rm(workspacePath, { recursive: true, force: true });
          throw new WorkspaceError(`Failed to clone repository: ${String(err)}`);
        }
      } else {
        console.log("Initializing Git");
        const git = new GitTool(workspacePath);
        await git.init();
        console.log("Git initialized");
      }
    }

    console.log("Inserting into workspaces table");
    const [ws] = await db
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: input.name,
        description: input.description,
        ownerId: userId,
        path: workspacePath,
        gitUrl: input.gitUrl,
        gitBranch: input.gitBranch ?? 'main',
      })
      .returning();

    // Add owner as member
    await db.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId,
      role: 'admin',
    });

    return this.mapToWorkspace(ws);
  }

  async findAll(userId: string): Promise<Workspace[]> {
    const db = getDb();
    const result = await db
      .select({ ws: workspaces })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .orderBy(desc(workspaces.lastOpenedAt), desc(workspaces.updatedAt));

    return result.map((r) => this.mapToWorkspace(r.ws));
  }

  async findById(workspaceId: string, userId: string): Promise<Workspace> {
    const db = getDb();
    const [result] = await db
      .select({ ws: workspaces })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!result) throw new NotFoundError('Workspace');
    return this.mapToWorkspace(result.ws);
  }

  async update(workspaceId: string, userId: string, input: UpdateWorkspaceInput): Promise<Workspace> {
    await this.findById(workspaceId, userId); // access check

    const db = getDb();
    const [ws] = await db
      .update(workspaces)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return this.mapToWorkspace(ws);
  }

  async delete(workspaceId: string, userId: string): Promise<void> {
    const db = getDb();
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!ws) throw new NotFoundError('Workspace');
    if (ws.ownerId !== userId) throw new AuthorizationError('Only workspace owner can delete');

    // Delete physical files
    try {
      await fs.rm(ws.path, { recursive: true, force: true });
    } catch {
      // Log but continue with DB delete
    }

    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  }

  async pin(workspaceId: string, userId: string, pin: boolean): Promise<Workspace> {
    await this.findById(workspaceId, userId);
    const db = getDb();
    const [ws] = await db
      .update(workspaces)
      .set({ isPinned: pin })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    return this.mapToWorkspace(ws);
  }

  async analyze(workspaceId: string, userId: string): Promise<object> {
    const ws = await this.findById(workspaceId, userId);
    const db = getDb();

    const analyzer = new ProjectAnalyzer(ws.path);
    const summary = await analyzer.analyze();

    await db
      .update(workspaces)
      .set({ projectSummary: summary as unknown as object })
      .where(eq(workspaces.id, workspaceId));

    return summary;
  }

  async updateLastOpened(workspaceId: string): Promise<void> {
    const db = getDb();
    await db
      .update(workspaces)
      .set({ lastOpenedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
  }

  private mapToWorkspace(ws: typeof workspaces.$inferSelect): Workspace {
    return {
      id: ws.id,
      name: ws.name,
      description: ws.description ?? undefined,
      ownerId: ws.ownerId,
      path: ws.path,
      gitUrl: ws.gitUrl ?? undefined,
      gitBranch: ws.gitBranch ?? undefined,
      status: ws.status as Workspace['status'],
      isPinned: ws.isPinned,
      lastOpenedAt: ws.lastOpenedAt ?? undefined,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    };
  }
}

export const workspaceService = new WorkspaceService();
