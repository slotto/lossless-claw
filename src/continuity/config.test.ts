import { describe, expect, it } from "vitest";
import { DEFAULT_CONTINUITY_CONFIG, resolveContinuityConfig } from "./config.js";

describe("resolveContinuityConfig", () => {
  it("falls back to defaults when the input is missing or invalid", () => {
    expect(resolveContinuityConfig()).toEqual(DEFAULT_CONTINUITY_CONFIG);
    expect(resolveContinuityConfig(["bad-input"])).toEqual(DEFAULT_CONTINUITY_CONFIG);
  });

  it("normalizes modes, booleans, numeric limits, and clones custom scope rules", () => {
    const raw = {
      capture: {
        mainDirect: "review",
        pairedDirect: "off",
        group: "auto",
        channel: "invalid",
        minConfidence: 9,
      },
      review: {
        autoApproveMain: false,
        requireSource: false,
      },
      recall: {
        maxItems: 3.9,
        includeOpenLoops: false,
        scope: {
          default: "deny",
          rules: [
            {
              action: "allow",
              match: {
                channel: "discord",
                chatType: "direct",
                keyPrefix: "discord:direct",
                rawKeyPrefix: "agent:alpha:",
              },
            },
          ],
        },
      },
    };

    const resolved = resolveContinuityConfig(raw);

    expect(resolved.capture).toEqual({
      mainDirect: "review",
      pairedDirect: "off",
      group: "auto",
      channel: DEFAULT_CONTINUITY_CONFIG.capture.channel,
      minConfidence: 1,
    });
    expect(resolved.review).toEqual({
      autoApproveMain: false,
      requireSource: false,
    });
    expect(resolved.recall).toEqual({
      maxItems: 3,
      includeOpenLoops: false,
      scope: raw.recall.scope,
    });
    expect(resolved.recall.scope).not.toBe(raw.recall.scope);
    expect(resolved.recall.scope.rules).not.toBe(raw.recall.scope.rules);
    expect(resolved.recall.scope.rules?.[0]?.match).not.toBe(raw.recall.scope.rules?.[0]?.match);

    if (raw.recall.scope.rules?.[0]?.match) {
      raw.recall.scope.rules[0].match.chatType = "group";
    }
    expect(resolved.recall.scope.rules?.[0]?.match?.chatType).toBe("direct");
  });

  it("enforces recall bounds and reuses defaults for invalid values", () => {
    const resolved = resolveContinuityConfig({
      capture: {
        minConfidence: Number.NaN,
      },
      review: {
        autoApproveMain: "nope",
        requireSource: "nope",
      },
      recall: {
        maxItems: 99,
        includeOpenLoops: "nope",
      },
    });

    expect(resolved.capture.minConfidence).toBe(DEFAULT_CONTINUITY_CONFIG.capture.minConfidence);
    expect(resolved.review).toEqual(DEFAULT_CONTINUITY_CONFIG.review);
    expect(resolved.recall.maxItems).toBe(12);
    expect(resolved.recall.includeOpenLoops).toBe(
      DEFAULT_CONTINUITY_CONFIG.recall.includeOpenLoops,
    );
    expect(resolved.recall.scope).toEqual(DEFAULT_CONTINUITY_CONFIG.recall.scope);
    expect(resolved.recall.scope).not.toBe(DEFAULT_CONTINUITY_CONFIG.recall.scope);
  });

  it("accepts zero for capture.minConfidence", () => {
    const resolved = resolveContinuityConfig({
      capture: {
        minConfidence: 0,
      },
    });

    expect(resolved.capture.minConfidence).toBe(0);
  });

  it("falls back for zero-valued recall.maxItems", () => {
    const resolved = resolveContinuityConfig({
      recall: {
        maxItems: 0,
      },
    });
    expect(resolved.recall.maxItems).toBe(DEFAULT_CONTINUITY_CONFIG.recall.maxItems);
  });

  it("keeps recall scope deny-by-default when custom scope omits or invalidates default", () => {
    const missingDefault = resolveContinuityConfig({
      recall: {
        scope: {
          rules: [{ action: "allow", match: { channel: "discord", chatType: "direct" } }],
        },
      },
    });
    const invalidDefault = resolveContinuityConfig({
      recall: {
        scope: {
          default: "maybe" as unknown as "allow" | "deny",
          rules: [{ action: "allow", match: { channel: "discord", chatType: "direct" } }],
        },
      },
    });

    expect(missingDefault.recall.scope.default).toBe("deny");
    expect(invalidDefault.recall.scope.default).toBe("deny");
  });

  it("preserves explicit allow defaults in custom recall scope", () => {
    const resolved = resolveContinuityConfig({
      recall: {
        scope: {
          default: "allow",
          rules: [],
        },
      },
    });

    expect(resolved.recall.scope.default).toBe("allow");
  });

  it("clones sparse custom scope rules that omit match objects", () => {
    const resolved = resolveContinuityConfig({
      recall: {
        scope: {
          default: "deny",
          rules: [undefined, { action: "allow" }],
        },
      },
    });

    expect(resolved.recall.scope).toEqual({
      default: "deny",
      rules: [undefined, { action: "allow", match: undefined }],
    });
  });

  it("adds same-user identity and recent defaults", () => {
    const resolved = resolveContinuityConfig();

    expect(resolved.identity).toEqual({
      mode: "off",
      defaultDirectSubjectId: "owner",
      bindings: [],
    });
    expect(resolved.recent).toEqual({
      enabled: false,
      maxExcerpts: 6,
      maxChars: 1200,
      ttlHours: 24,
    });
  });

  it("normalizes identity bindings and recent limits", () => {
    const resolved = resolveContinuityConfig({
      identity: {
        mode: "hybrid",
        defaultDirectSubjectId: " Owner ",
        bindings: [
          {
            subjectId: " Alice Smith ",
            matches: [
              {
                channel: "Discord",
                keyPrefix: " Agent:Alpha:Discord:Direct:Alice ",
                rawKeyPrefix: " Agent:Alpha:Discord:Direct:Alice ",
              },
            ],
          },
        ],
      },
      recent: {
        enabled: true,
        maxExcerpts: 99,
        maxChars: 9999,
        ttlHours: 999,
      },
    });

    expect(resolved.identity).toEqual({
      mode: "hybrid",
      defaultDirectSubjectId: "owner",
      bindings: [
        {
          subjectId: "alice-smith",
          matches: [
            {
              channel: "discord",
              keyPrefix: "agent:alpha:discord:direct:alice",
              rawKeyPrefix: "agent:alpha:discord:direct:alice",
            },
          ],
        },
      ],
    });
    expect(resolved.recent).toEqual({
      enabled: true,
      maxExcerpts: 12,
      maxChars: 4000,
      ttlHours: 168,
    });
  });

  it("falls back for too-small recent integers and drops invalid bindings", () => {
    const resolved = resolveContinuityConfig({
      identity: {
        bindings: [
          undefined,
          "bad-binding" as unknown as never,
          {
            subjectId: " ",
          },
          {
            subjectId: "Owner",
            matches: [
              undefined,
              "bad-match" as unknown as never,
              {} as never,
              { channel: "Discord" },
            ],
          },
        ],
      },
      recent: {
        maxExcerpts: 0,
        maxChars: 100,
        ttlHours: 0,
      },
    });

    expect(resolved.identity.bindings).toEqual([
      {
        subjectId: "owner",
        matches: [],
      },
      {
        subjectId: "owner",
        matches: [{ channel: "discord" }],
      },
    ]);
    expect(resolved.recent).toEqual({
      enabled: false,
      maxExcerpts: 6,
      maxChars: 1200,
      ttlHours: 24,
    });
  });
});
