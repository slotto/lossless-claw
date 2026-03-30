# Lossless Claw + Continuity Integration Report

**Date:** March 30, 2026  
**Status:** ⚠️ **Partially Complete - TypeScript Errors Need Resolution**

## Summary

Successfully merged the continuity plugin's cross-channel identity and recent-history features into lossless-claw. The hybrid engine architecture is in place, but TypeScript compilation errors remain due to SDK version incompatibilities.

## What Was Accomplished

### ✅ Phase 1: Source Integration (Complete)
- [x] All continuity source files added to `src/continuity/` (30 files, ~7,800 lines)
- [x] Hybrid engine created (`src/hybrid-engine.ts`)
- [x] Plugin registration modified to detect continuity config
- [x] Auto-fallback to standard LCM if continuity init fails

**Commits:**
1. `feat: add continuity cross-channel support (step 1: source files)` - 2f39d28
2. `feat: create hybrid context engine combining LCM + continuity` - d50cc94  
3. `docs: add continuity integration plan and architecture` - dc261e1
4. `feat: add hybrid engine support with continuity detection` - f0b2b80

### ✅ Phase 2: Architecture Design (Complete)

**Hybrid Engine Pattern:**
```
┌─────────────────────────────────────────┐
│      HybridContextEngine               │
├─────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────┐ │
│  │     LCM      │  │   Continuity    │ │
│  │ • DAG        │  │ • Identity      │ │
│  │ • Compaction │  │ • Recent history│ │
│  │ • SQLite     │  │ • JSON store    │ │
│  └──────────────┘  └─────────────────┘ │
│  Both share message stream             │
│  LCM: long-term, Continuity: recent    │
└─────────────────────────────────────────┘
```

**Key Integration Points:**
- `ingest()`: Both engines receive the same messages
- `assemble()`: LCM provides DAG context, continuity adds cross-channel recent history
- `compact()`: Only LCM compacts (continuity doesn't)
- `afterTurn()`: Both cleanup, continuity updates recent.json

### ⚠️ Phase 3: TypeScript Compilation (Blocked)

**Status:** 33 TypeScript errors preventing build

**Root Cause:** SDK version mismatch between:
- **lossless-claw**: Uses current OpenClaw plugin SDK
- **continuity**: Written for an older/different OpenClaw version

**Error Categories:**

1. **Missing SDK exports** (5 errors)
   - `ContextEngine` not exported from `openclaw/plugin-sdk`
   - `PluginLogger` not exported
   
2. **Type mismatches** (18 errors)
   - `ContinuityRecord` missing `scopeKind` and `scopeId` fields
   - Test mocks incomplete for `PluginRuntime`

3. **ES2023 features** (4 errors)
   - `.toSorted()` method not available (needs `lib: ["es2023"]` in tsconfig)

4. **Plugin config structure** (6 errors)
   - `contextEngine` slot not recognized in current SDK

## Current State

### Files Modified/Added

```
src/
├── continuity/              (NEW - 30 files)
│   ├── engine.ts
│   ├── service.ts
│   ├── identity.ts
│   ├── scope.ts
│   └── ...
├── hybrid-engine.ts         (NEW)
├── plugin/
│   └── index.ts             (MODIFIED - hybrid detection)
CONTINUITY-INTEGRATION.md    (NEW - architecture docs)
INTEGRATION-REPORT.md        (NEW - this file)
```

### Plugin Behavior (If TypeScript Fixed)

**Without continuity config:**
```json
{
  "plugins": {
    "entries": {
      "lossless-claw": {
        "enabled": true,
        "config": {
          "freshTailCount": 32
        }
      }
    }
  }
}
```
→ Uses standard LCM engine

**With continuity config:**
```json
{
  "plugins": {
    "entries": {
      "lossless-claw": {
        "enabled": true,
        "config": {
          "freshTailCount": 32,
          "continuity": {
            "identity": {
              "mode": "explicit",
              "bindings": [...]
            },
            "recent": {
              "enabled": true,
              "maxExcerpts": 6
            }
          }
        }
      }
    }
  }
}
```
→ Automatically enables HybridContextEngine

## Issues & Blockers

### 🚫 Critical: TypeScript Compilation Errors

**Issue:** 33 errors prevent build  
**Impact:** Plugin cannot be tested or deployed  
**Root Cause:** SDK API differences between continuity and lossless-claw

**Required Fixes:**

1. **Update continuity imports:**
   - Replace `openclaw/plugin-sdk` imports with compatible types
   - May need to bridge old → new SDK interface

2. **Fix ContinuityRecord types:**
   - Add missing `scopeKind` and `scopeId` fields
   - Or make them optional in the type definitions

3. **Update tsconfig.json:**
   ```json
   {
     "compilerOptions": {
       "lib": ["es2023", "dom"]
     }
   }
   ```

4. **Fix plugin config types:**
   - Either update continuity's expectations
   - Or create adapter types

### ⚠️ Medium: Test Coverage

**Issue:** No integration tests for hybrid engine  
**Impact:** Cannot verify cross-channel functionality works

**Needed Tests:**
- [ ] Hybrid engine initializes correctly
- [ ] LCM compaction still works
- [ ] Continuity captures cross-channel messages
- [ ] Recent history injection appears in system prompt
- [ ] Fallback to LCM works when continuity fails

### ℹ️ Low: Documentation

**Issue:** Config schema needs update  
**Impact:** Users won't know how to configure continuity

**Needed:**
- [ ] Update `openclaw.plugin.json` with continuity schema
- [ ] Add config examples to README
- [ ] Document hybrid vs standard modes

## Next Steps

### Option A: Fix TypeScript Errors (Recommended)

**Estimated effort:** 2-4 hours

1. Create SDK compatibility layer:
   ```typescript
   // src/continuity/sdk-compat.ts
   import type { PluginRuntime } from "openclaw/plugin-sdk";
   export type PluginLogger = PluginRuntime["logger"];
   // ... map other types
   ```

2. Update continuity imports to use compat layer

3. Fix type definitions:
   - Make `scopeKind`/`scopeId` optional
   - Or populate them with defaults during creation

4. Update tsconfig lib setting

5. Run tests: `npm test`

6. Verify build: `npx tsc --noEmit`

### Option B: Simplify Integration

**Estimated effort:** 4-6 hours

Instead of full continuity plugin:
1. Extract only the cross-channel recent-history logic
2. Simplify to just identity matching + JSON storage
3. Skip the full context engine, just add system prompt injection
4. Less powerful but easier to integrate

### Option C: Keep Separate (Not Recommended)

Run lossless-claw and continuity as separate plugins. Won't get the benefit of combining them.

## Testing Plan (After TypeScript Fixed)

### Unit Tests

```bash
cd /tmp/lossless-claw
npm test
```

**Expected coverage:**
- [ ] Hybrid engine ingest/assemble
- [ ] Continuity service initialization
- [ ] Cross-channel identity resolution
- [ ] Recent history capture/injection

### Integration Test Scenario

**Setup:**
1. Configure hybrid engine with continuity
2. Create test sessions on different channels (e.g., slack:channel:A, slack:channel:B)
3. Bind both to same subject ID

**Test Flow:**
1. Send message in channel A
2. Verify LCM stores in SQLite
3. Verify continuity stores in recent.json
4. Send message in channel B
5. Check assembled context includes recent history from channel A
6. Verify cross-channel injection in system prompt

### Manual Test

```bash
# 1. Install plugin
openclaw plugins install --link /path/to/lossless-claw

# 2. Configure
# Edit ~/.openclaw/openclaw.json to add continuity config

# 3. Restart gateway
openclaw gateway restart

# 4. Check logs
tail -f /tmp/openclaw/openclaw-*.log | grep -E '\[lcm\]|continuity'

# 5. Send test messages
# Use OpenClaw on multiple channels

# 6. Verify storage
ls -la ~/.openclaw/lcm.db  # LCM storage
ls -la ~/.openclaw/agents/main/continuity/  # Continuity storage
```

## Recommendations

### Short Term (Next 2-4 hours)

1. **Fix TypeScript errors** (Option A above)
2. **Run existing tests** to ensure LCM still works
3. **Add basic hybrid engine test**
4. **Update README** with hybrid mode docs

### Medium Term (Next week)

1. **Add continuity config schema** to `openclaw.plugin.json`
2. **Write integration tests** for cross-channel scenarios
3. **Performance testing** (hybrid vs standard LCM)
4. **Document migration** (upgrading from pure LCM)

### Long Term

1. **Merge storage backends** (SQLite for both instead of JSON + SQLite)
2. **Advanced features:**
   - Cross-platform continuity (not just cross-channel)
   - Subject-scoped compaction
   - Shared context between agents
3. **Upstream contribution** back to lossless-claw and continuity projects

## Conclusion

The integration is **architecturally sound** but **blocked on TypeScript compatibility**. Once the type errors are resolved (2-4 hours of work), the hybrid engine should function correctly, combining lossless-claw's powerful DAG compaction with continuity's cross-channel awareness.

**Current state:** Code merged, architecture documented, but not buildable/testable.

**Immediate action needed:** Fix TypeScript errors using Option A (SDK compatibility layer).

**Pull Request:** https://github.com/slotto/lossless-claw/pull/1

---

**Generated:** March 30, 2026, 10:00 CET  
**By:** Nexus (nexusaurus)
