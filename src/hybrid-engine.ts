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
    // Debug logging
    try {
      require('fs').appendFileSync('/tmp/hybrid-ingestbatch.log', 
        `${new Date().toISOString()} hybrid ingestBatch called - sessionId: ${params.sessionId}, messages: ${params.messages?.length || 0}\n`);
    } catch {}

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
    try {
      require('fs').appendFileSync('/tmp/hybrid-assemble.log',
        `${new Date().toISOString()} hybrid.assemble called, sessionKey=${params.sessionKey}
`);
    } catch {}
    
    // Get LCM's assembled context (DAG-based compaction)
    const lcmResult = await this.lcm.assemble(params);

    try {
      require('fs').appendFileSync('/tmp/hybrid-assemble.log',
        `${new Date().toISOString()} calling continuity.assemble
`);
    } catch {}
    
    // Get continuity's cross-channel context injection
    const continuityResult = await this.continuity.assemble(params);
    
    try {
      require('fs').appendFileSync('/tmp/hybrid-assemble.log',
        `${new Date().toISOString()} continuity returned ${continuityResult.messages?.length || 0} messages
`);
    } catch {}

    // Merge both results
    return {
      messages: [
        ...(continuityResult.messages || []),  // Continuity recent history first
        ...(lcmResult.messages || []),         // Then LCM compacted context
      ],
    };
  }

  async beforeTurn(
    params: Parameters<ContextEngine["beforeTurn"]>[0],
  ): Promise<void> {
    // Emergency compaction check: prevent crashes from bloated sessions
    const fs = require('fs');
    
    try {
      const stats = await fs.promises.stat(params.sessionFile);
      const fileSizeBytes = stats.size;
      
      // Rough estimate: 1 byte ~= 0.25 tokens for JSON (conservative)
      const estimatedTokens = Math.floor(fileSizeBytes * 0.25);
      
      // Emergency threshold: 150% of context budget
      const emergencyThreshold = (params.tokenBudget || 200000) * 1.5;
      
      if (estimatedTokens > emergencyThreshold) {
        // Log emergency compaction
        try {
          fs.appendFileSync('/tmp/emergency-compact.log',
            `${new Date().toISOString()} EMERGENCY: session ${params.sessionId} has ${estimatedTokens} tokens (threshold: ${emergencyThreshold})\n`);
        } catch {}
        
        // Trigger emergency compaction BEFORE loading into context
        await this.compact({
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          sessionFile: params.sessionFile,
          messages: params.messages,
          contextTokens: params.tokenBudget || 200000,
          model: params.model,
        });
        
        // Log completion
        try {
          fs.appendFileSync('/tmp/emergency-compact.log',
            `${new Date().toISOString()} EMERGENCY: compaction completed for ${params.sessionId}\n`);
        } catch {}
      }
    } catch (err) {
      // Non-fatal: log error but don't block the turn
      try {
        fs.appendFileSync('/tmp/emergency-compact.log',
          `${new Date().toISOString()} ERROR: beforeTurn check failed: ${String(err)}\n`);
      } catch {}
    }
  }

  async afterTurn(
    params: Parameters<ContextEngine["afterTurn"]>[0],
  ): Promise<void> {
    // Debug logging
    try {
      require('fs').appendFileSync('/tmp/hybrid-afterturn.log', 
        `${new Date().toISOString()} hybrid afterTurn called - sessionId: ${params.sessionId}, messages: ${params.messages?.length || 0}\n`);
    } catch {}
    
    // Call afterTurn on both engines in parallel
    await Promise.all([
      this.lcm.afterTurn?.(params),
      this.continuity.afterTurn?.(params),
    ]);
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
