/**
 * SDK Compatibility Layer
 * 
 * Bridges the gap between continuity's expected SDK types and the current
 * OpenClaw plugin SDK. This allows continuity code to work without modification.
 */

import type { PluginRuntime as CurrentPluginRuntime, RuntimeLogger } from "openclaw/plugin-sdk";

/**
 * PluginLogger type that continuity expects.
 * In the current SDK, this is RuntimeLogger.
 */
export type PluginLogger = RuntimeLogger;

/**
 * Re-export the current PluginRuntime as-is.
 */
export type PluginRuntime = CurrentPluginRuntime;

/**
 * ContextEngine interface that continuity expects.
 * The current SDK may not export this directly, so we define it here.
 */
export interface ContextEngine {
  info(): ContextEngineInfo;
  bootstrap(params: BootstrapParams): Promise<BootstrapResult>;
  ingest(params: IngestParams): Promise<IngestResult>;
  ingestBatch(params: IngestBatchParams): Promise<IngestBatchResult>;
  assemble(params: AssembleParams): Promise<AssembleResult>;
  compact(params: CompactParams): Promise<CompactResult>;
  afterTurn?(params: AfterTurnParams): Promise<void>;
  beforeSubagentSpawn?(params: BeforeSubagentSpawnParams): Promise<SubagentSpawnPreparation | undefined>;
  afterSubagentEnd?(params: AfterSubagentEndParams): Promise<void>;
}

export interface ContextEngineInfo {
  id: string;
  name: string;
  version?: string;
}

export interface BootstrapParams {
  sessionKey: string;
  transcript?: unknown[];
}

export interface BootstrapResult {
  messages: unknown[];
  estimatedTokens: number;
  systemPromptAddition?: string;
}

export interface IngestParams {
  sessionKey: string;
  message: unknown;
  attemptId?: string;
}

export interface IngestResult {
  ingested: boolean;
}

export interface IngestBatchParams {
  sessionKey: string;
  messages: unknown[];
}

export interface IngestBatchResult {
  ingested: number;
}

export interface AssembleParams {
  sessionKey: string;
  sessionId?: string;
  contextWindow?: number;
  prompt?: string;
}

export interface AssembleResult {
  messages: unknown[];
  estimatedTokens: number;
  systemPromptAddition?: string;
}

export interface CompactParams {
  sessionKey: string;
  reason?: string;
  force?: boolean;
}

export interface CompactResult {
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
}

export interface AfterTurnParams {
  sessionKey: string;
  attemptId?: string;
}

export interface BeforeSubagentSpawnParams {
  sessionKey: string;
  parentSessionKey?: string;
}

export interface SubagentSpawnPreparation {
  [key: string]: unknown;
}

export interface AfterSubagentEndParams {
  sessionKey: string;
  parentSessionKey?: string;
  reason?: string;
}
