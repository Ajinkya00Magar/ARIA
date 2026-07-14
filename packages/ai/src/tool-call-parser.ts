// ─────────────────────────────────────────────────────────────────────────────
// Fallback Tool-Call Parser
// Granite / Orchestrate models sometimes emit tool arguments as plain-text
// markdown JSON blocks instead of using the native tool_calls API, e.g.:
//
//   ```json
//   { "tool": "write_file", "arguments": { "path": "a.py", "content": "..." } }
//   ```
//
// This module scans assistant text for such blocks, strictly validates them
// against the AGENT_TOOLS schemas, and synthesizes OpenAI-style tool calls so
// the agent loop can actually execute them. Blocks that do not validate are
// left untouched (e.g. the model showing example JSON to the user).
// ─────────────────────────────────────────────────────────────────────────────

import type { ToolDefinition, ToolParameterDefinition } from '@ibm-agent/types';
import { generateId } from '@ibm-agent/shared';
import { AGENT_TOOLS, getToolByName } from './tools';

/** OpenAI-compatible tool call shape (matches native tool_calls entries) */
export interface SynthesizedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolCallExtraction {
  /** Validated tool calls synthesized from markdown JSON blocks */
  toolCalls: SynthesizedToolCall[];
  /** The content with consumed JSON blocks removed, for a clean chat UI */
  cleanedContent: string;
}

// Matches fenced code blocks, optionally tagged as json
const FENCED_BLOCK_RE = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g;

// Keys the model may use to name the tool in an explicit call object
const NAME_KEYS = ['tool', 'name', 'tool_name', 'function_name', 'action'] as const;
// Keys the model may use for the arguments object
const ARGS_KEYS = ['arguments', 'args', 'parameters', 'params', 'input', 'tool_input'] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Basic JSON-schema type check for a single value */
function matchesType(value: unknown, def: ToolParameterDefinition): boolean {
  switch (def.type) {
    case 'string':
      return typeof value === 'string' && (!def.enum || def.enum.includes(value));
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value) && (!def.items || value.every((v) => matchesType(v, def.items!)));
    case 'object':
      return isPlainObject(value);
    default:
      return false;
  }
}

/**
 * Strictly validate an arguments object against a tool schema:
 * every required property present, no unknown properties, all types match.
 */
export function validateArgsAgainstTool(
  tool: ToolDefinition,
  args: Record<string, unknown>,
): boolean {
  const { properties, required = [] } = tool.parameters;

  for (const req of required) {
    if (!(req in args)) return false;
  }
  for (const [key, value] of Object.entries(args)) {
    const def = properties[key];
    if (!def) return false; // unknown property → not a call to this tool
    if (!matchesType(value, def)) return false;
  }
  return true;
}

/**
 * Infer which tool a bare arguments object belongs to.
 * Returns the tool ONLY when exactly one schema matches — ambiguity
 * (e.g. `{ "path": "x" }` matches read_file/delete_file/create_folder)
 * yields null so we never guess at destructive actions.
 */
function inferToolFromArgs(args: Record<string, unknown>): ToolDefinition | null {
  if (Object.keys(args).length === 0) return null;
  const matches = AGENT_TOOLS.filter(
    (t) => (t.parameters.required?.length ?? 0) > 0 && validateArgsAgainstTool(t, args),
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Normalize one parsed JSON candidate into zero or more validated tool calls */
function candidateToToolCalls(candidate: unknown): SynthesizedToolCall[] {
  // Array of calls → flatten
  if (Array.isArray(candidate)) {
    return candidate.flatMap((c) => candidateToToolCalls(c));
  }
  if (!isPlainObject(candidate)) return [];

  // Wrapper: { "tool_calls": [...] }
  if (Array.isArray(candidate.tool_calls)) {
    return candidate.tool_calls.flatMap((c) => candidateToToolCalls(c));
  }

  // OpenAI shape: { "function": { "name": ..., "arguments": {...} | "..." } }
  if (isPlainObject(candidate.function) && typeof candidate.function.name === 'string') {
    let fnArgs: unknown = candidate.function.arguments;
    if (typeof fnArgs === 'string') {
      try {
        fnArgs = JSON.parse(fnArgs);
      } catch {
        return [];
      }
    }
    return buildCall(candidate.function.name, fnArgs);
  }

  // Explicit shape: { "tool": "write_file", "arguments": {...} }
  const nameKey = NAME_KEYS.find((k) => typeof candidate[k] === 'string');
  if (nameKey) {
    const argsKey = ARGS_KEYS.find((k) => isPlainObject(candidate[k]));
    if (argsKey) {
      return buildCall(candidate[nameKey] as string, candidate[argsKey]);
    }
    // Flat shape: { "tool": "delete_file", "path": "x" } — args mixed at top level
    const rest: Record<string, unknown> = { ...candidate };
    delete rest[nameKey];
    return buildCall(candidate[nameKey] as string, rest);
  }

  // Bare args object: { "path": "a.py", "content": "..." } → infer by schema
  const inferred = inferToolFromArgs(candidate);
  if (inferred) {
    return buildCall(inferred.name, candidate);
  }
  return [];
}

function buildCall(name: string, args: unknown): SynthesizedToolCall[] {
  const tool = getToolByName(name);
  if (!tool || !isPlainObject(args)) return [];
  if (!validateArgsAgainstTool(tool, args)) return [];
  return [
    {
      id: `fallback_${generateId()}`,
      type: 'function',
      function: { name: tool.name, arguments: JSON.stringify(args) },
    },
  ];
}

/**
 * Scan assistant text for markdown JSON blocks that are actually tool calls.
 * Only blocks that strictly validate against a known tool schema are consumed;
 * everything else is left in the content untouched.
 */
export function extractToolCallsFromText(content: string): ToolCallExtraction {
  const toolCalls: SynthesizedToolCall[] = [];
  if (!content) {
    return { toolCalls, cleanedContent: content };
  }

  let cleanedContent = content;

  // Pass 1: fenced ```json blocks
  if (cleanedContent.includes('```')) {
    cleanedContent = cleanedContent.replace(FENCED_BLOCK_RE, (block, inner: string) => {
      const raw = inner.trim();
      if (!raw.startsWith('{') && !raw.startsWith('[')) return block;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return block; // not valid JSON — leave as-is
      }

      const calls = candidateToToolCalls(parsed);
      if (calls.length === 0) return block; // JSON, but not a valid tool call

      toolCalls.push(...calls);
      return ''; // consume the block so the chat UI stays clean
    });
  }

  // Pass 2: bare (unfenced) JSON tool calls embedded in the text, e.g.
  //   {"tool": "write_file", "arguments": {...}}
  // Only objects that explicitly name a tool are considered — bare-args
  // inference is NOT applied here to keep false positives impossible.
  if (toolCalls.length === 0) {
    const extracted = extractBareJsonToolCalls(cleanedContent);
    toolCalls.push(...extracted.toolCalls);
    cleanedContent = extracted.cleanedContent;
  }

  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n').trim();

  return { toolCalls, cleanedContent };
}

// Finds the start of an object that names a tool explicitly
const BARE_CALL_START_RE = /\{\s*"(?:tool|name|tool_name|function_name|action|function|tool_calls)"\s*:/g;

/** Extract balanced-brace JSON objects that are explicit tool calls */
function extractBareJsonToolCalls(content: string): ToolCallExtraction {
  const toolCalls: SynthesizedToolCall[] = [];
  const consumed: Array<{ start: number; end: number }> = [];

  BARE_CALL_START_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BARE_CALL_START_RE.exec(content)) !== null) {
    const start = match.index;
    // Skip if inside an already-consumed region
    if (consumed.some((r) => start >= r.start && start < r.end)) continue;

    const end = findBalancedEnd(content, start);
    if (end === -1) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.slice(start, end + 1));
    } catch {
      continue;
    }

    const calls = candidateToToolCalls(parsed);
    if (calls.length === 0) continue;

    toolCalls.push(...calls);
    consumed.push({ start, end: end + 1 });
    BARE_CALL_START_RE.lastIndex = end + 1;
  }

  if (consumed.length === 0) {
    return { toolCalls, cleanedContent: content };
  }

  // Remove consumed regions (right to left so indices stay valid)
  let cleanedContent = content;
  for (const r of consumed.sort((a, b) => b.start - a.start)) {
    cleanedContent = cleanedContent.slice(0, r.start) + cleanedContent.slice(r.end);
  }
  return { toolCalls, cleanedContent };
}

/** Index of the matching closing brace, honoring JSON strings/escapes; -1 if unbalanced */
function findBalancedEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++; // skip escaped char
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
