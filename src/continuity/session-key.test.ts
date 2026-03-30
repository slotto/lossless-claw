import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  resolveSessionAgentId,
  resolveThreadParentSessionKey,
} from "./session-key.js";

describe("session-key helpers", () => {
  it("parses agent session keys", () => {
    expect(parseAgentSessionKey("agent:alpha:main")).toEqual({
      agentId: "alpha",
      rest: "main",
    });
    expect(parseAgentSessionKey(undefined)).toBeNull();
    expect(parseAgentSessionKey(null)).toBeNull();
    expect(parseAgentSessionKey("   ")).toBeNull();
    expect(parseAgentSessionKey("agent: :main")).toBeNull();
    expect(parseAgentSessionKey("agent:alpha:")).toBeNull();
    expect(parseAgentSessionKey("main")).toBeNull();
  });

  it("resolves thread parent keys", () => {
    expect(resolveThreadParentSessionKey("agent:alpha:main:thread:42")).toBe("agent:alpha:main");
    expect(resolveThreadParentSessionKey("agent:alpha:main:topic:ops")).toBe("agent:alpha:main");
    expect(resolveThreadParentSessionKey(undefined)).toBeNull();
    expect(resolveThreadParentSessionKey(null)).toBeNull();
    expect(resolveThreadParentSessionKey(":thread:42")).toBeNull();
    expect(resolveThreadParentSessionKey("agent:alpha:main")).toBeNull();
    expect(resolveThreadParentSessionKey("   ")).toBeNull();
  });

  it("normalizes agent ids", () => {
    expect(normalizeAgentId(undefined)).toBe(DEFAULT_AGENT_ID);
    expect(normalizeAgentId("Alpha")).toBe("alpha");
    expect(normalizeAgentId("../../Outside")).toBe("outside");
    expect(normalizeAgentId("---")).toBe(DEFAULT_AGENT_ID);
  });

  it("resolves default agent id from config", () => {
    expect(resolveDefaultAgentId({})).toBe("main");
    expect(
      resolveDefaultAgentId({
        agents: {
          list: [{}],
        },
      }),
    ).toBe("main");
    expect(
      resolveDefaultAgentId({
        agents: {
          list: [{ id: "alpha" }, { id: "beta", default: true }],
        },
      }),
    ).toBe("beta");
  });

  it("resolves session agent id from session key or default", () => {
    const config = {
      agents: {
        list: [{ id: "beta", default: true }],
      },
    };
    expect(resolveSessionAgentId({ config, sessionKey: "agent:alpha:main" })).toBe("alpha");
    expect(resolveSessionAgentId({ config, sessionKey: "main" })).toBe("beta");
  });

  it("resolves workspace from entry, default workspace, or state fallback", () => {
    const stateDir = "/tmp/continuity-state";

    expect(
      resolveAgentWorkspaceDir({
        config: {
          agents: {
            list: [{ id: "alpha", workspace: "/tmp/alpha" }],
          },
        },
        agentId: "alpha",
        stateDir,
      }),
    ).toBe("/tmp/alpha");

    expect(
      resolveAgentWorkspaceDir({
        config: {
          agents: {
            defaults: { workspace: "/tmp/default" },
            list: [{ id: "alpha", default: true }],
          },
        },
        agentId: "alpha",
        stateDir,
      }),
    ).toBe("/tmp/default");

    expect(
      resolveAgentWorkspaceDir({
        config: {
          agents: {
            list: [{ id: "alpha", default: true }],
          },
        },
        agentId: "alpha",
        stateDir,
      }),
    ).toBe("/tmp/continuity-state/workspace-alpha");

    expect(
      resolveAgentWorkspaceDir({
        config: {
          agents: {
            list: [{ id: "alpha", default: true }],
          },
        },
        agentId: "beta",
        stateDir,
      }),
    ).toBe("/tmp/continuity-state/workspace-beta");
  });
});
