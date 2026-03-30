import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig, PluginLogger, PluginRuntime } from "openclaw/plugin-sdk";
import { resolveContinuityConfig } from "./config.js";
import type { ContinuityService } from "./service.js";
import type {
  ContinuityCaptureMode,
  ContinuityIdentityMode,
  ContinuityRecord,
  ContinuitySubjectSummary,
} from "./types.js";

const CONTINUITY_ROUTE_PATH = "/plugins/continuity";

type ContinuityRouteParams = {
  runtime: PluginRuntime;
  service: ContinuityService;
  logger?: PluginLogger;
};

function parseNumber(value: string | null | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* v8 ignore start */
function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "off") {
    return false;
  }
  return fallback;
}
/* v8 ignore stop */

function parseCaptureMode(
  value: string | null | undefined,
  fallback: ContinuityCaptureMode,
): ContinuityCaptureMode {
  return value === "off" || value === "review" || value === "auto" ? value : fallback;
}

function parseIdentityMode(
  value: string | null | undefined,
  fallback: ContinuityIdentityMode,
): ContinuityIdentityMode {
  return value === "off" ||
    value === "single_user" ||
    value === "explicit" ||
    value === "hybrid"
    ? value
    : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readPluginConfig(config: OpenClawConfig): Record<string, unknown> {
  const entry = config.plugins?.entries?.continuity;
  return entry && typeof entry === "object" && entry.config && typeof entry.config === "object"
    ? { ...(entry.config as Record<string, unknown>) }
    : {};
}

function withUpdatedPluginConfig(
  config: OpenClawConfig,
  continuityConfig: Record<string, unknown>,
): OpenClawConfig {
  const plugins = config.plugins ?? {};
  const entries = plugins.entries ?? {};
  const continuityEntry = entries.continuity ?? {};
  return {
    ...config,
    plugins: {
      ...plugins,
      entries: {
        ...entries,
        continuity: {
          ...continuityEntry,
          config: continuityConfig,
        },
      },
    },
  };
}

function withUpdatedSlot(config: OpenClawConfig, enabled: boolean): OpenClawConfig {
  const plugins = config.plugins ?? {};
  const slots = { ...(plugins.slots ?? {}) };
  if (enabled) {
    slots.contextEngine = "continuity";
  } else if (slots.contextEngine === "continuity") {
    delete slots.contextEngine;
  }
  return {
    ...config,
    plugins: {
      ...plugins,
      slots,
    },
  };
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeHtml(res: ServerResponse, html: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function redirectToDashboard(res: ServerResponse): void {
  res.statusCode = 303;
  res.setHeader("Location", CONTINUITY_ROUTE_PATH);
  res.end();
}

/* v8 ignore start */
function renderOption(value: ContinuityCaptureMode, selected: ContinuityCaptureMode): string {
  return `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`;
}

function renderIdentityOption(value: ContinuityIdentityMode, selected: ContinuityIdentityMode): string {
  return `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`;
}

function renderBindings(bindings: ReturnType<typeof resolveContinuityConfig>["identity"]["bindings"]): string {
  if (bindings.length === 0) {
    return "<p>No explicit subject bindings configured.</p>";
  }
  return `<ul>${bindings
    .map(
      (binding) =>
        `<li><strong>${escapeHtml(binding.subjectId)}</strong>: ${escapeHtml(
          binding.matches
            .map((match) =>
              [match.channel ? `channel=${match.channel}` : undefined, match.keyPrefix, match.rawKeyPrefix]
                .filter(Boolean)
                .join(" "),
            )
            .join(" | "),
        )}</li>`,
    )
    .join("")}</ul>`;
}

function renderSubjectRows(subjects: ContinuitySubjectSummary[]): string {
  if (subjects.length === 0) {
    return `<tr><td colspan="7"><em>None</em></td></tr>`;
  }
  return subjects
    .map(
      (subject) => `<tr>
  <td><code>${escapeHtml(subject.subjectId)}</code></td>
  <td>${subject.approvedCount}</td>
  <td>${subject.pendingCount}</td>
  <td>${subject.rejectedCount}</td>
  <td>${subject.recentCount}</td>
  <td>${subject.lastSeenAt ? escapeHtml(new Date(subject.lastSeenAt).toISOString()) : ""}</td>
  <td>${escapeHtml(subject.sessionKeys.join(", "))}</td>
</tr>`,
    )
    .join("\n");
}

function renderDashboard(params: {
  agentId?: string;
  subjectId?: string;
  status: Awaited<ReturnType<ContinuityService["status"]>>;
  continuityConfig: ReturnType<typeof resolveContinuityConfig>;
  subjects: ContinuitySubjectSummary[];
  pendingRows: string;
  approvedRows: string;
}): string {
  const config = params.continuityConfig;
  const agentValue = params.agentId ? escapeHtml(params.agentId) : "";
  const subjectValue = params.subjectId ? escapeHtml(params.subjectId) : "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Continuity Plugin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7f4;
        --card: #ffffff;
        --text: #10221a;
        --muted: #5d7469;
        --line: #d6e2db;
        --accent: #1f6f43;
        --accent-weak: #d8f2e3;
      }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        background: radial-gradient(circle at top right, #e0f7ea, var(--bg));
        color: var(--text);
      }
      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 20px;
        display: grid;
        gap: 16px;
      }
      section {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 16px;
      }
      h1,
      h2 {
        margin: 0 0 8px;
      }
      p,
      li {
        color: var(--muted);
      }
      .row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .grid {
        display: grid;
        gap: 10px;
      }
      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .stats {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .stat {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 12px;
        background: #fbfdfb;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 0.95rem;
      }
      input,
      select,
      button {
        font: inherit;
        padding: 8px 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
      }
      button {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
        cursor: pointer;
      }
      button.secondary {
        background: white;
        color: var(--text);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        border-bottom: 1px solid var(--line);
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }
      code {
        background: var(--accent-weak);
        border-radius: 4px;
        padding: 1px 4px;
      }
      .muted {
        color: var(--muted);
      }
      @media (max-width: 700px) {
        main {
          padding: 10px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Continuity Dashboard</h1>
        <p>Plugin-owned continuity controls, same-user direct sharing summary, and review workflow.</p>
        <div class="row">
          <strong>Slot status:</strong>
          <span>${params.status.slotSelected ? "active" : "inactive"}</span>
          <form method="post">
            <input type="hidden" name="action" value="${params.status.slotSelected ? "slot-disable" : "slot-enable"}" />
            <button type="submit" class="secondary">${params.status.slotSelected ? "Deactivate slot" : "Activate slot"}</button>
          </form>
        </div>
      </section>

      <section>
        <h2>Agent Scope</h2>
        <form method="get" class="row">
          <label>
            Agent Id (optional)
            <input name="agent" value="${agentValue}" placeholder="main" />
          </label>
          <label>
            Subject Id (optional)
            <input name="subject" value="${subjectValue}" placeholder="owner" />
          </label>
          <button type="submit">Refresh</button>
        </form>
      </section>

      <section>
        <h2>Summary</h2>
        <div class="stats">
          <div class="stat"><strong>Pending</strong><div>${params.status.counts.pending}</div></div>
          <div class="stat"><strong>Approved</strong><div>${params.status.counts.approved}</div></div>
          <div class="stat"><strong>Subjects</strong><div>${params.status.subjectCount}</div></div>
          <div class="stat"><strong>Recent Subjects</strong><div>${params.status.recentSubjectCount}</div></div>
          <div class="stat"><strong>Identity Mode</strong><div>${escapeHtml(params.status.identity.mode)}</div></div>
          <div class="stat"><strong>Legacy Direct</strong><div>${params.status.legacyUnscopedDirectCount}</div></div>
        </div>
      </section>

      <section>
        <h2>Capture and Recall Settings</h2>
        <form method="post" class="grid">
          <input type="hidden" name="action" value="save-config" />
          <input type="hidden" name="agent" value="${agentValue}" />
          <div class="grid two">
            <label>Main direct capture
              <select name="captureMainDirect">
                ${renderOption("off", config.capture.mainDirect)}
                ${renderOption("review", config.capture.mainDirect)}
                ${renderOption("auto", config.capture.mainDirect)}
              </select>
            </label>
            <label>Paired direct capture
              <select name="capturePairedDirect">
                ${renderOption("off", config.capture.pairedDirect)}
                ${renderOption("review", config.capture.pairedDirect)}
                ${renderOption("auto", config.capture.pairedDirect)}
              </select>
            </label>
            <label>Group capture
              <select name="captureGroup">
                ${renderOption("off", config.capture.group)}
                ${renderOption("review", config.capture.group)}
                ${renderOption("auto", config.capture.group)}
              </select>
            </label>
            <label>Channel capture
              <select name="captureChannel">
                ${renderOption("off", config.capture.channel)}
                ${renderOption("review", config.capture.channel)}
                ${renderOption("auto", config.capture.channel)}
              </select>
            </label>
            <label>Identity mode
              <select name="identityMode">
                ${renderIdentityOption("off", config.identity.mode)}
                ${renderIdentityOption("single_user", config.identity.mode)}
                ${renderIdentityOption("explicit", config.identity.mode)}
                ${renderIdentityOption("hybrid", config.identity.mode)}
              </select>
            </label>
            <label>Default direct subject id
              <input name="identityDefaultDirectSubjectId" value="${escapeHtml(config.identity.defaultDirectSubjectId)}" />
            </label>
            <label>Min confidence
              <input type="number" name="captureMinConfidence" min="0" max="1" step="0.01" value="${config.capture.minConfidence}" />
            </label>
            <label>Max recall items
              <input type="number" name="recallMaxItems" min="1" max="12" step="1" value="${config.recall.maxItems}" />
            </label>
            <label>Recent max excerpts
              <input type="number" name="recentMaxExcerpts" min="1" max="12" step="1" value="${config.recent.maxExcerpts}" />
            </label>
            <label>Recent max chars
              <input type="number" name="recentMaxChars" min="200" max="4000" step="1" value="${config.recent.maxChars}" />
            </label>
            <label>Recent TTL hours
              <input type="number" name="recentTtlHours" min="1" max="168" step="1" value="${config.recent.ttlHours}" />
            </label>
          </div>
          <div class="row">
            <label><input type="checkbox" name="reviewAutoApproveMain" value="true"${config.review.autoApproveMain ? " checked" : ""} /> Auto-approve main direct</label>
            <label><input type="checkbox" name="reviewRequireSource" value="true"${config.review.requireSource ? " checked" : ""} /> Require source</label>
            <label><input type="checkbox" name="recallIncludeOpenLoops" value="true"${config.recall.includeOpenLoops ? " checked" : ""} /> Include open loops</label>
            <label><input type="checkbox" name="recentEnabled" value="true"${config.recent.enabled ? " checked" : ""} /> Enable recent direct context</label>
          </div>
          <button type="submit">Save settings</button>
        </form>
      </section>

      <section>
        <h2>Subject Bindings</h2>
        <p>Bindings are read-only in the dashboard. Edit them in config and use this page to verify that they loaded correctly.</p>
        ${renderBindings(config.identity.bindings)}
      </section>

      <section>
        <h2>Bound Subjects</h2>
        <table>
          <thead>
            <tr><th>Subject</th><th>Approved</th><th>Pending</th><th>Rejected</th><th>Recent</th><th>Last Seen</th><th>Sessions</th></tr>
          </thead>
          <tbody>
            ${renderSubjectRows(params.subjects)}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Pending Review</h2>
        <table>
          <thead>
            <tr><th>Id</th><th>Kind</th><th>Subject</th><th>Scope</th><th>Text</th><th>Source</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${params.pendingRows}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Approved</h2>
        <table>
          <thead>
            <tr><th>Id</th><th>Kind</th><th>Subject</th><th>Scope</th><th>Text</th><th>Source</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${params.approvedRows}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

function renderRecordRows(params: {
  records: ContinuityRecord[];
  agentId?: string;
  subjectId?: string;
  actions: Array<{ value: string; label: string }>;
}): string {
  if (params.records.length === 0) {
    return `<tr><td colspan="7"><em>None</em></td></tr>`;
  }
  return params.records
    .map((record) => {
      const source = record.source.sessionKey ?? record.source.sessionId ?? "unknown";
      const actionButtons = params.actions
        .map(
          (action) => `<button type="submit" name="action" value="${action.value}">${action.label}</button>`,
        )
        .join(" ");
      return `<tr>
  <td><code>${escapeHtml(record.id)}</code></td>
  <td>${escapeHtml(record.kind)}</td>
  <td>${escapeHtml(record.subjectId ?? "")}</td>
  <td>${escapeHtml(record.scopeKind)}</td>
  <td>${escapeHtml(record.text)}</td>
  <td>${escapeHtml(source)}</td>
  <td>
    <form method="post" class="row">
      <input type="hidden" name="id" value="${escapeHtml(record.id)}" />
      <input type="hidden" name="agent" value="${escapeHtml(params.agentId ?? "")}" />
      <input type="hidden" name="subject" value="${escapeHtml(params.subjectId ?? "")}" />
      ${actionButtons}
    </form>
  </td>
</tr>`;
    })
    .join("\n");
}
/* v8 ignore stop */

async function handleSaveConfig(params: {
  runtime: PluginRuntime;
  currentConfig: OpenClawConfig;
  form: URLSearchParams;
}): Promise<void> {
  const continuityConfig = resolveContinuityConfig(readPluginConfig(params.currentConfig));
  const nextContinuityConfig = {
    capture: {
      mainDirect: parseCaptureMode(
        params.form.get("captureMainDirect"),
        continuityConfig.capture.mainDirect,
      ),
      pairedDirect: parseCaptureMode(
        params.form.get("capturePairedDirect"),
        continuityConfig.capture.pairedDirect,
      ),
      group: parseCaptureMode(params.form.get("captureGroup"), continuityConfig.capture.group),
      channel: parseCaptureMode(
        params.form.get("captureChannel"),
        continuityConfig.capture.channel,
      ),
      minConfidence: parseNumber(
        params.form.get("captureMinConfidence"),
        continuityConfig.capture.minConfidence,
      ),
    },
    review: {
      autoApproveMain: params.form.has("reviewAutoApproveMain")
        ? parseBoolean(params.form.get("reviewAutoApproveMain"), true)
        : false,
      requireSource: params.form.has("reviewRequireSource")
        ? parseBoolean(params.form.get("reviewRequireSource"), true)
        : false,
    },
    identity: {
      mode: parseIdentityMode(params.form.get("identityMode"), continuityConfig.identity.mode),
      defaultDirectSubjectId:
        params.form.get("identityDefaultDirectSubjectId")?.trim() ||
        continuityConfig.identity.defaultDirectSubjectId,
      bindings: continuityConfig.identity.bindings,
    },
    recent: {
      enabled: params.form.has("recentEnabled")
        ? parseBoolean(params.form.get("recentEnabled"), true)
        : false,
      maxExcerpts: parseNumber(
        params.form.get("recentMaxExcerpts"),
        continuityConfig.recent.maxExcerpts,
      ),
      maxChars: parseNumber(params.form.get("recentMaxChars"), continuityConfig.recent.maxChars),
      ttlHours: parseNumber(params.form.get("recentTtlHours"), continuityConfig.recent.ttlHours),
    },
    recall: {
      maxItems: parseNumber(params.form.get("recallMaxItems"), continuityConfig.recall.maxItems),
      includeOpenLoops: params.form.has("recallIncludeOpenLoops")
        ? parseBoolean(params.form.get("recallIncludeOpenLoops"), true)
        : false,
      scope: continuityConfig.recall.scope,
    },
  };

  const nextConfig = withUpdatedPluginConfig(params.currentConfig, nextContinuityConfig);
  await params.runtime.config.writeConfigFile(nextConfig);
}

async function handlePost(params: {
  runtime: PluginRuntime;
  service: ContinuityService;
  config: OpenClawConfig;
  body: URLSearchParams;
}): Promise<void> {
  const action = params.body.get("action")?.trim() ?? "";
  const agentId = params.body.get("agent")?.trim() || undefined;

  if (action === "save-config") {
    await handleSaveConfig({
      runtime: params.runtime,
      currentConfig: params.config,
      form: params.body,
    });
    return;
  }

  if (action === "slot-enable" || action === "slot-disable") {
    const nextConfig = withUpdatedSlot(params.config, action === "slot-enable");
    await params.runtime.config.writeConfigFile(nextConfig);
    return;
  }

  const id = params.body.get("id")?.trim();
  if (!id) {
    return;
  }

  if (action === "approve" || action === "reject" || action === "remove") {
    await params.service.patch({
      agentId,
      id,
      action,
    });
  }
}

export function createContinuityRouteHandler(params: ContinuityRouteParams) {
  return async function continuityRouteHandler(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const pathname = req.url ? new URL(req.url, "http://localhost").pathname : "";
    if (pathname !== CONTINUITY_ROUTE_PATH) {
      return false;
    }

    const method = req.method?.toUpperCase() ?? "GET";
    if (method === "POST") {
      try {
        const raw = await readRequestBody(req);
        const form = new URLSearchParams(raw);
        const config = params.runtime.config.loadConfig();
        await handlePost({
          runtime: params.runtime,
          service: params.service,
          config,
          body: form,
        });
        redirectToDashboard(res);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        params.logger?.error(`continuity route POST failed: ${message}`);
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("continuity route POST failed");
      }
      return true;
    }

    if (method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, POST");
      res.end();
      return true;
    }

    try {
      const requestUrl = new URL(req.url!, "http://localhost");
      const agentId = requestUrl.searchParams.get("agent")?.trim() || undefined;
      const subjectId = requestUrl.searchParams.get("subject")?.trim() || undefined;
      const status = await params.service.status(agentId);
      const pending = await params.service.list({
        agentId,
        filters: { state: "pending", subjectId, limit: 50 },
      });
      const approved = await params.service.list({
        agentId,
        filters: { state: "approved", subjectId, limit: 50 },
      });
      const subjects = await params.service.subjects({ agentId, limit: 50 });
      const config = params.runtime.config.loadConfig();
      const continuityConfig = resolveContinuityConfig(readPluginConfig(config));

      const html = renderDashboard({
        agentId,
        subjectId,
        status,
        continuityConfig,
        subjects,
        pendingRows: renderRecordRows({
          records: pending,
          agentId,
          subjectId,
          actions: [
            { value: "approve", label: "Approve" },
            { value: "reject", label: "Reject" },
            { value: "remove", label: "Remove" },
          ],
        }),
        approvedRows: renderRecordRows({
          records: approved,
          agentId,
          subjectId,
          actions: [{ value: "remove", label: "Remove" }],
        }),
      });

      writeHtml(res, html);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      params.logger?.error(`continuity route GET failed: ${message}`);
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("continuity route GET failed");
    }

    return true;
  };
}

export const continuityRoutePath = CONTINUITY_ROUTE_PATH;
