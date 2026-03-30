#!/usr/bin/env python3

# Fix route.ts
with open('src/continuity/route.ts', 'r') as f:
    content = f.read()

content = content.replace(
    'import type {OpenClawConfigPluginRuntime} from "openclaw/plugin-sdk";',
    'import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";'
)

with open('src/continuity/route.ts', 'w') as f:
    f.write(content)

# Fix service.ts  
with open('src/continuity/service.ts', 'r') as f:
    content = f.read()

content = content.replace(
    'import type {OpenClawConfigPluginRuntime} from "openclaw/plugin-sdk";',
    'import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";'
)

with open('src/continuity/service.ts', 'w') as f:
    f.write(content)

print("Fixed imports")
