#!/usr/bin/env python3
import re

files_to_fix = [
    'src/continuity/engine.ts',
    'src/continuity/route.ts', 
    'src/continuity/service.ts'
]

for filepath in files_to_fix:
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        # Fix the import line - split PluginLogger from other imports
        content = re.sub(
            r'import type \{ ([^}]*?)PluginLogger([^}]*?) \} from "\./sdk-compat\.js";',
            lambda m: f'import type {{ PluginLogger }} from "./sdk-compat.js";\nimport type {{{m.group(1).rstrip(", ")}{m.group(2).lstrip(", ")}}} from "openclaw/plugin-sdk";' if (m.group(1).strip().rstrip(',') or m.group(2).strip().lstrip(',')) else 'import type { PluginLogger } from "./sdk-compat.js";',
            content
        )
        
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")
    except Exception as e:
        print(f"Error fixing {filepath}: {e}")
