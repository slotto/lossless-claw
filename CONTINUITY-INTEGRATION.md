# Continuity Integration Plan

## Status: In Progress

This document tracks the integration of continuity (cross-channel identity & recent history) into lossless-claw.

## What's Been Done

### ✅ Step 1: Source Files Added
- [x] Copied all continuity source files to `src/continuity/`
- [x] Committed: `feat: add continuity cross-channel support (step 1: source files)`

### ✅ Step 2: Hybrid Engine Created
- [x] Created `src/hybrid-engine.ts` combining both engines
- [x] Committed: `feat: create hybrid context engine combining LCM + continuity`

## What's Next

### Step 3: Plugin Registration
Update `src/plugin/index.ts` to:
1. Initialize `ContinuityService` with proper config
2. Instantiate `HybridContextEngine` instead of `LcmContextEngine`
3. Register the hybrid engine as the default context engine

### Step 4: Config Schema
Update `openclaw.plugin.json` to include continuity config fields:
- `continuity.identity` (subject bindings)
- `continuity.recent` (cross-channel history settings)
- `continuity.capture` (when to capture messages)

### Step 5: Dependencies
Check `package.json` for any missing dependencies that continuity needs.

### Step 6: Testing
1. Build the plugin
2. Test with a simple cross-channel scenario
3. Verify both LCM compaction and continuity injection work together

## Architecture

```
┌─────────────────────────────────────────┐
│      HybridContextEngine               │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │     LCM      │  │   Continuity    │ │
│  │              │  │                 │ │
│  │ • DAG storage│  │ • Identity      │ │
│  │ • Compaction │  │ • Recent history│ │
│  │ • Summaries  │  │ • Cross-channel │ │
│  └──────────────┘  └─────────────────┘ │
│                                         │
│  Both share the same message stream    │
│  LCM handles long-term, continuity     │
│  handles cross-channel recent context  │
└─────────────────────────────────────────┘
```

## Integration Points

### `ingest()`
- Both engines ingest the same message
- LCM stores in SQLite DAG
- Continuity stores in recent.json for cross-channel injection

### `assemble()`
- LCM provides compacted message history (DAG summaries + recent messages)
- Continuity provides cross-channel recent history via `systemPromptAddition`
- Hybrid merges both:
  - Messages: from LCM (DAG-based)
  - System prompt: Continuity recent history + LCM summaries

### `compact()`
- Only LCM handles compaction (continuity doesn't compact)

### `afterTurn()`
- Both engines do post-turn cleanup
- Continuity updates recent.json
- LCM triggers auto-compaction if needed

## Config Example

```json
{
  "plugins": {
    "slots": {
      "contextEngine": "lossless-claw-hybrid"
    },
    "entries": {
      "lossless-claw": {
        "enabled": true,
        "config": {
          "freshTailCount": 32,
          "contextThreshold": 0.75,
          "incrementalMaxDepth": -1,
          "summaryModel": "anthropic/claude-haiku-4-5",
          "continuity": {
            "identity": {
              "mode": "explicit",
              "bindings": [
                {
                  "subjectId": "julian",
                  "matches": [
                    { "channel": "slack", "keyPrefix": "slack:channel:" }
                  ]
                }
              ]
            },
            "recent": {
              "enabled": true,
              "maxExcerpts": 6,
              "maxChars": 1200,
              "ttlHours": 24
            },
            "capture": {
              "channel": "auto"
            }
          }
        }
      }
    }
  }
}
```

## Testing Checklist

- [ ] Build succeeds (`npm run build` or `pnpm build`)
- [ ] Plugin registers correctly
- [ ] LCM compaction still works
- [ ] Continuity captures cross-channel messages
- [ ] Cross-channel injection appears in system prompt
- [ ] Both storage systems (SQLite + JSON) work together
- [ ] No conflicts or race conditions

## Notes

- Continuity storage path: `~/.openclaw/agents/<agent>/continuity/recent.json`
- LCM storage path: `~/.openclaw/lcm.db` (SQLite)
- Both are independent and complementary
- Continuity doesn't replace LCM's compaction — it adds cross-channel awareness

## Questions/Decisions

1. **Should continuity use LCM's SQLite for storage instead of JSON files?**
   - Pro: Single storage backend, easier queries
   - Con: More complex integration, changes continuity's architecture
   - **Decision:** Keep separate for now (JSON + SQLite), merge later if needed

2. **Should cross-channel history go before or after LCM summaries in system prompt?**
   - **Decision:** Continuity first (more recent/specific), then LCM summaries (broader context)

3. **How to handle session patterns (ignore/stateless)?**
   - **Decision:** Both engines respect the same session patterns from LCM config
