# @aits/cletus

> **Interactive CLI demo showcasing AITS capabilities - an AI-powered assistant with file management, data operations, and autonomous task execution.**

Cletus is a terminal-based AI assistant built with the @aits library that demonstrates the power of multi-provider AI integration, tool calling, and context management. It features a beautiful TUI (Terminal User Interface) powered by React/Ink and provides specialized AI agents for different domains like file operations, data management, image generation, and web searching.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)

## Features

### 🤖 Specialized AI Agents

Cletus organizes its capabilities into specialized agents, each with domain-specific tools:

- **Architect** - Type definition management for custom data structures
- **Artist** - Image generation, editing, analysis, and semantic search
- **Clerk** - File operations, searching, indexing, and summarization
- **DBA** - Database-like operations on typed data with CRUD capabilities
- **Internet** - Web search, page scraping, and REST API calls
- **Librarian** - Knowledge base management with semantic search
- **Planner** - Todo list management and task tracking
- **Secretary** - Assistant persona management and user memory

### 🎨 Interactive Terminal UI

- Beautiful React/Ink-based interface
- Chat history management
- Real-time streaming responses
- Syntax-highlighted code blocks
- Operation approval/rejection system
- Settings configuration wizard

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

## Installation

### Global Installation

```bash
npm install -g @aits/cletus
```

### From Source

```bash
# Clone the repository
git clone https://github.com/ClickerMonkey/aits.git
cd aits/packages/cletus

# Install dependencies
npm install

# Build and link
npm run build
npm link

# Run
cletus
```

### Development Mode

```bash
# Watch mode with hot reload
npm run dev

# Or run directly with tsx
npm start
```

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

### Creating a Chat

1. Select "New Chat" from the main menu
2. Optionally choose an assistant persona (or use default)
3. Optionally provide a custom system prompt
4. Start chatting!

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

#### OpenAI

```json
{
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "organization": "org-...",  // Optional
      "project": "proj_...",      // Optional
      "defaultModels": {
        "chat": "gpt-4o",
        "imageGenerate": "dall-e-3",
        "transcription": "whisper-1",
        "embedding": "text-embedding-3-large"
      }
    }
  }
}
```

#### OpenRouter

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-...",
      "defaultParams": {
        "siteUrl": "https://yoursite.com",
        "appName": "Cletus",
        "providers": {
          "order": ["openai", "anthropic"],
          "allowFallbacks": true
        }
      }
    }
  }
}
```

#### Replicate

```json
{
  "providers": {
    "replicate": {
      "apiKey": "r8_..."
    }
  }
}
```

#### AWS Bedrock

Access to Claude, Llama, Mistral, and other models via AWS Bedrock. Supports credential auto-discovery from environment variables or IAM roles.

```json
{
  "providers": {
    "aws": {
      "region": "us-east-1",
      "credentials": {
        "accessKeyId": "AKIA...",
        "secretAccessKey": "..."
      }
    }
  }
}
```

Alternatively, set environment variables (recommended):
```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
```

#### Tavily (Web Search)

```json
{
  "tavily": {
    "apiKey": "tvly-..."
  }
}
```

### Model Selection

Override default models in the user configuration:

```json
{
  "user": {
    "models": {
      "chat": "gpt-4o-mini",
      "imageGenerate": "dall-e-3",
      "imageAnalyze": "gpt-4o",
      "embedding": "text-embedding-3-small",
      "summary": "gpt-4o-mini"
    }
  }
}
```

### Autonomous Mode

Configure how the AI handles operations:

```json
{
  "user": {
    "autonomous": {
      "maxIterations": 10,  // Max tool calls without approval
      "timeout": 300000     // 5 minutes in milliseconds
    }
  }
}
```

## Tool Categories

### Architect Tools

Manage custom data type definitions:

- `type_info` - View type schema and fields
- `type_create` - Create new type definitions
- `type_update` - Update types (backwards compatible)

### Artist Tools

Image operations:

- `image_generate` - Generate images from prompts
- `image_edit` - Edit existing images
- `image_analyze` - Ask questions about images
- `image_describe` - Get detailed image descriptions
- `image_find` - Semantic search over images

### Clerk Tools

File management:

- `file_search` - Find files with glob patterns
- `file_summary` - AI-generated file summaries
- `file_index` - Index files for semantic search
- `file_create` - Create new files
- `file_read` - Read file contents
- `file_edit` - Edit file contents
- `file_copy` - Copy files
- `file_move` - Move/rename files
- `file_delete` - Delete files
- `file_stats` - Get file metadata
- `text_search` - Search text content with regex
- `dir_create` - Create directories

### DBA Tools

Data operations (dynamically generated for each custom type):

- `data_create` - Create new records
- `data_update` - Update records by ID
- `data_delete` - Delete records by ID
- `data_select` - Query records with filters
- `data_update_many` - Bulk update operations
- `data_delete_many` - Bulk delete operations
- `data_aggregate` - Count and aggregate data
- `data_index` - Reindex knowledge base
- `data_import` - Import from files (CSV, JSON, etc.)
- `data_search` - Semantic search over records

### Internet Tools

Web operations:

- `web_search` - Search the web (via Tavily)
- `web_get_page` - Scrape web pages
- `web_api_call` - Make REST API requests

### Librarian Tools

Knowledge base management:

- `knowledge_search` - Semantic search
- `knowledge_sources` - List knowledge sources
- `knowledge_add` - Add user memories
- `knowledge_delete` - Remove knowledge entries

### Planner Tools

Task management:

- `todos_list` - List all todos
- `todos_add` - Add new todo
- `todos_done` - Mark todo complete
- `todos_get` - Get todo details
- `todos_remove` - Delete todo
- `todos_clear` - Clear all todos
- `todos_replace` - Replace entire todo list

### Secretary Tools

Assistant and memory management:

- `assistant_switch` - Change assistant persona
- `assistant_update` - Modify assistant prompt
- `assistant_add` - Create new assistant
- `memory_list` - View user memories
- `memory_update` - Add/update memories

## Examples

### File Operations

```
You: Summarize all TypeScript files in the src directory

Cletus: I'll search for TypeScript files and summarize them...
[Uses file_search and file_summary tools]
```

### Data Management

```
You: Create a new type for tracking books with title, author, and year

Cletus: I'll create a book type definition...
[Uses type_create tool]

You: Add "1984" by George Orwell published in 1949

Cletus: I'll create a new book record...
[Uses data_create tool with the book type]
```

### Image Generation

```
You: Generate an image of a sunset over mountains

Cletus: I'll generate that image for you...
[Uses image_generate tool, saves to .cletus/images/]
[Generated image: sunset_mountains_abc123.png](~/.cletus/images/sunset_mountains_abc123.png)
```

### Web Research

```
You: Search for recent TypeScript 5.0 features and summarize them

Cletus: Let me search for that information...
[Uses web_search tool]
[Summarizes findings from multiple sources]
```

### Knowledge Base

```
You: Remember that I prefer using async/await over promises

Cletus: I'll add that to your memories...
[Uses knowledge_add tool]

You: What are my coding preferences?

Cletus: Let me search your memories...
[Uses knowledge_search tool]
You prefer using async/await over promises...
```

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

```typescript
// Example type definition
{
  name: "project",
  friendlyName: "Project",
  description: "Software project tracking",
  knowledgeTemplate: "Project: {{name}}\nStatus: {{status}}\n{{#if description}}Description: {{description}}{{/if}}",
  fields: [
    {
      name: "name",
      friendlyName: "Name",
      type: "string",
      required: true
    },
    {
      name: "status",
      friendlyName: "Status",
      type: "enum",
      enumOptions: ["planning", "active", "completed"],
      required: true,
      default: "planning"
    },
    {
      name: "description",
      friendlyName: "Description",
      type: "string",
      required: false
    }
  ]
}
```

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

## Keyboard Shortcuts

- **Ctrl+C** - Exit current view (returns to main menu)
- **Arrow Keys** - Navigate menus
- **Enter** - Select menu item
- **Type** - In chat view, type messages

## Troubleshooting

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
case 'my_new_tool': {
  const result = await doSomething(operation.input);
  return { output: result };
}
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

Contributions are welcome! Please see the main [AITS repository](https://github.com/ClickerMonkey/aits) for contribution guidelines.

## License

MIT © ClickerMonkey

## Related Packages

- [@aits/ai](../ai) - Core AI library
- [@aits/core](../core) - Shared utilities and types
- [@aits/models](../models) - Model registry and definitions
- [@aits/openai](../openai) - OpenAI provider
- [@aits/openrouter](../openrouter) - OpenRouter provider
- [@aits/replicate](../replicate) - Replicate provider
- [@aits/aws](../aws) - AWS Bedrock provider

## Support

- [GitHub Issues](https://github.com/ClickerMonkey/aits/issues)
- [Discussions](https://github.com/ClickerMonkey/aits/discussions)
- [Documentation](https://github.com/ClickerMonkey/aits#readme)
