# Prompt File Incorporation

## Overview

Cletus can automatically incorporate custom prompt files from your current working directory into every chat session. This allows you to provide project-specific or personal instructions that will be included in the context for the AI.

## Supported Files

By default, Cletus searches for the following files in your current working directory (case-insensitive):

1. `cletus.md` - Primary instructions for Cletus
2. `agents.md` - Instructions for sub-agents
3. `claude.md` - Claude-specific instructions (for compatibility)

**Note:** The file search is case-insensitive, so variations like `CLETUS.MD`, `Cletus.md`, or `cletus.MD` will all be found.

## How It Works

1. When starting a chat, Cletus searches for the configured prompt files in the current working directory
2. Files are checked in the order specified in settings
3. **The first file found is used** - subsequent files are ignored
4. The file's content is wrapped in a `<prompt-file>` tag with the file name
5. The content is included in the system prompt sent to the AI

**Example:** If you configure `['cletus.md', 'agents.md', 'claude.md']` and only `agents.md` exists in your directory, that file will be loaded. If both `cletus.md` and `agents.md` exist, only `cletus.md` will be used.

## Usage

### Creating Prompt Files

Simply create markdown files in your project directory:

```bash
# Example cletus.md
echo "# Project Guidelines
- Use TypeScript for all code
- Follow ESLint rules
- Write tests for new features" > cletus.md
```

### Setting a Global Prompt

You can also set a global prompt that applies to all chat sessions:

1. Run Cletus
2. Select "Settings" from the main menu
3. Choose "Change global prompt"
4. Enter your prompt text
5. Press Enter to save

### Managing Prompt Files

To manage which files are searched and their priority order:

1. Run Cletus
2. Select "Settings" from the main menu
3. Choose "Manage prompt files"
4. You can:
   - **Add a file**: Add new filenames to the search list
   - **Reorder files**: Change priority (first file found wins)
   - **Remove a file**: Remove filenames from the search list

## Example Prompt File

```markdown
# Development Guidelines

## Code Style
- Use functional components in React
- Prefer const over let
- Always add JSDoc comments for functions

## Project Context
This is a monorepo for AI tools. Each package should be independent.

## Preferences
- Provide concise, technical responses
- Include code examples when helpful
- Suggest best practices proactively
```

## Prompt Priority

The order in which prompts are included in the context (highest to lowest priority):
1. Chat-specific prompt (if set for the chat)
2. Assistant persona (if selected)
3. **First prompt file found** (only one file is loaded)
4. Global prompt (from settings)
5. Base system prompt

**Important:** Only the first file found from your configured list is loaded. For example, if you configure `['custom.md', 'cletus.md', 'agents.md']` and both `custom.md` and `cletus.md` exist, only `custom.md` will be used.

## Security

- Files are only loaded from the current working directory
- No path traversal or directory navigation is allowed
- Files are read-only; Cletus never modifies prompt files
- Content is properly sanitized before being sent to the AI

## Tips

- Keep prompt files concise and focused
- Use markdown formatting for better readability
- Update prompt files as your project evolves
- Use global prompt for personal preferences
- Use per-project files for project-specific guidelines
- Different projects can have different prompt files

## Configuration

The prompt file configuration is stored in `~/.cletus/config.json`:

```json
{
  "user": {
    "globalPrompt": "Your global prompt here",
    "promptFiles": ["cletus.md", "agents.md", "claude.md"]
  }
}
```

You can manually edit this file to change the file order or add custom file names.
