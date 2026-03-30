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

import type { DatabaseSync } from "node:sqlite";
import type {
  ContextEngine,
  ContextEngineInfo,
  AssembleResult,
  BootstrapResult,
  CompactResult,
  IngestBatchResult,
  IngestResult,
} from "openclaw/plugin-sdk";
import { LcmContextEngine } from "./engine.js";
import type { LcmDependencies } from "./types.js";
import { ContinuityContextEngine } from "./continuity/engine.js";
import type { ContinuityService } from "./continuity/service.js";
import type { PluginLogger } from "./continuity/sdk-compat.js";

export class HybridContextEngine implements ContextEngine {
  private lcm: LcmContextEngine;
  private continuity: ContinuityContextEngine;

  constructor(
    deps: LcmDependencies,
    database: DatabaseSync,
    continuityService: ContinuityService,
    logger?: PluginLogger,
  ) {
    // Initialize both engines
    this.lcm = new LcmContextEngine(deps, database);
    this.continuity = new ContinuityContextEngine({
      service: continuityService,
      logger,
    });
    
    // Bind optional lifecycle methods from LCM
    this.prepareSubagentSpawn = this.lcm.prepareSubagentSpawn?.bind(this.lcm);
  }

  readonly info: ContextEngineInfo = {
    id: "lossless-claw-hybrid",
    name: "Lossless Claw + Continuity",
    version: "0.1.0-hybrid",
    ownsCompaction: true,
  };

  async bootstrap(
    params: Parameters<ContextEngine["bootstrap"]>[0],
  ): Promise<BootstrapResult> {
    // Bootstrap both engines in parallel
    const lcmPromise = this.lcm.bootstrap?.(params);
    const continuityPromise = this.continuity.bootstrap?.(params);
    
    const [lcmResult, continuityResult] = await Promise.all([
      lcmPromise ?? Promise.resolve({ bootstrapped: false, reason: "no bootstrap" }),
      continuityPromise ?? Promise.resolve({ bootstrapped: false, reason: "no bootstrap" }),
    ]);

    // Return merged result
    return {
      bootstrapped: lcmResult.bootstrapped || continuityResult.bootstrapped,
      reason: lcmResult.bootstrapped ? lcmResult.reason : continuityResult.reason,
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
    // Only LCM has ingestBatch; continuity ingests one at a time
    const lcmResult = await (this.lcm.ingestBatch?.(params) ?? Promise.resolve({ ingestedCount: 0 }));
    
    // Ingest each message individually through continuity
    let continuityCount = 0;
    if (params.messages) {
      for (const message of params.messages) {
        const result = await this.continuity.ingest({
          sessionId: params.sessionId,
          message,
          isHeartbeat: params.isHeartbeat,
        });
        if (result.ingested) {
          continuityCount++;
        }
      }
    }

    return {
      ingestedCount: lcmResult.ingestedCount + continuityCount,
    };
  }

  async assemble(
    params: Parameters<ContextEngine["assemble"]>[0],
  ): Promise<AssembleResult> {
    // Get LCM's assembled context (DAG-based compaction)
    const lcmResult = await this.lcm.assemble(params);

    // For now, just use LCM's result
    // TODO: integrate continuity's cross-channel context injection
    return lcmResult;
  }

  async compact(
    params: Parameters<ContextEngine["compact"]>[0],
  ): Promise<CompactResult> {
    // Only LCM handles compaction (continuity doesn't compact)
    return this.lcm.compact(params);
  }

  // Optional lifecycle methods are forwarded from LCM when they exist
  prepareSubagentSpawn?: typeof this.lcm.prepareSubagentSpawn;
}
