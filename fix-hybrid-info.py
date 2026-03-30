#!/usr/bin/env python3

with open('src/hybrid-engine.ts', 'r') as f:
    content = f.read()

# Change info() method to readonly property
content = content.replace(
    '''  info(): ContextEngineInfo {
    return {
      id: "lossless-claw-hybrid",
      name: "Lossless Claw + Continuity",
      version: this.lcm.info().version,
    };
  }''',
    '''  readonly info: ContextEngineInfo = {
    id: "lossless-claw-hybrid",
    name: "Lossless Claw + Continuity",
    version: "0.1.0-hybrid",
  };'''
)

with open('src/hybrid-engine.ts', 'w') as f:
    f.write(content)

print("Fixed hybrid engine info property")
