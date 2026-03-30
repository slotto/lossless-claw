import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContinuityContextEngine,
  resetCompactDelegateForTesting,
  setCompactDelegateForTesting,
} from "./engine.js";
import type { ContinuityService } from "./service.js";
import type { ContinuityAgentMessage } from "./types.js";

function makeMessage(
  text: string,
  role: ContinuityAgentMessage["role"] = "user",
): ContinuityAgentMessage {
  return {
    role,
    content: text,
    timestamp: Date.now(),
  };
}

function makeService() {
  return {
    buildSystemPromptAddition: vi.fn(),
    captureTurn: vi.fn(),
  } as unknown as ContinuityService & {
    buildSystemPromptAddition: ReturnType<typeof vi.fn>;
    captureTurn: ReturnType<typeof vi.fn>;
  };
}

describe("ContinuityContextEngine", () => {
  afterEach(() => {
    resetCompactDelegateForTesting();
    vi.restoreAllMocks();
  });

  it("reports lazy bootstrap behavior and a no-op ingest path", async () => {
    const engine = new ContinuityContextEngine({ service: makeService() });

    await expect(
      engine.bootstrap({
        sessionId: "session-bootstrap",
        sessionFile: "/tmp/session.jsonl",
      }),
    ).resolves.toEqual({
      bootstrapped: false,
      reason: "continuity bootstraps lazily",
    });

    await expect(
      engine.ingest({
        sessionId: "session-ingest",
        message: makeMessage("noop"),
      }),
    ).resolves.toEqual({ ingested: false });
  });

  it("keeps assemble pass-through without system prompt injection", async () => {
    const service = makeService();
    const messages = [makeMessage("What do I prefer?")];
    const engine = new ContinuityContextEngine({ service, agentId: "alpha" });

    await expect(
      engine.assemble({
        sessionId: "session-assemble",
        messages,
      }),
    ).resolves.toEqual({
      messages,
      estimatedTokens: 0,
    });

    expect(service.buildSystemPromptAddition).not.toHaveBeenCalled();
  });

  it("skips capture when there is no runtimeContext session key or no new turn slice", async () => {
    const service = makeService();
    const engine = new ContinuityContextEngine({ service, agentId: "alpha" });

    await engine.afterTurn({
      sessionId: "session-no-context",
      sessionFile: "/tmp/session.jsonl",
      messages: [makeMessage("previous")],
      prePromptMessageCount: 0,
    });

    await engine.afterTurn({
      sessionId: "session-no-key",
      sessionFile: "/tmp/session.jsonl",
      messages: [makeMessage("previous")],
      prePromptMessageCount: 0,
      runtimeContext: { agentId: "alpha" },
    });

    await engine.afterTurn({
      sessionId: "session-no-new",
      sessionFile: "/tmp/session.jsonl",
      messages: [makeMessage("previous")],
      prePromptMessageCount: 1,
      runtimeContext: { sessionKey: "main" },
    });

    await engine.afterTurn({
      sessionId: "session-heartbeat",
      sessionFile: "/tmp/session.jsonl",
      messages: [makeMessage("heartbeat")],
      prePromptMessageCount: 0,
      runtimeContext: { sessionKey: "main" },
      isHeartbeat: true,
    });

    expect(service.captureTurn).not.toHaveBeenCalled();
  });

  it("captures only the new turn slice and reads session key from runtimeContext", async () => {
    const service = makeService();
    service.captureTurn.mockResolvedValue([]);
    const engine = new ContinuityContextEngine({ service, agentId: "alpha" });
    const messages = [
      makeMessage("previous user"),
      makeMessage("previous assistant", "assistant"),
      makeMessage("I prefer terse status updates."),
      makeMessage("I will follow up tomorrow.", "assistant"),
    ];

    await engine.afterTurn({
      sessionId: "session-slice",
      sessionFile: "/tmp/session.jsonl",
      messages,
      prePromptMessageCount: 2,
      runtimeContext: {
        sessionKey: "main",
        agentId: "runtime-agent",
      },
    });

    expect(service.captureTurn).toHaveBeenCalledWith({
      agentId: "alpha",
      sessionId: "session-slice",
      sessionKey: "main",
      messages: messages.slice(2),
    });
  });

  it("uses runtimeContext agentId when engine agentId is not set", async () => {
    const service = makeService();
    service.captureTurn.mockResolvedValue([]);
    const engine = new ContinuityContextEngine({ service });
    const newMessage = makeMessage("I prefer terse status updates.");

    await engine.afterTurn({
      sessionId: "session-runtime-agent",
      sessionFile: "/tmp/session.jsonl",
      messages: [newMessage],
      prePromptMessageCount: Number.NaN,
      runtimeContext: {
        sessionKey: "main",
        agentId: "runtime-agent",
      },
    });

    expect(service.captureTurn).toHaveBeenCalledWith({
      agentId: "runtime-agent",
      sessionId: "session-runtime-agent",
      sessionKey: "main",
      messages: [newMessage],
    });
  });

  it("falls back to trailing turn messages when pre-prompt boundary is stale", async () => {
    const service = makeService();
    service.captureTurn.mockResolvedValue([]);
    const engine = new ContinuityContextEngine({ service, agentId: "alpha" });
    const compactedMessages = [
      makeMessage("Compaction summary", "assistant"),
      makeMessage("I prefer compact status updates."),
      makeMessage("Acknowledged.", "assistant"),
    ];

    await engine.afterTurn({
      sessionId: "session-compacted",
      sessionFile: "/tmp/session.jsonl",
      messages: compactedMessages,
      prePromptMessageCount: 50,
      runtimeContext: {
        sessionKey: "main",
      },
    });

    expect(service.captureTurn).toHaveBeenCalledWith({
      agentId: "alpha",
      sessionId: "session-compacted",
      sessionKey: "main",
      messages: compactedMessages.slice(1),
    });
  });

  it("drops stale-tail fallback when no user/assistant messages are available", async () => {
    const service = makeService();
    const engine = new ContinuityContextEngine({ service, agentId: "alpha" });

    await engine.afterTurn({
      sessionId: "session-non-chat-tail",
      sessionFile: "/tmp/session.jsonl",
      messages: [{ role: "toolResult", content: "result" }],
      prePromptMessageCount: 50,
      runtimeContext: {
        sessionKey: "main",
      },
    });

    expect(service.captureTurn).not.toHaveBeenCalled();
  });

  it("returns deterministic fallback and emits one warning when compact delegate resolution fails", async () => {
    const service = makeService();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const engine = new ContinuityContextEngine({
      service,
      logger,
    });

    const params = {
      sessionId: "session-compact",
      sessionFile: path.join("/tmp", "session.jsonl"),
      force: true,
      compactionTarget: "budget" as const,
      runtimeContext: {
        workspaceDir: "/tmp",
      },
    };

    await expect(engine.compact(params)).resolves.toEqual({
      ok: true,
      compacted: false,
      reason: "continuity compact delegate unavailable",
    });

    await expect(engine.compact(params)).resolves.toEqual({
      ok: true,
      compacted: false,
      reason: "continuity compact delegate unavailable",
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("resolves the compact delegate from an installed openclaw package when present", async () => {
    const service = makeService();
    const packageRoot = path.join(process.cwd(), "node_modules", "openclaw");
    const packageJsonPath = path.join(packageRoot, "package.json");
    const runtimePath = path.join(
      packageRoot,
      "dist",
      "agents",
      "pi-embedded-runner",
      "compact.runtime.js",
    );

    await fs.mkdir(path.dirname(runtimePath), { recursive: true });
    await fs.writeFile(packageJsonPath, '{\n  "name": "openclaw",\n  "type": "module"\n}\n', "utf8");
    await fs.writeFile(
      runtimePath,
      [
        "export async function compactEmbeddedPiSessionDirect(params) {",
        '  return { ok: true, compacted: true, reason: "resolved", result: { tokensBefore: 10, tokensAfter: 4, details: { sessionKey: params.sessionKey } } };',
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      const engine = new ContinuityContextEngine({ service });

      await expect(
        engine.compact({
          sessionId: "session-resolved",
          sessionFile: path.join("/tmp", "session.jsonl"),
          runtimeContext: {
            sessionKey: "main",
          },
        }),
      ).resolves.toEqual({
        ok: true,
        compacted: true,
        reason: "resolved",
        result: {
          summary: undefined,
          firstKeptEntryId: undefined,
          tokensBefore: 10,
          tokensAfter: 4,
          details: { sessionKey: "main" },
        },
      });
    } finally {
      await fs.rm(packageRoot, { recursive: true, force: true });
    }
  });

  it("delegates compact to compactEmbeddedPiSessionDirect when available", async () => {
    const service = makeService();
    const delegate = vi.fn().mockResolvedValue({
      ok: true,
      compacted: true,
      reason: "ok",
      result: {
        summary: "summary",
        firstKeptEntryId: "entry-1",
        tokensBefore: 100,
        tokensAfter: 60,
        details: { source: "delegate" },
      },
    });
    setCompactDelegateForTesting(delegate);

    const engine = new ContinuityContextEngine({ service });
    const params = {
      sessionId: "session-compact",
      sessionFile: path.join("/tmp", "session.jsonl"),
      tokenBudget: 100,
      force: true,
      customInstructions: "compact",
      runtimeContext: {
        workspaceDir: "/tmp/workspace",
        sessionKey: "main",
      },
    };

    await expect(engine.compact(params)).resolves.toEqual({
      ok: true,
      compacted: true,
      reason: "ok",
      result: {
        summary: "summary",
        firstKeptEntryId: "entry-1",
        tokensBefore: 100,
        tokensAfter: 60,
        details: { source: "delegate" },
      },
    });

    expect(delegate).toHaveBeenCalledWith({
      workspaceDir: "/tmp/workspace",
      sessionKey: "main",
      sessionId: "session-compact",
      sessionFile: path.join("/tmp", "session.jsonl"),
      tokenBudget: 100,
      force: true,
      customInstructions: "compact",
    });
  });

  it("maps compact delegate responses that do not include result payload", async () => {
    const service = makeService();
    const delegate = vi.fn().mockResolvedValue({
      ok: true,
      compacted: false,
      reason: "noop",
    });
    setCompactDelegateForTesting(delegate);

    const engine = new ContinuityContextEngine({ service });
    await expect(
      engine.compact({
        sessionId: "session-compact",
        sessionFile: path.join("/tmp", "session.jsonl"),
      }),
    ).resolves.toEqual({
      ok: true,
      compacted: false,
      reason: "noop",
      result: undefined,
    });
  });

  it("reports compact delegate call failures", async () => {
    const service = makeService();
    const delegate = vi.fn().mockRejectedValue(new Error("boom"));
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    setCompactDelegateForTesting(delegate);

    const engine = new ContinuityContextEngine({ service, logger });

    await expect(
      engine.compact({
        sessionId: "session-compact",
        sessionFile: path.join("/tmp", "session.jsonl"),
      }),
    ).resolves.toEqual({
      ok: false,
      compacted: false,
      reason: "continuity compact delegate failed",
    });

    expect(logger.warn).toHaveBeenCalledWith("continuity compact delegate failed: boom");
  });

  it("handles non-Error compact delegate failures", async () => {
    const service = makeService();
    const delegate = vi.fn().mockRejectedValue("boom");
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    setCompactDelegateForTesting(delegate);
    const engine = new ContinuityContextEngine({ service, logger });

    await engine.compact({
      sessionId: "session-compact",
      sessionFile: path.join("/tmp", "session.jsonl"),
    });

    expect(logger.warn).toHaveBeenCalledWith("continuity compact delegate failed: boom");
  });

  it("disposes cleanly", async () => {
    const engine = new ContinuityContextEngine({ service: makeService() });
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
