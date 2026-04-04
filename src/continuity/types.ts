/* v8 ignore file */
export type SessionSendPolicyRule = {
  action: "allow" | "deny";
  match?: {
    channel?: string;
    chatType?: "direct" | "group" | "channel";
    keyPrefix?: string;
    rawKeyPrefix?: string;
  };
};

export type SessionSendPolicyConfig = {
  default?: "allow" | "deny";
  rules?: Array<SessionSendPolicyRule | undefined>;
};

export type ContinuityAgentMessage = {
  role: string;
  content?: unknown;
  timestamp?: number;
};

export type ContinuityKind = "fact" | "preference" | "decision" | "open_loop";
export type ContinuityReviewState = "pending" | "approved" | "rejected";
export type ContinuityCaptureMode = "off" | "review" | "auto";
export type ContinuitySourceClass = "main_direct" | "paired_direct" | "group" | "channel";
export type ContinuityScopeKind = "agent" | "subject" | "session";
export type ContinuityIdentityMode = "off" | "single_user" | "explicit" | "hybrid";

export type ContinuityBindingMatch = {
  channel?: string;
  keyPrefix?: string;
  rawKeyPrefix?: string;
};

export type ContinuitySubjectBinding = {
  subjectId?: string;
  matches?: Array<ContinuityBindingMatch | undefined>;
};

export type ResolvedContinuitySubjectBinding = {
  subjectId: string;
  matches: ContinuityBindingMatch[];
};

export type ContinuitySource = {
  role: "user" | "assistant";
  sessionKey?: string;
  sessionId?: string;
  excerpt: string;
};

export type ContinuityBaseRecord = {
  id: string;
  kind: ContinuityKind;
  text: string;
  normalizedText: string;
  confidence: number;
  sourceClass: ContinuitySourceClass;
  scopeKind: ContinuityScopeKind;
  scopeId: string;
  subjectId?: string;
  source: ContinuitySource;
  createdAt: number;
  updatedAt: number;
};

export type ContinuityPending = ContinuityBaseRecord & {
  reviewState: "pending";
  filePath?: undefined;
  approvedAt?: undefined;
  rejectedAt?: undefined;
};

export type ContinuityRejected = ContinuityBaseRecord & {
  reviewState: "rejected";
  filePath?: undefined;
  approvedAt?: undefined;
  rejectedAt?: number;
};

export type ContinuityItem = ContinuityBaseRecord & {
  reviewState: "approved";
  filePath?: string;
  approvedAt: number;
  rejectedAt?: undefined;
};

export type ContinuityCandidate = ContinuityPending | ContinuityRejected;

export type ContinuityRecord = ContinuityPending | ContinuityRejected | ContinuityItem;

export type ContinuityStoreFile = {
  version: 2;
  records: ContinuityRecord[];
};

export type ContinuityCaptureConfig = {
  mainDirect?: ContinuityCaptureMode;
  pairedDirect?: ContinuityCaptureMode;
  group?: ContinuityCaptureMode;
  channel?: ContinuityCaptureMode;
  minConfidence?: number;
};

export type ContinuityReviewConfig = {
  autoApproveMain?: boolean;
  requireSource?: boolean;
};

export type ContinuityIdentityConfig = {
  mode?: ContinuityIdentityMode;
  defaultDirectSubjectId?: string;
  bindings?: Array<ContinuitySubjectBinding | undefined>;
};

export type ContinuityRecentConfig = {
  enabled?: boolean;
  maxExcerpts?: number;
  maxChars?: number;
  ttlHours?: number;
};

export type ContinuityRecallConfig = {
  maxItems?: number;
  includeOpenLoops?: boolean;
  scope?: SessionSendPolicyConfig;
};

export type ContinuityPluginConfig = {
  capture?: ContinuityCaptureConfig;
  review?: ContinuityReviewConfig;
  identity?: ContinuityIdentityConfig;
  recent?: ContinuityRecentConfig;
  recall?: ContinuityRecallConfig;
};

export type ResolvedContinuityIdentityConfig = {
  mode: ContinuityIdentityMode;
  defaultDirectSubjectId: string;
  bindings: ResolvedContinuitySubjectBinding[];
};

export type ResolvedContinuityRecentConfig = {
  enabled: boolean;
  maxExcerpts: number;
  maxChars: number;
  ttlHours: number;
};

export type ResolvedContinuityConfig = {
  capture: {
    mainDirect: ContinuityCaptureMode;
    pairedDirect: ContinuityCaptureMode;
    group: ContinuityCaptureMode;
    channel: ContinuityCaptureMode;
    minConfidence: number;
  };
  review: {
    autoApproveMain: boolean;
    requireSource: boolean;
  };
  identity: ResolvedContinuityIdentityConfig;
  recent: ResolvedContinuityRecentConfig;
  recall: {
    maxItems: number;
    includeOpenLoops: boolean;
    scope: SessionSendPolicyConfig;
  };
};

export type ContinuityListFilters = {
  state?: ContinuityReviewState | "all";
  kind?: ContinuityKind | "all";
  sourceClass?: ContinuitySourceClass | "all";
  scopeKind?: ContinuityScopeKind | "all";
  subjectId?: string;
  limit?: number;
};

export type ContinuityStatus = {
  enabled: boolean;
  slotSelected: boolean;
  counts: Record<ContinuityReviewState, number>;
  capture: ResolvedContinuityConfig["capture"];
  review: ResolvedContinuityConfig["review"];
  identity: ResolvedContinuityIdentityConfig;
  recent: ResolvedContinuityRecentConfig;
  recall: {
    maxItems: number;
    includeOpenLoops: boolean;
  };
  subjectCount: number;
  recentSubjectCount: number;
  legacyUnscopedDirectCount: number;
};

export type ContinuityPatchAction = "approve" | "reject" | "remove";

export type ContinuityPatchResult = {
  ok: boolean;
  record?: ContinuityRecord;
  removedId?: string;
};

export type ContinuityExplainResult = {
  record: ContinuityRecord;
  markdownPath?: string;
};

export type ContinuitySubjectSummary = {
  subjectId: string;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  recentCount: number;
  lastSeenAt?: number;
  sessionKeys: string[];
};

export type ContinuityCaptureInput = {
  sessionKey?: string;
  sessionId: string;
  messages: ContinuityAgentMessage[];
  participants?: string[];
};

export type ContinuityExtractionMatch = {
  kind: ContinuityKind;
  text: string;
  confidence: number;
  role: "user" | "assistant";
};

export type ContinuityRecentEntry = {
  id: string;
  scopeId: string;
  subjectId: string;
  role: "user" | "assistant";
  text: string;
  sessionKey: string;
  sessionId: string;
  participants?: string[];  // NEW: agents who were in this conversation
  createdAt: number;
};

export type ContinuityRecentStoreFile = {
  version: 1;
  entries: ContinuityRecentEntry[];
};
