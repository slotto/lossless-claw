import { describe, expect, it } from "vitest";
import { resolveContinuityScope } from "./identity.js";
import { resolveContinuityConfig } from "./config.js";

describe("resolveContinuityScope", () => {
  it("keeps direct continuity agent-scoped when identity mode is off", () => {
    const config = resolveContinuityConfig();

    expect(
      resolveContinuityScope({
        agentId: "alpha",
        sessionKey: "discord:direct:owner",
        identity: config.identity,
      }),
    ).toEqual({
      scopeKind: "agent",
      scopeId: "agent:alpha",
      normalizedSessionKey: "discord:direct:owner",
    });
  });

  it("maps every direct session to the default subject in single-user mode", () => {
    const config = resolveContinuityConfig({
      identity: {
        mode: "single_user",
        defaultDirectSubjectId: "Owner",
      },
    });

    expect(
      resolveContinuityScope({
        agentId: "alpha",
        sessionKey: "agent:alpha:main:thread:42",
        identity: config.identity,
      }),
    ).toEqual({
      scopeKind: "subject",
      scopeId: "subject:owner",
      subjectId: "owner",
      normalizedSessionKey: "main",
    });
  });

  it("uses explicit bindings first and otherwise isolates unmatched direct sessions", () => {
    const config = resolveContinuityConfig({
      identity: {
        mode: "explicit",
        bindings: [
          {
            subjectId: "alice",
            matches: [{ channel: "discord", keyPrefix: "discord:direct:alice" }],
          },
        ],
      },
    });

    expect(
      resolveContinuityScope({
        agentId: "alpha",
        sessionKey: "discord:direct:alice",
        identity: config.identity,
      }),
    ).toEqual({
      scopeKind: "subject",
      scopeId: "subject:alice",
      subjectId: "alice",
      normalizedSessionKey: "discord:direct:alice",
    });
    expect(
      resolveContinuityScope({
        agentId: "alpha",
        sessionKey: "telegram:direct:guest",
        identity: config.identity,
      }),
    ).toEqual({
      scopeKind: "session",
      scopeId: "session:telegram:direct:guest",
      normalizedSessionKey: "telegram:direct:guest",
    });
  });

  it("falls back to the default subject in hybrid mode and ignores non-direct sessions", () => {
    const config = resolveContinuityConfig({
      identity: {
        mode: "hybrid",
        defaultDirectSubjectId: "owner",
        bindings: [
          {
            subjectId: "alice",
            matches: [{ rawKeyPrefix: "agent:alpha:discord:direct:alice" }],
          },
        ],
      },
    });

    expect(
      resolveContinuityScope({
        agentId: "alpha",
        sessionKey: "agent:alpha:discord:direct:alice",
        identity: config.identity,
      }),
    ).toEqual({
      scopeKind: "subject",
      scopeId: "subject:alice",
      subjectId: "alice",
      normalizedSessionKey: "discord:direct:alice",
    });
    expect(
      resolveContinuityScope({
        agentId: "alpha",
        sessionKey: "webchat:direct:owner",
        identity: config.identity,
      }),
    ).toEqual({
      scopeKind: "subject",
      scopeId: "subject:owner",
      subjectId: "owner",
      normalizedSessionKey: "webchat:direct:owner",
    });
    expect(
      resolveContinuityScope({
        agentId: "alpha",
        sessionKey: "discord:group:ops",
        identity: config.identity,
      }),
    ).toEqual({
      scopeKind: "agent",
      scopeId: "agent:alpha",
      normalizedSessionKey: "discord:group:ops",
    });
  });
});
