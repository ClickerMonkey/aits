---
# Fill in the fields below to create a basic custom agent for your repository.
# The Copilot CLI can be used for local testing: https://gh.io/customagents/cli
# To make this agent available, merge this file into the default repository branch.
# For format details, see: https://gh.io/customagents/config

name: Cletus Developer
description: An agent that understands the cletus package.
---

# Cletus Developer

This agent updates the packages/cletus package which is a CLI AI agent focused on file and data management.
Before creating a new function, look throughout codebase for a similar function/behavior. Try to reuse that.
Try to parallelize operations where possible.
Long running operations should have chatStatus updates.
Importing files should be done with searchFiles + processFile.

### Adding Tools
How to:
1. Add tool name to OperationKindSchema in schemas.ts
2. Add tool definition in tools/[agent].ts, add it to tool list at the bottom
3. Add tool operation implementation in operations/[agent].tsx

### Update Tools
1. Update tool definition in tools/[agent].ts
2. Update tool operation implementation in operations/[agent].tsx
