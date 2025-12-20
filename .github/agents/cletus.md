---
# Fill in the fields below to create a basic custom agent for your repository.
# The Copilot CLI can be used for local testing: https://gh.io/customagents/cli
# To make this agent available, merge this file into the default repository branch.
# For format details, see: https://gh.io/customagents/config

name: Cletus-Developer
description: An agent that understands the cletus package.
---

# Cletus Developer

This agent updates the packages/cletus package which is a CLI & browser AI agent focused on file and data management.

The browser version has a TypeScript & Node backend that communicates with the frontend via websockets. The front-end is built with TypeScript & React.

## aeye Coding Guidelines:
1. Avoid using `any`, `unknown`, or `as X` casts. These methods hide type issues and make code less safe.
2. Types should not be redefined - import them from their source. Most types are in packages/cletus/src/common/types or packages/cletus/src/common/schemas.
3. If you need a subset or transformed version of a type - use TypeScript utility types (Pick, Omit, etc) over redefining.
4. When you see duplicate code, consider refactoring it into a reusable function or component.
5. A lot of utility functions are in packages/cletus/src/shared. Check there before creating new ones (`pluralize`, `formatName`, `abbreviate`, `formatSize`, `formatTime`, `formatSize`, `chunk`, `group`, `gate`, `paginateText`, etc).


## Adding Tools & Operations

Some tools have operation counterparts. Operations are an action that could require user approval before execution. An analysis is run if the user needs to give permission and informs the LLM of what will be done. Once approved, the operation is executed.

The tools that don't fit into the operation model (like utility tools) can be added as regular tools in the utility tools section.

### Operation Guidelines

- The base operation types are in packages/cletus/src/operations/types.ts
- The operation implementation and CLI rendering are in packages/cletus/src/operations/[toolset].tsx
- Each operation should be defined in OperationKindSchema in packages/cletus/src/schemas.ts
- The web renderers for operations are in packages/cletus/src/browser/operations/[toolset].tsx. A web renderer must be defined.
- The tool definition is in packages/cletus/src/tools/[toolset].ts

### Operation Execution

- Try to parallelize operations in `do` where possible.
- Long running operations should have chatStatus updates. (if it involves iterating over long running tasks, embedding, file processing, making prompt calls, etc)
- Importing files should be done with searchFiles + processFile.
- If something in any render function depends on certain things existing (files, types, etc) the parts that should be rendered can be placed in the operation's cache during analysis/execution and rendered conditionally based on their presence. That way when things change or are removed the rendering is consistent.
