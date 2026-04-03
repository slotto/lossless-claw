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
  const normalizedSessionKey = parsed.normalizedKey;
  
  // Default to agent scope for all sessions
  // Continuity now works based on participants (which agents were in the channel)
  // rather than subjectId (which human was involved)
  return {
    scopeKind: "agent",
    scopeId: scopeIdForAgent(agentId),
    normalizedSessionKey,
  };
}
