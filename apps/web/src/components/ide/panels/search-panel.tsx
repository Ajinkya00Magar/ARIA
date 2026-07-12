'use client';

import { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { cn } from '@/lib/utils';

interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  context: string[];
}

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { currentWorkspace } = useWorkspaceStore();

  const { data: results, isFetching } = useQuery({
    queryKey: ['search', currentWorkspace?.id, debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || !currentWorkspace) return [];
      const res = await apiClient.post<{ data: SearchResult[] }>(
        `/files/${currentWorkspace.id}/search`,
        { pattern: debouncedQuery },
      );
      return res.data.data;
    },
    enabled: !!debouncedQuery && !!currentWorkspace,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') setDebouncedQuery(query);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Search
        </p>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search (Enter to search)"
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-input rounded text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isFetching && (
          <div className="px-4 py-3 text-xs text-muted-foreground animate-pulse">Searching…</div>
        )}
        {results && results.length === 0 && debouncedQuery && (
          <div className="px-4 py-3 text-xs text-muted-foreground">No results found</div>
        )}
        {results?.map((result, i) => (
          <div key={i} className="border-b border-border last:border-0">
            <div className="px-3 py-1.5 bg-muted/30">
              <span className="text-xs font-medium text-primary truncate">{result.file}</span>
            </div>
            {result.context.map((line, j) => (
              <div
                key={j}
                className={cn(
                  'px-3 py-0.5 font-mono text-xs cursor-pointer hover:bg-muted/50',
                  j === 1 && 'bg-primary/5 text-foreground',
                  j !== 1 && 'text-muted-foreground',
                )}
              >
                <span className="text-muted-foreground/60 mr-2 select-none">
                  {result.line - 1 + j}
                </span>
                {line}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
