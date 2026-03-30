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
        
        # Replace PluginLogger import
        content = re.sub(
            r'import type \{ (.*?)PluginLogger(.*?) \} from "openclaw/plugin-sdk";',
            r'import type { \1PluginLogger\2 } from "./sdk-compat.js";',
            content
        )
        
        # If there are other imports from openclaw/plugin-sdk on the same line, split them
        content = re.sub(
            r'import type \{ ([^}]*?)PluginLogger, ([^}]*?) \} from "openclaw/plugin-sdk";',
            r'import type { \1PluginLogger } from "./sdk-compat.js";\nimport type { \2 } from "openclaw/plugin-sdk";',
            content
        )
        
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")
    except Exception as e:
        print(f"Error fixing {filepath}: {e}")
