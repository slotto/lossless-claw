import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { PluginLogger } from "./sdk-compat.js";
import type { ContinuityAgentMessage } from "./types.js";
import type { ContinuityService } from "./service.js";
import { resolveSessionAgentId } from "./session-key.js";

type ContextEngineInfo = {
  id: string;
  name: string;
  version?: string;
};

type IngestResult = {
  ingested: boolean;
};

type AssembleResult = {
  messages: ContinuityAgentMessage[];
  estimatedTokens: number;
  systemPromptAddition?: string;
};

type CompactResult = {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    summary?: string;
    firstKeptEntryId?: string;
    tokensBefore: number;
    tokensAfter?: number;
    details?: unknown;
  };
};

type CompactDelegateResult = {
  ok: boolean;
  compacted: boolean;
  reason?: string;
  result?: {
    summary?: string;
    firstKeptEntryId?: string;
    tokensBefore: number;
    tokensAfter?: number;
    details?: unknown;
  };
};

type CompactDelegateFn = (params: Record<string, unknown>) => Promise<CompactDelegateResult>;

type CompactDelegateState = {
  resolved: boolean;
  delegate: CompactDelegateFn | null;
  warnedResolutionFailure: boolean;
};

const compactDelegateState: CompactDelegateState = {
  resolved: false,
  delegate: null,
  warnedResolutionFailure: false,
};

async function resolveCompactDelegate(logger?: PluginLogger): Promise<CompactDelegateFn | null> {
  if (compactDelegateState.resolved) {
    return compactDelegateState.delegate;
  }
  compactDelegateState.resolved = true;

  const require = createRequire(import.meta.url);
  let packageRoot: string | null = null;
  try {
    packageRoot = path.dirname(require.resolve("openclaw/package.json"));
  } catch {
    packageRoot = null;
  }

  const candidates = packageRoot
    ? [
        path.join(packageRoot, "dist", "agents", "pi-embedded-runner", "compact.runtime.js"),
        path.join(packageRoot, "dist", "agents", "pi-embedded-runner", "compact.js"),
        path.join(packageRoot, "src", "agents", "pi-embedded-runner", "compact.runtime.js"),
        path.join(packageRoot, "src", "agents", "pi-embedded-runner", "compact.js"),
      ]
    : [];

  /* v8 ignore start */
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      const imported = (await import(pathToFileURL(candidate).href)) as {
        compactEmbeddedPiSessionDirect?: CompactDelegateFn;
      };
      if (typeof imported.compactEmbeddedPiSessionDirect === "function") {
        compactDelegateState.delegate = imported.compactEmbeddedPiSessionDirect;
        return compactDelegateState.delegate;
      }
    } catch {
      // Try next candidate.
    }
  }
  /* v8 ignore stop */

  compactDelegateState.warnedResolutionFailure = true;
  logger?.warn(
    "continuity compact delegate unavailable; using non-compacting fallback",
  );

  compactDelegateState.delegate = null;
  return null;
}

function resolveNewTurnMessages(params: {
  messages: ContinuityAgentMessage[];
  prePromptMessageCount: number;
}): ContinuityAgentMessage[] {
  const boundary = Number.isFinite(params.prePromptMessageCount)
    ? Math.trunc(params.prePromptMessageCount)
    : -1;
  if (boundary >= 0 && boundary <= params.messages.length) {
    return params.messages.slice(boundary);
  }

  // Compaction can rewrite history before afterTurn executes, making the original
  // pre-prompt boundary stale. Fall back to the trailing user->assistant window.
  const tail: ContinuityAgentMessage[] = [];
  for (let index = params.messages.length - 1; index >= 0 && tail.length < 4; index -= 1) {
    const message = params.messages[index];
    if (!message || (message.role !== "user" && message.role !== "assistant")) {
      continue;
    }
    tail.unshift(message);
    if (message.role === "user") {
      return tail;
    }
  }

  return [];
}

function fallbackCompactResult(): CompactResult {
  return {
    ok: true,
    compacted: false,
    reason: "continuity compact delegate unavailable",
  };
}

function mapCompactResult(result: CompactDelegateResult): CompactResult {
  return {
    ok: result.ok,
    compacted: result.compacted,
    reason: result.reason,
    result: result.result
      ? {
          summary: result.result.summary,
          firstKeptEntryId: result.result.firstKeptEntryId,
          tokensBefore: result.result.tokensBefore,
          tokensAfter: result.result.tokensAfter,
          details: result.result.details,
        }
      : undefined,
  };
}

export class ContinuityContextEngine {
  readonly info: ContextEngineInfo = {
    id: "continuity",
    name: "Continuity Context Engine",
    version: "0.1.0",
  };

  constructor(
    private readonly params: {
      service: ContinuityService;
      logger?: PluginLogger;
      agentId?: string;
    },
  ) {}

  async bootstrap(_params: {
    sessionId: string;
    sessionFile: string;
  }): Promise<{ bootstrapped: boolean; reason?: string }> {
    return { bootstrapped: false, reason: "continuity bootstraps lazily" };
  }

  async ingest(_params: {
    sessionId: string;
    message: ContinuityAgentMessage;
    isHeartbeat?: boolean;
  }): Promise<IngestResult> {
    return { ingested: false };
  }

  async assemble(params: {
    sessionId: string;
    sessionKey?: string;
    messages: ContinuityAgentMessage[];
    tokenBudget?: number;
  }): Promise<AssembleResult> {
    // Debug logging
    console.log('[continuity] assemble called:', {
      sessionKey: params.sessionKey,
      messageCount: params.messages.length,
      hasBudget: !!params.tokenBudget
    });
    
    // Get agent ID from session or use configured agent
    const agentId = this.params.agentId ?? resolveSessionAgentId(params.sessionKey);
    
    console.log('[continuity] assemble: agentId =', agentId, 'sessionKey =', params.sessionKey);
    
    if (!agentId || !params.sessionKey) {
      // No agent ID or session key - can't inject context
      console.log('[continuity] assemble: early return (no agentId or sessionKey)');
      return {
        messages: params.messages,
        estimatedTokens: 0,
      };
    }

    try {
      // Read recent.json for this agent
      const recentStore = await this.params.service.readRecentStore(agentId);
      
      // Filter entries for cross-channel injection
      const relevantEntries = recentStore.entries.filter(entry => {
        // Skip entries from current session (already in messages)
        if (entry.sessionKey === params.sessionKey) {
          return false;
        }
        
        // Only include if this agent was a participant
        if (!entry.participants?.includes(agentId)) {
          return false;
        }
        
        // Only include recent entries (within TTL)
        const config = this.params.service.currentPluginConfig();
        const ttlMs = (config.recent.ttlHours ?? 48) * 60 * 60 * 1000;
        const cutoff = Date.now() - ttlMs;
        if (entry.createdAt < cutoff) {
          return false;
        }
        
        return true;
      });
      
      // Take the 5 most recent cross-channel entries
      const contextEntries = relevantEntries
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .reverse();  // Show oldest first
      
      console.log('[continuity] assemble: filtered', {
        totalEntries: recentStore.entries.length,
        relevantEntries: relevantEntries.length,
        contextEntries: contextEntries.length,
        agentId
      });
      
      if (contextEntries.length === 0) {
        // No cross-channel context to inject
        console.log('[continuity] assemble: no cross-channel context to inject');
        return {
          messages: params.messages,
          estimatedTokens: 0,
        };
      }
      
      // Convert entries to context messages
      const contextMessages: ContinuityAgentMessage[] = contextEntries.map(entry => ({
        role: entry.role,
        content: `[Recent context from another channel]: ${entry.text}`,
        timestamp: entry.createdAt,
      }));
      
      // Inject context before current messages
      return {
        messages: [
          ...contextMessages,
          ...params.messages,
        ],
        estimatedTokens: contextMessages.reduce((sum, msg) => 
          sum + (typeof msg.content === 'string' ? msg.content.length / 4 : 0), 0
        ),
      };
    } catch (error) {
      // If injection fails, fall back to original messages
      console.error('[continuity] assemble failed:', error);
      return {
        messages: params.messages,
        estimatedTokens: 0,
      };
    }
  }

  async afterTurn(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    messages: ContinuityAgentMessage[];
    prePromptMessageCount: number;
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    runtimeContext?: Record<string, unknown>;
  }): Promise<void> {
    // Debug logging
    // Debug logging with details
    try {
      const fs = require("fs");
      const log = new Date().toISOString() + 
        " afterTurn: isHeartbeat=" + params.isHeartbeat +
        " sessionKey=" + (params.sessionKey ? params.sessionKey.substring(0, 30) : "MISSING") +
        " messages=" + params.messages.length +
        " prePrompt=" + params.prePromptMessageCount + "\n";
      fs.appendFileSync("/tmp/continuity-afterturn.log", log);
    } catch {}
    if (params.isHeartbeat) {
      return;
    }

    // Use top-level sessionKey (SDK contract)
    const sessionKey = params.sessionKey;
    if (!sessionKey) {
      return;
    }

    const newMessages = resolveNewTurnMessages({
      messages: params.messages,
      prePromptMessageCount: params.prePromptMessageCount,
    });
    if (newMessages.length === 0) {
      return;
    }

    const runtimeAgentId = params.runtimeContext?.agentId as string | undefined;

    try { require("fs").appendFileSync("/tmp/continuity-afterturn.log", new Date().toISOString() + " calling captureTurn with " + newMessages.length + " messages\n"); } catch {}
    await this.params.service.captureTurn({
      agentId: this.params.agentId ?? runtimeAgentId,
      sessionId: params.sessionId,
      sessionKey,
      messages: newMessages,
    });
  }

  async compact(params: {
    sessionId: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: "budget" | "threshold";
    customInstructions?: string;
    runtimeContext?: Record<string, unknown>;
  }): Promise<CompactResult> {
    const delegate = await resolveCompactDelegate(this.params.logger);
    if (!delegate) {
      return fallbackCompactResult();
    }

    const runtimeContext =
      params.runtimeContext && typeof params.runtimeContext === "object"
        ? params.runtimeContext
        : {};

    const workspaceDir =
      typeof runtimeContext.workspaceDir === "string" && runtimeContext.workspaceDir.trim()
        ? runtimeContext.workspaceDir
        : process.cwd();

    try {
      const result = await delegate({
        ...runtimeContext,
        sessionId: params.sessionId,
        sessionFile: params.sessionFile,
        tokenBudget: params.tokenBudget,
        force: params.force,
        customInstructions: params.customInstructions,
        workspaceDir,
      });
      return mapCompactResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.params.logger?.warn?.(`continuity compact delegate failed: ${message}`);
      return {
        ok: false,
        compacted: false,
        reason: "continuity compact delegate failed",
      };
    }
  }

  async dispose(): Promise<void> {
    // No-op.
  }
}

export function resetCompactDelegateForTesting(): void {
  compactDelegateState.resolved = false;
  compactDelegateState.delegate = null;
  compactDelegateState.warnedResolutionFailure = false;
}

export function setCompactDelegateForTesting(
  delegate: ((params: Record<string, unknown>) => Promise<CompactDelegateResult>) | null,
): void {
  compactDelegateState.resolved = true;
  compactDelegateState.delegate = delegate;
}
