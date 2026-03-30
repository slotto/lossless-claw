import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { PluginLogger } from "./sdk-compat.js";
import type { ContinuityAgentMessage } from "./types.js";
import type { ContinuityService } from "./service.js";

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
    messages: ContinuityAgentMessage[];
    tokenBudget?: number;
  }): Promise<AssembleResult> {
    return {
      messages: params.messages,
      estimatedTokens: 0,
    };
  }

  async afterTurn(params: {
    sessionId: string;
    sessionFile: string;
    messages: ContinuityAgentMessage[];
    prePromptMessageCount: number;
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    runtimeContext?: Record<string, unknown>;
  }): Promise<void> {
    if (params.isHeartbeat) {
      return;
    }

    const runtimeContext = params.runtimeContext;
    const sessionKey =
      runtimeContext && typeof runtimeContext.sessionKey === "string"
        ? runtimeContext.sessionKey
        : undefined;
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

    const runtimeAgentId =
      runtimeContext && typeof runtimeContext.agentId === "string" ? runtimeContext.agentId : undefined;

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
