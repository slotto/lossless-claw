const RELEVANT_MEMORIES_BLOCK_RE =
  /<\s*relevant[-_]memories\b[^>]*>[\s\S]*?<\s*\/\s*relevant[-_]memories\s*>/gi;
const RELEVANT_MEMORIES_TAG_RE = /<\s*\/?\s*relevant[-_]memories\b[^>]*>/gi;
const THINK_BLOCK_RE = /<\s*think\b[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi;
const REASONING_BLOCK_RE = /<\s*reasoning\b[^>]*>[\s\S]*?<\s*\/\s*reasoning\s*>/gi;

export function stripAssistantInternalScaffolding(text: string): string {
  if (!text) {
    return "";
  }
  return text
    .replace(RELEVANT_MEMORIES_BLOCK_RE, "")
    .replace(RELEVANT_MEMORIES_TAG_RE, "")
    .replace(THINK_BLOCK_RE, "")
    .replace(REASONING_BLOCK_RE, "")
    .trimStart();
}
