import type {
  ContinuityBindingMatch,
  ContinuityCaptureMode,
  ContinuityIdentityMode,
  ContinuityKind,
  ContinuityPluginConfig,
  ContinuitySubjectBinding,
  SessionSendPolicyConfig,
  ResolvedContinuityConfig,
} from "./types.js";
import { normalizeAgentId } from "./session-key.js";

export const CONTINUITY_KIND_ORDER: ContinuityKind[] = [
  "preference",
  "decision",
  "fact",
  "open_loop",
];

export const CONTINUITY_FILE_BY_KIND: Record<ContinuityKind, string> = {
  fact: "memory/continuity/facts.md",
  preference: "memory/continuity/preferences.md",
  decision: "memory/continuity/decisions.md",
  open_loop: "memory/continuity/open-loops.md",
};

const DEFAULT_SCOPE: SessionSendPolicyConfig = {
  default: "deny",
  rules: [{ action: "allow", match: { chatType: "direct" } }],
};
const DEFAULT_SCOPE_DEFAULT: "allow" | "deny" = "deny";
const DEFAULT_IDENTITY_MODE: ContinuityIdentityMode = "off";
const DEFAULT_DIRECT_SUBJECT_ID = "owner";

export const DEFAULT_CONTINUITY_CONFIG: ResolvedContinuityConfig = {
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
    mode: DEFAULT_IDENTITY_MODE,
    defaultDirectSubjectId: DEFAULT_DIRECT_SUBJECT_ID,
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
    includeOpenLoops: true,
    scope: DEFAULT_SCOPE,
  },
};

function resolveCaptureMode(
  value: unknown,
  fallback: ContinuityCaptureMode,
): ContinuityCaptureMode {
  return value === "off" || value === "review" || value === "auto" ? value : fallback;
}

function resolvePositiveNumber(
  value: unknown,
  fallback: number,
  max: number,
  allowZero = false,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  if (!allowZero && value === 0) {
    return fallback;
  }
  return Math.min(value, max);
}

function resolveScopeDefault(value: unknown): "allow" | "deny" {
  return value === "allow" || value === "deny" ? value : DEFAULT_SCOPE_DEFAULT;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeLowercase(value: unknown): string | undefined {
  const trimmed = normalizeString(value);
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function resolveInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  if (normalized < min) {
    return fallback;
  }
  return Math.min(normalized, max);
}

function resolveIdentityMode(value: unknown): ContinuityIdentityMode {
  return value === "off" || value === "single_user" || value === "explicit" || value === "hybrid"
    ? value
    : DEFAULT_IDENTITY_MODE;
}

function cloneBindingMatch(match: ContinuityBindingMatch | undefined): ContinuityBindingMatch | null {
  if (!match || typeof match !== "object") {
    return null;
  }
  const cloned = {
    channel: normalizeLowercase(match.channel),
    keyPrefix: normalizeLowercase(match.keyPrefix),
    rawKeyPrefix: normalizeLowercase(match.rawKeyPrefix),
  };
  return cloned.channel || cloned.keyPrefix || cloned.rawKeyPrefix ? cloned : null;
}

function cloneBindings(bindings: Array<ContinuitySubjectBinding | undefined> | undefined) {
  return (bindings ?? [])
    .map((binding) => {
      if (!binding || typeof binding !== "object") {
        return null;
      }
      const matches = Array.isArray(binding.matches)
        ? binding.matches
            .map((match) => cloneBindingMatch(match))
            .filter((match): match is ContinuityBindingMatch => Boolean(match))
        : [];
      const subjectId = normalizeAgentId(
        normalizeString(binding.subjectId) ?? DEFAULT_DIRECT_SUBJECT_ID,
      );
      return {
        subjectId,
        matches,
      };
    })
    .filter((binding): binding is NonNullable<typeof binding> => Boolean(binding));
}

function cloneScope(scope?: SessionSendPolicyConfig): SessionSendPolicyConfig {
  if (!scope) {
    return {
      default: DEFAULT_SCOPE.default,
      rules: DEFAULT_SCOPE.rules?.map((rule) => ({
        action: rule!.action,
        match: { ...rule!.match },
      })),
    };
  }
  return {
    default: resolveScopeDefault(scope.default),
    rules: scope.rules?.map((rule) =>
      rule
        ? {
            action: rule.action,
            match: rule.match ? { ...rule.match } : undefined,
          }
        : undefined,
    ),
  };
}

export function resolveContinuityConfig(raw?: unknown): ResolvedContinuityConfig {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as ContinuityPluginConfig) : {};
  const capture = input.capture ?? {};
  const review = input.review ?? {};
  const identity = input.identity ?? {};
  const recent = input.recent ?? {};
  const recall = input.recall ?? {};
  return {
    capture: {
      mainDirect: resolveCaptureMode(
        capture.mainDirect,
        DEFAULT_CONTINUITY_CONFIG.capture.mainDirect,
      ),
      pairedDirect: resolveCaptureMode(
        capture.pairedDirect,
        DEFAULT_CONTINUITY_CONFIG.capture.pairedDirect,
      ),
      group: resolveCaptureMode(capture.group, DEFAULT_CONTINUITY_CONFIG.capture.group),
      channel: resolveCaptureMode(capture.channel, DEFAULT_CONTINUITY_CONFIG.capture.channel),
      minConfidence: resolvePositiveNumber(
        capture.minConfidence,
        DEFAULT_CONTINUITY_CONFIG.capture.minConfidence,
        1,
        true,
      ),
    },
    review: {
      autoApproveMain:
        typeof review.autoApproveMain === "boolean"
          ? review.autoApproveMain
          : DEFAULT_CONTINUITY_CONFIG.review.autoApproveMain,
      requireSource:
        typeof review.requireSource === "boolean"
          ? review.requireSource
          : DEFAULT_CONTINUITY_CONFIG.review.requireSource,
    },
    identity: {
      mode: resolveIdentityMode(identity.mode),
      defaultDirectSubjectId: normalizeAgentId(
        normalizeString(identity.defaultDirectSubjectId) ?? DEFAULT_DIRECT_SUBJECT_ID,
      ),
      bindings: cloneBindings(identity.bindings),
    },
    recent: {
      enabled:
        typeof recent.enabled === "boolean"
          ? recent.enabled
          : DEFAULT_CONTINUITY_CONFIG.recent.enabled,
      maxExcerpts: resolveInteger(
        recent.maxExcerpts,
        DEFAULT_CONTINUITY_CONFIG.recent.maxExcerpts,
        1,
        12,
      ),
      maxChars: resolveInteger(
        recent.maxChars,
        DEFAULT_CONTINUITY_CONFIG.recent.maxChars,
        200,
        4000,
      ),
      ttlHours: resolveInteger(
        recent.ttlHours,
        DEFAULT_CONTINUITY_CONFIG.recent.ttlHours,
        1,
        168,
      ),
    },
    recall: {
      maxItems: Math.max(
        1,
        Math.trunc(
          resolvePositiveNumber(recall.maxItems, DEFAULT_CONTINUITY_CONFIG.recall.maxItems, 12),
        ),
      ),
      includeOpenLoops:
        typeof recall.includeOpenLoops === "boolean"
          ? recall.includeOpenLoops
          : DEFAULT_CONTINUITY_CONFIG.recall.includeOpenLoops,
      scope: cloneScope(recall.scope),
    },
  };
}
