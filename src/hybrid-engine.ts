/**
 * Hybrid Context Engine: LCM + Continuity
 * 
 * Combines lossless-claw's DAG-based compaction with continuity's cross-channel
 * subject tracking and recent-history injection.
 * 
 * Architecture:
 * - LCM handles long-term message storage and compaction
 * - Continuity handles cross-channel identity and recent history injection
 * - Both share the same message stream
 */

import type {
  ContextEngine,
  ContextEngineInfo,
  AssembleResult,
  BootstrapResult,
  CompactResult,
  IngestBatchResult,
  IngestResult,
  SubagentEndReason,
  SubagentSpawnPreparation,
  PluginRuntime,
} from "openclaw/plugin-sdk";
import { LcmContextEngine } from "./engine.js";
import type { LcmConfig } from "./db/config.js";
import type { LcmDependencies } from "./types.js";
import { ContinuityEngine } from "./continuity/engine.js";
import type { ContinuityService } from "./continuity/service.js";

type AssembleResultWithSystemPrompt = AssembleResult & { systemPromptAddition?: string };

export class HybridContextEngine implements ContextEngine {
  private lcm: LcmContextEngine;
  private continuity: ContinuityEngine;
  private logger?: PluginRuntime["logger"];

  constructor(
    private config: LcmConfig,
    private deps: LcmDependencies,
    private continuityService: ContinuityService,
  ) {
    this.logger = deps.runtime?.logger;
    
    // Initialize both engines
    this.lcm = new LcmContextEngine(config, deps);
    this.continuity = new ContinuityEngine(continuityService, deps.runtime?.logger);
  }

  info(): ContextEngineInfo {
    return {
      id: "lossless-claw-hybrid",
      name: "Lossless Claw + Continuity",
      version: this.lcm.info().version,
    };
  }

  async bootstrap(params: Parameters<ContextEngine["bootstrap"]>[0]): Promise<BootstrapResult> {
    // Bootstrap both engines
    const [lcmResult, continuityResult] = await Promise.all([
      this.lcm.bootstrap(params),
      this.continuity.bootstrap(params),
    ]);

    // Merge results (LCM takes priority for message handling)
    return {
      ...lcmResult,
      systemPromptAddition: this.mergeSystemPrompts(
        lcmResult.systemPromptAddition,
        continuityResult.systemPromptAddition,
      ),
    };
  }

  async ingest(params: Parameters<ContextEngine["ingest"]>[0]): Promise<IngestResult> {
    // Both engines ingest the same message
    const [lcmResult, continuityResult] = await Promise.all([
      this.lcm.ingest(params),
      this.continuity.ingest(params),
    ]);

    return {
      ingested: lcmResult.ingested || continuityResult.ingested,
    };
  }

  async ingestBatch(
    params: Parameters<ContextEngine["ingestBatch"]>[0],
  ): Promise<IngestBatchResult> {
    // Both engines ingest the batch
    const [lcmResult, continuityResult] = await Promise.all([
      this.lcm.ingestBatch(params),
      this.continuity.ingestBatch(params),
    ]);

    return {
      ingested: lcmResult.ingested + continuityResult.ingested,
    };
  }

  async assemble(
    params: Parameters<ContextEngine["assemble"]>[0],
  ): Promise<AssembleResultWithSystemPrompt> {
    // Get LCM's assembled context (DAG-based compaction)
    const lcmResult = (await this.lcm.assemble(params)) as AssembleResultWithSystemPrompt;

    // Get continuity's cross-channel recent history
    const continuityResult = (await this.continuity.assemble(
      params,
    )) as AssembleResultWithSystemPrompt;

    // Merge: LCM provides the base context, continuity adds cross-channel recent history
    return {
      messages: lcmResult.messages, // Use LCM's compacted messages
      estimatedTokens: lcmResult.estimatedTokens,
      systemPromptAddition: this.mergeSystemPrompts(
        lcmResult.systemPromptAddition,
        continuityResult.systemPromptAddition,
      ),
    };
  }

  async compact(params: Parameters<ContextEngine["compact"]>[0]): Promise<CompactResult> {
    // Only LCM handles compaction (continuity doesn't compact)
    return this.lcm.compact(params);
  }

  async afterTurn(params: Parameters<ContextEngine["afterTurn"]>[0]): Promise<void> {
    // Both engines handle after-turn cleanup
    await Promise.all([this.lcm.afterTurn(params), this.continuity.afterTurn(params)]);
  }

  async beforeSubagentSpawn(
    params: Parameters<ContextEngine["beforeSubagentSpawn"]>[0],
  ): Promise<SubagentSpawnPreparation | undefined> {
    // Use LCM's subagent spawn logic
    return this.lcm.beforeSubagentSpawn(params);
  }

  async afterSubagentEnd(
    params: Parameters<ContextEngine["afterSubagentEnd"]>[0],
  ): Promise<void> {
    // Both engines handle subagent cleanup
    await Promise.all([this.lcm.afterSubagentEnd(params), this.continuity.afterSubagentEnd(params)]);
  }

  private mergeSystemPrompts(
    lcmPrompt: string | undefined,
    continuityPrompt: string | undefined,
  ): string | undefined {
    if (!lcmPrompt && !continuityPrompt) {
      return undefined;
    }
    
    const parts: string[] = [];
    
    if (continuityPrompt) {
      // Continuity's cross-channel context goes first (more recent/relevant)
      parts.push(continuityPrompt);
    }
    
    if (lcmPrompt) {
      // LCM's DAG summaries go second (broader context)
      parts.push(lcmPrompt);
    }
    
    return parts.join("\n\n");
  }
}
