import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk";

export const DEFAULT_AGENT_ID = "main";

const VALID_AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_AGENT_ID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

export type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

export function parseAgentSessionKey(
  sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "agent") {
    return null;
  }
  const agentId = parts[1]?.trim();
  const rest = parts.slice(2).join(":");
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
}

const THREAD_SESSION_MARKERS = [":thread:", ":topic:"];

export function resolveThreadParentSessionKey(
  sessionKey: string | undefined | null,
): string | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  let idx = -1;
  for (const marker of THREAD_SESSION_MARKERS) {
    const candidate = normalized.lastIndexOf(marker);
    if (candidate > idx) {
      idx = candidate;
    }
  }
  if (idx <= 0) {
    return null;
  }
  return raw.slice(0, idx).trim();
}

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  if (VALID_AGENT_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_AGENT_ID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function resolveDefaultAgentId(config: OpenClawConfig): string {
  const entries = Array.isArray(config.agents?.list) ? config.agents.list : [];
  if (entries.length === 0) {
    return DEFAULT_AGENT_ID;
  }
  const defaults = entries.filter((entry) => entry && typeof entry === "object" && entry.default);
  const chosen = (defaults[0] ?? entries[0])?.id;
  return normalizeAgentId(typeof chosen === "string" ? chosen : undefined);
}

export function resolveSessionAgentId(params: {
  sessionKey?: string;
  config: OpenClawConfig;
}): string {
  const parsed = parseAgentSessionKey(params.sessionKey);
  if (parsed?.agentId) {
    return normalizeAgentId(parsed.agentId);
  }
  return resolveDefaultAgentId(params.config);
}

export function resolveAgentWorkspaceDir(params: {
  config: OpenClawConfig;
  agentId: string;
  stateDir: string;
}): string {
  const normalizedAgentId = normalizeAgentId(params.agentId);
  const entries = Array.isArray(params.config.agents?.list) ? params.config.agents.list : [];
  const entry = entries.find((candidate) => normalizeAgentId(candidate?.id) === normalizedAgentId);
  const entryWorkspace = typeof entry?.workspace === "string" ? entry.workspace.trim() : "";
  if (entryWorkspace) {
    return path.resolve(entryWorkspace);
  }

  const defaultAgentId = resolveDefaultAgentId(params.config);
  if (normalizedAgentId === defaultAgentId) {
    const defaultWorkspace =
      typeof params.config.agents?.defaults?.workspace === "string"
        ? params.config.agents.defaults.workspace.trim()
        : "";
    if (defaultWorkspace) {
      return path.resolve(defaultWorkspace);
    }
  }

  return path.join(path.resolve(params.stateDir), `workspace-${normalizedAgentId}`);
}
