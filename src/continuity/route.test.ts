import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createContinuityRouteHandler, continuityRoutePath } from "./route.js";

type MockResponse = ServerResponse & {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

function makeResponse(): MockResponse {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    headers,
    body: "",
    setHeader(name: string, value: unknown) {
      headers[String(name)] = String(value);
    },
    end(chunk?: unknown) {
      if (chunk != null) {
        this.body += String(chunk);
      }
    },
  } as unknown as MockResponse;
  return res;
}

function makeRequest(params: {
  method: string;
  url: string;
  body?: string | Buffer;
  headers?: Record<string, string>;
}): IncomingMessage {
  const stream = Readable.from(params.body ? [params.body] : []);
  const req = stream as unknown as IncomingMessage;
  req.method = params.method;
  req.url = params.url;
  req.headers = params.headers ?? {};
  return req;
}

function createHarness(options?: { initialConfig?: Record<string, unknown> }) {
  let config: Record<string, unknown> = options?.initialConfig ?? {
    plugins: {
      slots: {
        contextEngine: "continuity",
      },
      entries: {
        continuity: {
          config: {
            capture: {
              mainDirect: "auto",
              pairedDirect: "review",
              group: "off",
              channel: "off",
              minConfidence: 0.75,
            },
            review: {
              autoApproveMain: true,
              requireSource: true,
            },
            identity: {
              mode: "hybrid",
              defaultDirectSubjectId: "owner",
              bindings: [
                {
                  subjectId: "owner",
                  matches: [{ keyPrefix: "discord:direct:owner" }],
                },
              ],
            },
            recent: {
              enabled: true,
              maxExcerpts: 6,
              maxChars: 1200,
              ttlHours: 24,
            },
            recall: {
              maxItems: 4,
              includeOpenLoops: true,
              scope: {
                default: "deny",
                rules: [{ action: "allow", match: { chatType: "direct" } }],
              },
            },
          },
        },
      },
    },
  };

  const writes: unknown[] = [];

  const service = {
    status: vi.fn().mockResolvedValue({
      slotSelected: true,
      counts: { pending: 1, approved: 1, rejected: 0 },
      identity: {
        mode: "hybrid",
        defaultDirectSubjectId: "owner",
        bindings: [],
      },
      recent: {
        enabled: true,
        maxExcerpts: 6,
        maxChars: 1200,
        ttlHours: 24,
      },
      subjectCount: 1,
      recentSubjectCount: 1,
      legacyUnscopedDirectCount: 0,
    }),
    list: vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "cont_1",
          kind: "fact",
          subjectId: "owner",
          scopeKind: "subject",
          text: "my timezone is America/Chicago",
          source: {
            sessionKey: "main",
            sessionId: "session-1",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "cont_2",
          kind: "preference",
          subjectId: "owner",
          scopeKind: "subject",
          text: "I prefer terse updates",
          source: {
            sessionKey: "main",
            sessionId: "session-2",
          },
        },
      ]),
    subjects: vi.fn().mockResolvedValue([
      {
        subjectId: "owner",
        approvedCount: 1,
        pendingCount: 1,
        rejectedCount: 0,
        recentCount: 2,
        lastSeenAt: Date.now(),
        sessionKeys: ["discord:direct:owner", "main"],
      },
    ]),
    patch: vi.fn().mockResolvedValue({ ok: true }),
  };

  const runtime = {
    config: {
      loadConfig: () => config,
      writeConfigFile: async (next: Record<string, unknown>) => {
        config = next;
        writes.push(next);
      },
    },
    state: {
      resolveStateDir: () => "/tmp/continuity-state",
    },
  };

  const handler = createContinuityRouteHandler({
    runtime: runtime as never,
    service: service as never,
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  return {
    handler,
    service,
    runtime,
    writes,
    getConfig: () => config,
  };
}

describe("continuity route", () => {
  it("renders the dashboard over GET", async () => {
    const harness = createHarness();
    const req = makeRequest({ method: "GET", url: continuityRoutePath });
    const res = makeResponse();

    await expect(harness.handler(req, res)).resolves.toBe(true);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/html");
    expect(res.body).toContain("Continuity Dashboard");
    expect(res.body).toContain("cont_1");
    expect(res.body).toContain("cont_2");
    expect(harness.service.status).toHaveBeenCalledWith(undefined);
  });

  it("treats a missing request method as GET once the route path matches", async () => {
    const harness = createHarness();
    const req = makeRequest({ method: "GET", url: continuityRoutePath });
    req.method = undefined;
    const res = makeResponse();

    await expect(harness.handler(req, res)).resolves.toBe(true);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Continuity Dashboard");
  });

  it("handles approve/reject/remove POST review actions", async () => {
    const harness = createHarness();
    for (const action of ["approve", "reject", "remove"] as const) {
      const req = makeRequest({
        method: "POST",
        url: continuityRoutePath,
        body: new URLSearchParams({
          action,
          id: "cont_1",
          agent: "alpha",
        }).toString(),
      });
      const res = makeResponse();

      await expect(harness.handler(req, res)).resolves.toBe(true);

      expect(harness.service.patch).toHaveBeenLastCalledWith({
        agentId: "alpha",
        id: "cont_1",
        action,
      });
      expect(res.statusCode).toBe(303);
      expect(res.headers.Location).toBe(continuityRoutePath);
    }
  });

  it("persists capture/recall toggle changes into plugins.entries.continuity.config", async () => {
    const harness = createHarness();
    const req = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({
        action: "save-config",
        captureMainDirect: "review",
        capturePairedDirect: "off",
        captureGroup: "auto",
        captureChannel: "review",
        captureMinConfidence: "0.61",
        reviewAutoApproveMain: "false",
        reviewRequireSource: "false",
        identityMode: "single_user",
        identityDefaultDirectSubjectId: "operator",
        recentEnabled: "false",
        recentMaxExcerpts: "5",
        recentMaxChars: "900",
        recentTtlHours: "12",
        recallMaxItems: "6",
        recallIncludeOpenLoops: "false",
      }).toString(),
    });
    const res = makeResponse();

    await expect(harness.handler(req, res)).resolves.toBe(true);

    expect(harness.writes).toHaveLength(1);
    const nextConfig = harness.getConfig() as {
      plugins?: {
        entries?: Record<string, { config?: Record<string, unknown> }>;
      };
    };
    const continuityConfig = nextConfig.plugins?.entries?.continuity?.config;
    expect(continuityConfig).toMatchObject({
      capture: {
        mainDirect: "review",
        pairedDirect: "off",
        group: "auto",
        channel: "review",
        minConfidence: 0.61,
      },
      review: {
        autoApproveMain: false,
        requireSource: false,
      },
      identity: {
        mode: "single_user",
        defaultDirectSubjectId: "operator",
        bindings: [{ subjectId: "owner", matches: [{ keyPrefix: "discord:direct:owner" }] }],
      },
      recent: {
        enabled: false,
        maxExcerpts: 5,
        maxChars: 900,
        ttlHours: 12,
      },
      recall: {
        maxItems: 6,
        includeOpenLoops: false,
      },
    });
    expect(res.statusCode).toBe(303);
  });

  it("sets and unsets plugins.slots.contextEngine from POST actions", async () => {
    const harness = createHarness();

    const disableReq = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({ action: "slot-disable" }).toString(),
    });
    const disableRes = makeResponse();
    await harness.handler(disableReq, disableRes);

    const configAfterDisable = harness.getConfig() as {
      plugins?: { slots?: Record<string, unknown> };
    };
    expect(configAfterDisable.plugins?.slots?.contextEngine).toBeUndefined();

    const enableReq = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({ action: "slot-enable" }).toString(),
    });
    const enableRes = makeResponse();
    await harness.handler(enableReq, enableRes);

    const configAfterEnable = harness.getConfig() as {
      plugins?: { slots?: Record<string, unknown> };
    };
    expect(configAfterEnable.plugins?.slots?.contextEngine).toBe("continuity");
  });

  it("handles save-config defaults, true booleans, and ignored patch actions without ids", async () => {
    const harness = createHarness();

    const saveReq = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({
        action: "save-config",
        captureMainDirect: "invalid",
        reviewAutoApproveMain: "on",
        reviewRequireSource: "maybe",
        recallIncludeOpenLoops: "true",
      }).toString(),
    });
    const saveRes = makeResponse();
    await harness.handler(saveReq, saveRes);

    const continuityConfig = (harness.getConfig() as {
      plugins?: { entries?: Record<string, { config?: Record<string, unknown> }> };
    }).plugins?.entries?.continuity?.config;
    expect(continuityConfig).toMatchObject({
      capture: {
        mainDirect: "auto",
        minConfidence: 0.75,
      },
      review: {
        autoApproveMain: true,
        requireSource: true,
      },
      identity: {
        mode: "hybrid",
        defaultDirectSubjectId: "owner",
      },
      recent: {
        enabled: false,
        maxExcerpts: 6,
        maxChars: 1200,
        ttlHours: 24,
      },
      recall: {
        includeOpenLoops: true,
      },
    });

    const noIdReq = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({
        action: "approve",
      }).toString(),
    });
    const noIdRes = makeResponse();
    await harness.handler(noIdReq, noIdRes);
    expect(harness.service.patch).not.toHaveBeenCalled();
  });

  it("creates missing plugin config scaffolding and clears unchecked booleans", async () => {
    const harness = createHarness({
      initialConfig: {},
    });
    const req = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: Buffer.from(
        new URLSearchParams({
          action: "save-config",
          captureMainDirect: "review",
          captureMinConfidence: "not-a-number",
          recallMaxItems: "not-a-number",
        }).toString(),
      ),
    });
    const res = makeResponse();

    await expect(harness.handler(req, res)).resolves.toBe(true);

    expect((harness.getConfig() as { plugins?: { entries?: Record<string, { config?: unknown }> } })
      .plugins?.entries?.continuity?.config).toMatchObject({
      capture: {
        mainDirect: "review",
        pairedDirect: "review",
        group: "off",
        channel: "off",
        minConfidence: 0.75,
      },
      review: {
        autoApproveMain: false,
        requireSource: false,
      },
      identity: {
        mode: "off",
        defaultDirectSubjectId: "owner",
        bindings: [],
      },
      recent: {
        enabled: false,
        maxExcerpts: 6,
        maxChars: 1200,
        ttlHours: 24,
      },
      recall: {
        maxItems: 4,
        includeOpenLoops: false,
      },
    });
    expect(res.statusCode).toBe(303);
  });

  it("returns false for unrelated paths and 405 for unsupported methods", async () => {
    const harness = createHarness();

    const otherPathReq = makeRequest({ method: "GET", url: "/plugins/other" });
    const otherPathRes = makeResponse();
    await expect(harness.handler(otherPathReq, otherPathRes)).resolves.toBe(false);

    const missingUrlReq = makeRequest({ method: "GET", url: "/plugins/other" });
    missingUrlReq.url = undefined;
    const missingUrlRes = makeResponse();
    await expect(harness.handler(missingUrlReq, missingUrlRes)).resolves.toBe(false);

    const putReq = makeRequest({ method: "PUT", url: continuityRoutePath });
    const putRes = makeResponse();
    await expect(harness.handler(putReq, putRes)).resolves.toBe(true);
    expect(putRes.statusCode).toBe(405);
    expect(putRes.headers.Allow).toBe("GET, POST");
  });

  it("returns 500 when POST handling fails", async () => {
    const harness = createHarness();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    harness.runtime.config.writeConfigFile = async () => {
      throw new Error("write failed");
    };
    const handler = createContinuityRouteHandler({
      runtime: harness.runtime as never,
      service: harness.service as never,
      logger,
    });

    const req = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({ action: "slot-enable" }).toString(),
    });
    const res = makeResponse();

    await expect(handler(req, res)).resolves.toBe(true);
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain("continuity route POST failed");
    expect(logger.error).toHaveBeenCalledWith(
      "continuity route POST failed: write failed",
    );
  });

  it("formats non-Error POST failures safely", async () => {
    const harness = createHarness();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    harness.runtime.config.writeConfigFile = async () => {
      throw "write failed";
    };
    const handler = createContinuityRouteHandler({
      runtime: harness.runtime as never,
      service: harness.service as never,
      logger,
    });

    const req = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({ action: "slot-enable" }).toString(),
    });
    const res = makeResponse();

    await expect(handler(req, res)).resolves.toBe(true);
    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("continuity route POST failed: write failed");
  });

  it("returns 500 when GET rendering fails", async () => {
    const harness = createHarness();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    harness.service.status.mockRejectedValue(new Error("status failed"));
    const handler = createContinuityRouteHandler({
      runtime: harness.runtime as never,
      service: harness.service as never,
      logger,
    });

    const req = makeRequest({ method: "GET", url: continuityRoutePath });
    const res = makeResponse();

    await expect(handler(req, res)).resolves.toBe(true);
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain("continuity route GET failed");
    expect(logger.error).toHaveBeenCalledWith(
      "continuity route GET failed: status failed",
    );
  });

  it("formats non-Error GET failures safely", async () => {
    const harness = createHarness();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    harness.service.status.mockRejectedValue("status failed");
    const handler = createContinuityRouteHandler({
      runtime: harness.runtime as never,
      service: harness.service as never,
      logger,
    });

    const req = makeRequest({ method: "GET", url: continuityRoutePath });
    const res = makeResponse();

    await expect(handler(req, res)).resolves.toBe(true);
    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("continuity route GET failed: status failed");
  });

  it("leaves unrelated slot selections unchanged and ignores empty actions", async () => {
    const harness = createHarness({
      initialConfig: {
        plugins: {
          slots: {
            contextEngine: "other",
          },
        },
      },
    });

    const disableReq = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({ action: "slot-disable" }).toString(),
    });
    const disableRes = makeResponse();
    await expect(harness.handler(disableReq, disableRes)).resolves.toBe(true);
    expect((harness.getConfig() as { plugins?: { slots?: Record<string, unknown> } }).plugins?.slots?.contextEngine).toBe("other");

    const noActionReq = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({ id: "cont_1" }).toString(),
    });
    const noActionRes = makeResponse();
    await expect(harness.handler(noActionReq, noActionRes)).resolves.toBe(true);
    expect(harness.service.patch).not.toHaveBeenCalled();
  });

  it("creates plugin slot scaffolding when enabling continuity from an empty config", async () => {
    const harness = createHarness({
      initialConfig: {},
    });
    const req = makeRequest({
      method: "POST",
      url: continuityRoutePath,
      body: new URLSearchParams({ action: "slot-enable" }).toString(),
    });
    const res = makeResponse();

    await expect(harness.handler(req, res)).resolves.toBe(true);
    expect((harness.getConfig() as { plugins?: { slots?: Record<string, unknown> } }).plugins?.slots)
      .toEqual({ contextEngine: "continuity" });
    expect(res.statusCode).toBe(303);
  });
});
