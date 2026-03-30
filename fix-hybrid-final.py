#!/usr/bin/env python3

with open('src/hybrid-engine.ts', 'r') as f:
    content = f.read()

# Fix the property initialization order issue
# Move the method bindings inside the constructor
content = content.replace(
    '''  // Forward optional lifecycle methods from LCM
  prepareSubagentSpawn = this.lcm.prepareSubagentSpawn?.bind(this.lcm);
  releaseSubagentGrant = this.lcm.releaseSubagentGrant?.bind(this.lcm);
}''',
    '''  // Optional lifecycle methods are forwarded from LCM when they exist
  prepareSubagentSpawn?: typeof this.lcm.prepareSubagentSpawn;
}''')

# Add initialization of prepareSubagentSpawn in constructor
content = content.replace(
    '''    this.continuity = new ContinuityContextEngine({
      service: continuityService,
      logger,
    });
  }''',
    '''    this.continuity = new ContinuityContextEngine({
      service: continuityService,
      logger,
    });
    
    // Bind optional lifecycle methods from LCM
    this.prepareSubagentSpawn = this.lcm.prepareSubagentSpawn?.bind(this.lcm);
  }''')

# Fix sessionKey issue - remove it from continuity ingest call
content = content.replace(
    '''        const result = await this.continuity.ingest({
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          message,
          isHeartbeat: params.isHeartbeat,
        });''',
    '''        const result = await this.continuity.ingest({
          sessionId: params.sessionId,
          message,
          isHeartbeat: params.isHeartbeat,
        });''')

with open('src/hybrid-engine.ts', 'w') as f:
    f.write(content)

print("Fixed hybrid engine")
