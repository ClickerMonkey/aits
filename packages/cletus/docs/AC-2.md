# Cletus Chat

Cletus chat is a highly dynamic CLI chat interface that implements the high-level features described in AC-1.md

This file outlines all prompts, tools, and agents that need to be defined.
It defines the chat mode and operations - and how everything should behave.

**Operations** are something that tools can produce that can be executed by the user or automatically depending on the mode. It has a summary, a payload that an operation handler can execute, and its type which is 'read', 'create', 'update', or 'delete'. Once an operation is executed we record run-time (start & stop), the results which can be fed into the context, and the error details if one occurred. Operations can be interrupted by the user.

Chat mode is one of a few values - and it speaks to what operation type is done automatically:
- `none` all operations must be user approved
- `read` all read operations are automatic, all others require user approval
- `create` all read & create operations are automatic, all others require user approval
- `update` all read, create, and update operations are automatic, delete requires user approval
- `delete` all operations are automatic

The user can stop an operation with ESC and stops the agent process.

The chat can have it's assistant changed, it's prompt changed, its mode changed, its todos modified, etc.

Chat uses todos when a request is very complex and could take multiple steps. The todos are always in context so we don't forget the overall goal of a long request. Tools can see todos, clear them, replace them, mark one as complete, etc.

Operations can be linked to todos. The agent can get operations/messages/results linked to a todo.

**TODO...**