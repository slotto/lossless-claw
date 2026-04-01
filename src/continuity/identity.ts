import { normalizeAgentId } from "./session-key.js";
import { parseContinuitySessionScope } from "./scope.js";
import type {
  ContinuityBindingMatch,
  ContinuityScopeKind,
  ResolvedContinuityIdentityConfig,
} from "./types.js";

export type ResolvedContinuityScope = {
  scopeKind: ContinuityScopeKind;
  scopeId: string;
  subjectId?: string;
  normalizedSessionKey?: string;
};

function matchesBinding(params: {
  rawKey: string;
  normalizedKey: string;
  channel?: string;
  match: ContinuityBindingMatch;
}): boolean {
  const { match } = params;
  if (match.channel && match.channel !== params.channel) {
    return false;
  }
  if (match.rawKeyPrefix && !params.rawKey.startsWith(match.rawKeyPrefix)) {
    return false;
  }
  if (match.keyPrefix && !params.normalizedKey.startsWith(match.keyPrefix)) {
    return false;
  }
  return true;
}

function resolveBoundSubjectId(params: {
  identity: ResolvedContinuityIdentityConfig;
  rawKey: string;
  normalizedKey: string;
  channel?: string;
}): string | undefined {
  for (const binding of params.identity.bindings) {
    for (const match of binding.matches) {
      if (
        matchesBinding({
          rawKey: params.rawKey,
          normalizedKey: params.normalizedKey,
          channel: params.channel,
          match,
        })
      ) {
        return binding.subjectId;
      }
    }
  }
  return undefined;
}

export function scopeIdForAgent(agentId: string): string {
  return `agent:${normalizeAgentId(agentId)}`;
}

export function scopeIdForSubject(subjectId: string): string {
  return `subject:${normalizeAgentId(subjectId)}`;
}

export function scopeIdForSession(normalizedSessionKey: string): string {
  return `session:${normalizedSessionKey}`;
}

export function resolveContinuityScope(params: {
  agentId: string;
  sessionKey?: string;
  identity: ResolvedContinuityIdentityConfig;
}): ResolvedContinuityScope {
  const agentId = normalizeAgentId(params.agentId);
  const parsed = parseContinuitySessionScope(params.sessionKey);
  const normalizedSessionKey = parsed.normalizedSessionKey;
  
  if (!normalizedSessionKey) {
    return {
      scopeKind: "agent",
      scopeId: scopeIdForAgent(agentId),
      normalizedSessionKey,
    };
  }

  // Check for explicit subject binding FIRST (before chatType check)
  // This allows channels to be bound to subjects
  const rawKey = params.sessionKey!.trim().toLowerCase();
  const boundSubjectId = resolveBoundSubjectId({
    identity: params.identity,
    rawKey,
    normalizedKey: normalizedSessionKey,
    channel: parsed.channel,
  });
  if (boundSubjectId) {
    return {
      scopeKind: "subject",
      scopeId: scopeIdForSubject(boundSubjectId),
      subjectId: boundSubjectId,
      normalizedSessionKey,
    };
  }

  // Only reject non-direct channels if NO binding matched
  if (parsed.chatType !== "direct") {
    return {
      scopeKind: "agent",
      scopeId: scopeIdForAgent(agentId),
      normalizedSessionKey,
    };
  }

  switch (params.identity.mode) {
    case "single_user":
      return {
        scopeKind: "subject",
        scopeId: scopeIdForSubject(params.identity.defaultDirectSubjectId),
        subjectId: params.identity.defaultDirectSubjectId,
        normalizedSessionKey,
      };
    case "hybrid":
      return {
        scopeKind: "subject",
        scopeId: scopeIdForSubject(params.identity.defaultDirectSubjectId),
        subjectId: params.identity.defaultDirectSubjectId,
        normalizedSessionKey,
      };
    case "explicit":
      return {
        scopeKind: "session",
        scopeId: scopeIdForSession(normalizedSessionKey),
        normalizedSessionKey,
      };
    case "off":
    default:
      return {
        scopeKind: "agent",
        scopeId: scopeIdForAgent(agentId),
        normalizedSessionKey,
      };
  }
}
