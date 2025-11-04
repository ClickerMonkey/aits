# Cletus Chat

Cletus chat is a highly dynamic CLI chat interface that implements the high-level features described in AC-1.md

This file outlines all prompts, tools, and agents that need to be defined.
It defines the chat mode and operations - and how everything should behave.

**Operations** are something that tools can produce that can be executed by the user or automatically depending on the mode. It has a summary, a payload that an operation handler can execute, and its type which is 'read', 'create', 'update', or 'delete'. Once an operation is executed we record run-time (start & stop), the results which can be fed into the context, and the error details if one occurred. Operations can be interrupted by the user.

Chat mode is one of a few values - and it speaks to what operation type is done automatically:
- `none` all AI operations must be user approved
- `read` all read operations are automatic, all others require user approval
- `create` all read & create operations are automatic, all others require user approval
- `update` all read, create, and update operations are automatic, delete requires user approval
- `delete` all operations are automatic

The user can stop an operation with ESC and stops the agent process.

The chat can have it's assistant changed, it's prompt changed, its mode changed, its todos modified, etc.

Chat uses todos when a request is very complex and could take multiple steps. The todos are always in context so we don't forget the overall goal of a long request. Tools can see todos, clear them, replace them, mark one as complete, etc.

Operations can be linked to todos. The agent can get operations/messages/results linked to a todo.

## Flow

> Chat Agent -> Sub Agent -> Tools

### Sub Agents
- `planner` - manages todos
- `librarian` - manages knowledge
- `clerk` - manages operations
- `secretary` - manages memory & assistants
- `architect` - manages types
- `dba` - manages data
- `artist` - image generation, editing, and analysis

The Chat Agent & Sub Agents are fed a system prompt with this information:
- User name, pronouns, & memories
- Available data types and their field names
- Available assistants
- Sub agents see the current todo that's being worked on if any

#### planner
Tools:
- `todos_clear()` - clears all todos
- `todos_list()` - shows all todos
- `todos_add(name: string)` - adds one by name, undone
- `todos_done(id: string)` - marks one done
- `todos_get(id: string)` - gets a todos details
- `todos_remove(id: string)` - removes one by id
- `todos_replace(todos[])` - replaces all todos with a new set

#### librarian
Prompt:
- Includes explanation that knowledge sources can be in `{dataType}:{id}`, `fileSummary:{path}`, `fileChunk:{path}[{index}]`, and `user`.
Tools:
- `knowledge_search(query: string, limit: number=10, sourcePrefix?: string)` returns limit knowledges that are most similary to query where source starts with sourcePrefix
- `knowledge_sources()` returns all the source prefixes that are useful (dataType:, fileSummary:path, fileChunk:path, user) based on what's in the knowledge base.
- `knowledge_add(text: string)` adds user memory
- `knowledge_delete(sourcePrefix: string)` deletes all knowledge that starts with the prefix

#### clerk
All file operations and names are relative to the CWD - Cletus does not have access outside of that.
The clerk only operates with text based files.
Prompt:
Tools:
- `file_search(glob: string, limit: number=40)` 
- `file_summary(path: string)` take a file's first 64,000 characters and have AI generated a summary, display it to the user and ask if knowledge about it should be stored
- `file_index(path: string)` take a text file and break it up into sections and generate knowledge for each section. If the current mode is not create it just reports how many knowledge entries would be created. When given permission or creation is automatic is when embeddings are calculated
- `file_create(path: string, content: string)`
- `file_copy(path: string, target: string)`
- `file_move(glob: string, target: string)` moves one or more files to a file or dir
- `file_stats(path: string)`
- `file_delete(path: string)`
- `file_read(path: string)` pull in first 64,000 characters into context
- `text_search(glob: string, regex: string, surrounding: number)` does a regex text search through one or more files and reports the files and then the lines and X surrounding lines.
- `dir_create(path: string)`

#### secretary
Tools:
- `assistant_switch(name: string)` sets the chat assistant to the chosen
- `assistant_update(name: string, prompt: string)` updates assistant prompt
- `assistant_add(name: string, prompt: string)` creates an assistant, AI generates prompt if user doesn't supply enough info
- `memory_list()` lists user memory
- `memory_update(content: string)` given the memories and this info integrate in an appopriate memory or add a new one

#### architect
Tools:
- `type_info(name: string)` all type info
- `type_update(name: string, update: {friendlyName?, description?, fields?:{fieldToDelete:null, newFieldOrUpdate:{}}})` updates types in a backwards compatible way. Don't let type or field names to change. Once a field is created don't let the type change unless it's to a more flexible type (string). Don't let it go from optional to required if there's data without a value. Always make sure any data changes are backwards compatible with the data that exists.
- `type_create(definition)`

#### dba
All tools that create/update/delete handles the knowledge management of that data.
The below lists out data operations with `name: string` of the data type. The DBA should actually
determine which data type and then do data operations where the schemas line up perfectly which what actually can be done for all the parameters based on the current data type.
Tools:
- `data_create(name: string, fields: {})`
- `data_update(name: string, id: string, fields: {})`
- `data_delete(name: string, id: string)`
- `data_select(name: string, where: {and:[], field: 3, etc}, offset: number=0, limit: number=10, orderBy: {}[])`
- `data_update_many(name: string, set: {}, where: {})`
- `data_delete_many(name: string, where: {})`
- `data_aggregate(name: string, where: {}, having: {}, groupBy: [], orderBy: [], select: [])`

#### artist
Tools:
- `image_generate(prompt: string, n: number)` - places generated images in .cletus/images/ and adds link via file:// syntax in chat messages. chat messages convert image file:// to appropriate file object
- `image_edit(prompt: string, imagePath: string)` - imagePath points to cletus image or relative image file
- `image_analyze(prompt: string, imagePaths: string[], maxCharacters: number=2084)` - maxCharacters/4=maxTokens
- `image_describe(imagePath: string)` - describes what's in the image
- `image_find(prompt: string, glob: string, maxImages: number, n: number)` - finds n scored images in the given path where each image is summarized by AI and the summary is embedded and compared to the embedding of the prompt in order to score it. 

### Operations
So a reminder. All tool calls add an operation message to the chat - and then the chat updates based on the mode and decides to prompt the user for permission or the actions available OR does the operation and then re-starts the whole process now that the operation results are in the context. The operation & todo ID in the message are added to the context message content.

Operation type:
```ts
interface Operation {
    type: string; // a handler to execute it
    input: object; // the input to pass to the handler to execute.
    kind: 'read' | 'create' | 'update' | 'delete';
    start?: number;
    end?: number;   
    error?: string;
    results?: any;
}
```

The token events are obsorbed from the prompt and the token provided if any - minus all other messages in the context is the messages token count. As content is streaming in we do fake counting if content, tool names, arguments, etc - where you divide the characters by 4 and thats ~tokens.

Any other questions let me know!