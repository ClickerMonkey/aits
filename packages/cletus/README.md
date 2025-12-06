# @aeye/cletus

> **Interactive CLI demo showcasing @aeye capabilities - an AI-powered assistant with file management, data operations, and autonomous task execution.**

Cletus is a terminal-based AI assistant built with the @aeye library that demonstrates the power of multi-provider AI integration, tool calling, and context management. It features a beautiful TUI (Terminal User Interface) powered by React/Ink and provides specialized AI agents for different domains like file operations, data management, image generation, and web searching.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)

## Installation

### Global Installation

```bash
npm install -g @aeye/cletus
```

### From Source

```bash
# Clone the repository
git clone https://github.com/ClickerMonkey/aeye.git
cd aeye/packages/cletus

# Install dependencies
npm install

# Build and link
npm run build
npm link

# Run
cletus
```

## Features

### Adaptive Tooling

Cletus uses an intelligent tool selection system that automatically picks the most relevant tools based on your conversation context. Instead of having access to all 50+ tools at once (which can overwhelm the AI), Cletus:

1. **Analyzes your recent messages** - Uses embeddings to understand what you're asking about
2. **Selects relevant tools** - Picks the top 15-20 most semantically similar tools for the task
3. **Adapts over time** - As your conversation evolves, the available tools adjust automatically

You can also manually switch between specialized **toolsets** to focus on specific domains:

- **planner** - Task management and todo operations
- **librarian** - Knowledge base and semantic search
- **clerk** - File system operations and shell commands
- **secretary** - User memories and assistant management
- **architect** - Custom data type definitions and schema management
- **artist** - Image generation, editing, and analysis
- **internet** - Web search and API operations
- **dba** - Data record management and querying

Use the `retool` tool to switch between adaptive mode and specific toolsets

### Examples

Here are some examples of what you can do with Cletus:

**File Operations:**
- "Search for all TypeScript files in the src directory"
- "Read package.json and tell me what dependencies are outdated"
- "Create a new file called README.md with a project description"
- "Find all files containing the word 'TODO' and summarize them"

**Data Management:**
- "Create a 'Recipe' type with fields for ingredients, instructions, and cooking time"
- "Add a new recipe for chocolate chip cookies"
- "Find all recipes that contain chocolate"

**Task Planning:**
- "Add a todo to implement user authentication"
- "Show me all my pending todos"
- "Mark the first todo as done"

**Image Operations:**
- "Generate an image of a sunset over mountains"
- "Find all images I've generated that contain trees"
- "Analyze this screenshot and describe what you see"

**Web Research:**
- "Search the web for the latest TypeScript features"
- "Get the content from https://example.com and summarize it"

**Knowledge Base:**
- "Remember that I prefer tabs over spaces"
- "Index all files in my project for semantic search"
- "Search my knowledge base for information about authentication"

**Shell Commands:**
- "Run npm test and show me the results"
- "Execute git status and tell me what files have changed"

### 🎨 Interactive Terminal UI

- Beautiful React/Ink-based interface
- Chat history management
- Real-time streaming responses
- Markdown rendering
- Operation approval/rejection system
- Settings configuration wizard
- Automatic light/dark mode theme detection for optimal color visibility

### 💾 Persistent Storage

- Chat history with metadata
- User preferences and memories
- Custom data types and records
- Knowledge base with vector embeddings
- Multi-provider API configurations

### ⚡ Advanced Capabilities

- **Autonomous Mode** - AI can execute multiple operations without asking for approval
- **Custom Assistants** - Create persona-based assistants with unique prompts (Gollum, Sherlock Holmes, etc.)
- **Type System** - Define custom data structures with fields and validation
- **Knowledge Base** - Semantic search over user memories, files, and data records
- **File Intelligence** - Summarize, index, and search files (PDF, Word, Excel, images, etc.)
- **Image Operations** - Generate, edit, analyze, and find images
- **Web Integration** - Search the web, scrape pages, make API calls

## Quick Start

### First Launch

When you run `cletus` for the first time, an interactive setup wizard will guide you through:

1. **User Information** - Your name and pronouns
2. **Provider Setup** - Configure AI providers (OpenAI, OpenRouter, Replicate, AWS Bedrock)
3. **API Keys** - Enter your API keys or credentials for each provider

The configuration is saved to `~/.cletus/config.json` and can be modified later through the settings menu.

### Basic Usage

```bash
# Start Cletus
cletus

# The main menu provides options to:
# - Start a new chat
# - Continue existing chats
# - Configure settings
# - Exit
```

### Command Line Arguments

- `--profile=NAME` or `--profile NAME` - Use a specific configuration profile

### Creating a Chat

1. Select "New Chat" from the main menu
2. Optionally choose an assistant persona (or use default)
3. Optionally provide a custom system prompt
4. Start chatting!

## Tools

Cletus provides 50+ tools organized into specialized toolsets. Here's what each toolset offers:

### 🗂️ Planner (`planner`)
Task management and todo operations:
- `todosList` - View all todos
- `todosAdd` - Add a new todo
- `todosDone` - Mark a todo as complete
- `todosGet` - Get a specific todo by ID
- `todosRemove` - Remove a todo
- `todosReplace` - Replace/update a todo
- `todosClear` - Clear all todos

### 📚 Librarian (`librarian`)
Knowledge base with semantic search:
- `knowledgeSearch` - Search knowledge base semantically
- `knowledgeSources` - List all knowledge sources
- `knowledgeAdd` - Add user memories to knowledge base
- `knowledgeDelete` - Delete knowledge source

### 📁 Clerk (`clerk`)
File system operations and shell commands:
- `fileSearch` - Search files by glob pattern
- `fileSummary` - Get AI summary of file content
- `fileIndex` - Index files into knowledge base
- `fileRead` - Read file contents
- `fileEdit` - Edit file with find/replace
- `fileCreate` - Create new file
- `fileCopy` - Copy file
- `fileMove` - Move/rename file
- `fileDelete` - Delete file
- `fileStats` - Get file metadata
- `fileAttach` - Attach file to message
- `textSearch` - Search file contents with regex
- `dirCreate` - Create directory
- `dirSummary` - Summarize directory contents
- `shell` - Execute shell commands

### 👤 Secretary (`secretary`)
User preferences and assistant management:
- `assistantSwitch` - Switch to different assistant
- `assistantUpdate` - Update assistant prompt
- `assistantAdd` - Create new assistant
- `memoryList` - List user memories
- `memoryUpdate` - Update user memories

### 🏗️ Architect (`architect`)
Custom data type system:
- `typeList` - List all custom types
- `typeInfo` - Get type definition
- `typeCreate` - Define new data type
- `typeUpdate` - Update type definition
- `typeDelete` - Delete type
- `typeImport` - Import type from JSON schema

### 🎨 Artist (`artist`)
Image generation and analysis:
- `imageGenerate` - Generate images from text
- `imageEdit` - Edit existing images
- `imageAnalyze` - Analyze image with vision AI
- `imageDescribe` - Get detailed image description
- `imageFind` - Search generated images
- `imageAttach` - Attach image to message

### 🌐 Internet (`internet`)
Web operations:
- `webSearch` - Search the web (via Tavily)
- `webGetPage` - Fetch and extract page content
- `webApiCall` - Make HTTP API requests

### 💾 DBA (`dba`)
Data record management:
- `dataIndex` - Index data records into knowledge base
- `dataImport` - Import data from files
- `dataSearch` - Semantic search over data records
- `dataGet` - Get specific data record
- `dbaQuery` - Query data with filters and sorting

### 🔧 Utility (always available)
Core system tools:
- `getOperationOutput` - Retrieve truncated operation output
- `about` - Information about Cletus
- `retool` - Switch toolsets or enable adaptive mode
- `hypothetical` - Switch to restrictive mode for exploration
- `ask` - Ask user multiple-choice questions with special UI

## Configuration

Cletus stores its data in `~/.cletus/`:

```
~/.cletus/
├── config.json          # User settings, API keys, assistants
├── knowledge.json       # Vector embeddings for semantic search
├── chats/              # Chat history
│   ├── {chat-id}.json
│   └── ...
├── data/               # Custom data records
│   ├── {type-name}.json
│   └── ...
└── images/            # Generated and edited images
```

### Provider Configuration

Cletus supports multiple AI providers:
- OpenAI (For all model types)
- OpenRouter (For chat models)
- Replicate (For image generation & editing primarily)
- AWS (For chat models)
- Tavily (For web search)

Common environment variables & AWS profiles are auto-detected

### Model Selection

In the settings you can configure what models you want to use for each behavior.

### Autonomous Mode

You choose how autonomous Cletus is - either automatically performing certain operations or asking for approval.

## Custom Assistants

Cletus comes with built-in assistant personas:

- **Gollum** - Speaks like Gollum from LOTR (helpful but tricksy)
- **Harry Potter** - Adds magical spell casting to responses
- **Sherlock Holmes** - Analytical and deductive reasoning style
- **Comic** - Makes jokes while helping

Create your own:

```
You: Create an assistant named "Poet" that responds in verse

Cletus: I'll create that assistant...
[Uses assistant_add tool]
```

Switch assistants mid-chat:

```
You: Switch to Sherlock Holmes

Cletus: Switching assistant...
[Uses assistant_switch tool]
```

## Advanced Features

### Custom Data Types

Define structured data with validation:

### Semantic Search

Files, data records, and user memories are automatically embedded and searchable:

- Full-text semantic search across all knowledge
- Source filtering (user memories, specific files, data types)
- Relevant context retrieval for AI responses

### File Intelligence

Supported file types:

- **Documents**: PDF, DOCX, XLSX, TXT, MD, JSON, CSV
- **Images**: PNG, JPG, GIF, BMP, WEBP
- **Archives**: ZIP (auto-extraction and indexing)
- **Code**: Any text-based code files

Operations:

- AI-generated summaries
- Semantic indexing and search
- Content extraction (text, images, tables)
- OCR for images in documents
- Image description and analysis

### "No provider configured"

Add at least one provider in settings or edit `~/.cletus/config.json` to include API keys.

### "Tavily API key required"

Web search requires a Tavily API key. Get one at [tavily.com](https://tavily.com) and add it in settings.

### "Model not found"

Check that your configured models are available for your provider. See provider documentation for available models.

### Chat history missing

Chat files are stored in `~/.cletus/chats/`. If they're deleted, history is lost. Consider backing up this directory.

### Large knowledge base

The knowledge base (`~/.cletus/knowledge.json`) grows as you index files and data. You can delete specific sources using the `knowledge_delete` tool.

## Development

### Project Structure

```
packages/cletus/
├── src/
│   ├── agents/           # AI agent definitions
│   ├── components/       # React/Ink UI components
│   ├── helpers/          # Utility functions
│   ├── operations/       # Tool operation implementations
│   ├── tools/            # Tool definitions
│   ├── ai.ts            # AI setup and configuration
│   ├── chat.ts          # Chat management
│   ├── config.ts        # Configuration handling
│   ├── data.ts          # Data storage
│   ├── knowledge.ts     # Knowledge base
│   ├── schemas.ts       # Zod schemas
│   └── index.tsx        # Entry point
├── docs/                # Additional documentation
├── dist/                # Built files
├── package.json
├── tsconfig.json
└── README.md
```

### Adding a New Tool

1. **Add to schemas** - Update `OperationKindSchema` in `schemas.ts`
2. **Define tool** - Add tool definition in `tools/{agent}.ts`
3. **Implement operation** - Add implementation in `operations/{agent}.tsx`

Example:

```typescript
// 1. schemas.ts
export const OperationKindSchema = z.enum([
  // ...
  'my_new_tool',
]);

// 2. tools/clerk.ts
const myNewTool = ai.tool({
  name: 'my_new_tool',
  description: 'Does something useful',
  instructions: `Use this to...`,
  schema: z.object({
    input: z.string().describe('The input'),
  }),
  call: async (input, _, ctx) => 
    ctx.ops.handle({ type: 'my_new_tool', input }, ctx),
});

// 3. operations/clerk.tsx
export const myNewTool = operationOf<
  { input: string },
  { result: string }
>({
  mode: 'read',
  signature: 'my_new_tool(input: string)',
  status: (input) => `Processing: ${input.input}`,
  analyze: async ({ input }, { cwd }) => ({
    analysis: `This will process: ${input.input}`,
    doable: true,
  }),
  do: async ({ input }, ctx) => {
    const result = await doSomething(input.input);
    return { result };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `MyNewTool("${op.input.input}")`,
    (op) => op.output ? `Result: ${op.output.result}` : null,
    showInput, showOutput
  ),
});
```

### Building

```bash
# Clean build
npm run clean
npm run build

# Type checking
npm run typecheck
```

## Contributing

Contributions are welcome! Please see the main [@aeye repository](https://github.com/ClickerMonkey/aeye) for contribution guidelines.

## License

GPL-3.0 © ClickerMonkey

## Related Packages

- [@aeye/ai](../ai) - Core AI library
- [@aeye/core](../core) - Shared utilities and types
- [@aeye/models](../models) - Model registry and definitions
- [@aeye/openai](../openai) - OpenAI provider
- [@aeye/openrouter](../openrouter) - OpenRouter provider
- [@aeye/replicate](../replicate) - Replicate provider
- [@aeye/aws](../aws) - AWS Bedrock provider

## Support

- [GitHub Issues](https://github.com/ClickerMonkey/aeye/issues)
- [Discussions](https://github.com/ClickerMonkey/aeye/discussions)
- [Documentation](https://github.com/ClickerMonkey/aeye#readme)
