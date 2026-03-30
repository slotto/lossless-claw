/**
 * @martian-engineering/lossless-claw — Hybrid: LCM + Continuity
 *
 * Combines DAG-based conversation summarization with cross-channel
 * continuity and subject-scoped identity tracking.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveLcmConfig } from "../db/config.js";
import { createLcmDatabaseConnection } from "../db/connection.js";
import { LcmContextEngine } from "../engine.js";
import { HybridContextEngine } from "../hybrid-engine.js";
import { logStartupBannerOnce } from "../startup-banner-log.js";
import { createLcmDescribeTool } from "../tools/lcm-describe-tool.js";
import { createLcmExpandQueryTool } from "../tools/lcm-expand-query-tool.js";
import { createLcmExpandTool } from "../tools/lcm-expand-tool.js";
import { createLcmGrepTool } from "../tools/lcm-grep-tool.js";
import type { LcmDependencies } from "../types.js";
import { createContinuityService } from "../continuity/service.js";
import { resolveContinuityConfig } from "../continuity/config.js";

// Import the existing createLcmDependencies logic from index.ts
import {
  buildCompleteSimpleOptions,
  shouldOmitTemperatureForApi,
} from "./index.js";

/** Parse `agent:<agentId>:<suffix...>` session keys. */
function parseAgentSessionKey(sessionKey: string): { agentId: string; suffix: string } | null {
  const value = sessionKey.trim();
  if (!value.startsWith("agent:")) {
    return null;
  }
  const parts = value.split(":");
  if (parts.length < 3) {
    return null;
  }
  const agentId = parts[1]?.trim();
  const suffix = parts.slice(2).join(":").trim();
  if (!agentId || !suffix) {
    return null;
  }
  return { agentId, suffix };
}

/** Return a stable normalized agent id. */
function normalizeAgentId(agentId: string | undefined): string {
  const normalized = (agentId ?? "").trim();
  return normalized.length > 0 ? normalized : "main";
}

function readDefaultModelFromConfig(config: unknown): string {
  if (!config || typeof config !== "object") {
    return "";
  }

  const model = (config as { agents?: { defaults?: { model?: unknown } } }).agents?.defaults?.model;
  if (typeof model === "string") {
    return model.trim();
  }

  const primary = (model as { primary?: unknown } | undefined)?.primary;
  return typeof primary === "string" ? primary.trim() : "";
}

function buildCompactionModelLog(params: {
  config: ReturnType<typeof resolveLcmConfig>;
  defaultModelRef: string;
  defaultProvider: string;
}): string {
  const usingOverride = Boolean(params.config.summaryModel || params.config.summaryProvider);
  const raw = (params.config.summaryModel || params.defaultModelRef).trim();
  if (!raw) {
    return "[lcm-hybrid] Compaction model: (unconfigured)";
  }

  if (raw.includes("/")) {
    const [provider, ...rest] = raw.split("/");
    const model = rest.join("/").trim();
    if (provider && model) {
      return `[lcm-hybrid] Compaction model: ${provider.trim()}/${model} (${usingOverride ? "override" : "default"})`;
    }
  }

  const provider = (params.config.summaryProvider || params.defaultProvider || "openai").trim();
  return `[lcm-hybrid] Compaction model: ${provider}/${raw} (${usingOverride ? "override" : "default"})`;
}

// Export the helper functions for external use
export { buildCompleteSimpleOptions, shouldOmitTemperatureForApi };

const hybridPlugin = {
  id: "lossless-claw-hybrid",
  name: "Lossless Claw + Continuity",
  description:
    "Hybrid context engine combining DAG-based compaction with cross-channel continuity",

  configSchema: {
    parse(value: unknown) {
      const raw =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      
      // Parse both LCM and continuity configs
      const lcmConfig = resolveLcmConfig(process.env, raw);
      const continuityConfig = resolveContinuityConfig(raw.continuity);
      
      return {
        ...lcmConfig,
        continuity: continuityConfig,
      };
    },
  },

  register(api: OpenClawPluginApi) {
    // Import createLcmDependencies from the main plugin file
    // For now, we'll use a simplified version
    const pluginConfig =
      api.pluginConfig && typeof api.pluginConfig === "object" && !Array.isArray(api.pluginConfig)
        ? api.pluginConfig
        : undefined;
    
    const lcmConfig = resolveLcmConfig(process.env, pluginConfig);
    const database = createLcmDatabaseConnection(lcmConfig.databasePath);

    // Create continuity service
    const continuityService = createContinuityService({
      config: api.config,
      runtime: api.runtime,
      pluginConfig: pluginConfig?.continuity as any,
      logger: api.logger,
    });

    // Note: We need to import the full createLcmDependencies from index.ts
    // For now, create a minimal version
    const deps: LcmDependencies = {
      config: lcmConfig,
      complete: async () => ({ content: [] }), // Placeholder
      callGateway: async () => ({}), // Placeholder
      resolveModel: () => ({ provider: "openai", model: "gpt-4o" }), // Placeholder
      getApiKey: async () => undefined, // Placeholder
      requireApiKey: async () => { throw new Error("Not implemented"); },
      parseAgentSessionKey,
      isSubagentSessionKey: (sessionKey) => {
        const parsed = parseAgentSessionKey(sessionKey);
        return !!parsed && parsed.suffix.startsWith("subagent:");
      },
      normalizeAgentId,
      buildSubagentSystemPrompt: (params) => {
        const task = params.taskSummary?.trim() || "Perform delegated work.";
        return `Depth: ${params.depth}/${params.maxDepth}\n${task}`;
      },
      readLatestAssistantReply: () => undefined, // Placeholder
      resolveAgentDir: () => api.resolvePath("."),
      resolveSessionIdFromSessionKey: async () => undefined, // Placeholder
      agentLaneSubagent: "subagent",
      log: {
        info: (msg) => api.logger.info(msg),
        warn: (msg) => api.logger.warn(msg),
        error: (msg) => api.logger.error(msg),
        debug: (msg) => api.logger.debug?.(msg),
      },
    };

    // Create hybrid engine
    const hybrid = new HybridContextEngine(lcmConfig, deps, continuityService);
    
    // For comparison, also create standalone LCM engine
    const lcm = new LcmContextEngine(deps, database);

    // Register both engines
    api.registerContextEngine("lossless-claw-hybrid", () => hybrid);
    api.registerContextEngine("lossless-claw", () => lcm);
    api.registerContextEngine("default", () => hybrid); // Hybrid is the new default

    // Register LCM tools (still useful with hybrid engine)
    api.registerTool((ctx) =>
      createLcmGrepTool({
        deps,
        lcm,
        sessionKey: ctx.sessionKey,
      }),
    );
    api.registerTool((ctx) =>
      createLcmDescribeTool({
        deps,
        lcm,
        sessionKey: ctx.sessionKey,
      }),
    );
    api.registerTool((ctx) =>
      createLcmExpandTool({
        deps,
        lcm,
        sessionKey: ctx.sessionKey,
      }),
    );
    api.registerTool((ctx) =>
      createLcmExpandQueryTool({
        deps,
        lcm,
        sessionKey: ctx.sessionKey,
        requesterSessionKey: ctx.sessionKey,
      }),
    );

    logStartupBannerOnce({
      key: "plugin-loaded-hybrid",
      log: (message) => api.logger.info(message),
      message: `[lcm-hybrid] Hybrid plugin loaded (LCM + Continuity)`,
    });
    logStartupBannerOnce({
      key: "compaction-model-hybrid",
      log: (message) => api.logger.info(message),
      message: buildCompactionModelLog({
        config: lcmConfig,
        defaultModelRef: readDefaultModelFromConfig(api.config),
        defaultProvider: process.env.OPENCLAW_PROVIDER?.trim() ?? "",
      }),
    });
  },
};

export default hybridPlugin;
