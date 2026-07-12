// ─────────────────────────────────────────────────────────────────────────────
// Memory Manager — Handles workspace & conversation memory
// ─────────────────────────────────────────────────────────────────────────────

import type { Memory, MemoryType } from '@ibm-agent/types';
import { generateId } from '@ibm-agent/shared';
import { WatsonxClient } from './watsonx-client';

export interface MemoryStore {
  save(memory: Memory): Promise<void>;
  find(workspaceId: string, type?: MemoryType, limit?: number): Promise<Memory[]>;
  search(workspaceId: string, query: string, limit?: number): Promise<Memory[]>;
  delete(id: string): Promise<void>;
  clear(workspaceId: string, type?: MemoryType): Promise<void>;
}

export class MemoryManager {
  constructor(
    private readonly store: MemoryStore,
    private readonly watsonx?: WatsonxClient,
  ) {}

  async remember(
    workspaceId: string,
    userId: string,
    type: MemoryType,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<Memory> {
    let embedding: number[] | undefined;

    if (this.watsonx) {
      try {
        const embeddings = await this.watsonx.embed([content]);
        embedding = embeddings[0];
      } catch {
        // Embeddings are optional — continue without them
      }
    }

    const memory: Memory = {
      id: generateId(),
      workspaceId,
      userId,
      type,
      content,
      metadata,
      embedding,
      createdAt: new Date(),
    };

    await this.store.save(memory);
    return memory;
  }

  async recall(workspaceId: string, query: string, limit = 10): Promise<Memory[]> {
    if (this.watsonx) {
      // Semantic search via embeddings
      return this.store.search(workspaceId, query, limit);
    }
    // Fallback: recent memories
    return this.store.find(workspaceId, undefined, limit);
  }

  async recallByType(workspaceId: string, type: MemoryType, limit = 10): Promise<Memory[]> {
    return this.store.find(workspaceId, type, limit);
  }

  async forget(memoryId: string): Promise<void> {
    await this.store.delete(memoryId);
  }

  async clearWorkspace(workspaceId: string, type?: MemoryType): Promise<void> {
    await this.store.clear(workspaceId, type);
  }
}
