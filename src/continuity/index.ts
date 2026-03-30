export {
  CONTINUITY_FILE_BY_KIND,
  CONTINUITY_KIND_ORDER,
  DEFAULT_CONTINUITY_CONFIG,
  resolveContinuityConfig,
} from "./config.js";
export { ErrorCodes, errorShape } from "./errors.js";
export { extractContinuityMatches, isPromptInjectionShaped } from "./extractor.js";
export {
  ContinuityContextEngine,
  resetCompactDelegateForTesting,
  setCompactDelegateForTesting,
} from "./engine.js";
export {
  resolveContinuityScope,
  scopeIdForAgent,
  scopeIdForSession,
  scopeIdForSubject,
} from "./identity.js";
export { createContinuityRouteHandler, continuityRoutePath } from "./route.js";
export { classifyContinuitySource, isContinuityScopeAllowed } from "./scope.js";
export { ContinuityService, createContinuityService } from "./service.js";
export { registerContinuityCli } from "./cli.js";
export { defaultRuntime } from "./runtime.js";
export type {
  ContinuityAgentMessage,
  ContinuityBindingMatch,
  ContinuityCandidate,
  ContinuityCaptureConfig,
  ContinuityCaptureInput,
  ContinuityCaptureMode,
  ContinuityExplainResult,
  ContinuityExtractionMatch,
  ContinuityIdentityConfig,
  ContinuityIdentityMode,
  ContinuityItem,
  ContinuityKind,
  ContinuityListFilters,
  ContinuityPatchAction,
  ContinuityPatchResult,
  ContinuityPending,
  ContinuityPluginConfig,
  ContinuityRecentConfig,
  ContinuityRecentEntry,
  ContinuityRecallConfig,
  ContinuityRecord,
  ContinuityRejected,
  ContinuityReviewConfig,
  ContinuityReviewState,
  ContinuityScopeKind,
  ContinuitySource,
  ContinuitySourceClass,
  ContinuityStatus,
  ContinuityStoreFile,
  ContinuitySubjectBinding,
  ContinuitySubjectSummary,
  ResolvedContinuityConfig,
  ResolvedContinuityIdentityConfig,
  ResolvedContinuityRecentConfig,
  ResolvedContinuitySubjectBinding,
  SessionSendPolicyConfig,
  SessionSendPolicyRule,
} from "./types.js";
