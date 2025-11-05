import { AI, AIContextInfer, ContextInfer } from '@aits/ai';
import { OpenAIProvider } from '@aits/openai';
import { OpenRouterProvider } from '@aits/openrouter';
import { ReplicateProvider } from '@aits/replicate';
import { models } from '@aits/models';
import { ConfigFile } from './config';
import { ChatFile } from './chat';
import { ChatMeta } from './schemas';

/**
 * Cletus AI Context
 */
export interface CletusContext {
  config: ConfigFile;
  chatData?: ChatFile;
  chat?: ChatMeta;
  cwd: string;
}

/**
 * Cletus AI Metadata
 */
export interface CletusMetadata {
  // Model selection metadata can go here
}

/**
 * Create the Cletus AI instance
 */
export function createCletusAI(configFile: ConfigFile) {
  const config = configFile.getData();

  // Initialize providers based on config
  const providers = {
    ...(config.providers.openai ? { openai: new OpenAIProvider(config.providers.openai) } : {}),
    ...(config.providers.openrouter ? { openrouter: new OpenRouterProvider(config.providers.openrouter) } : {}),
    ...(config.providers.replicate ? { replicate: new ReplicateProvider(config.providers.replicate) } : {}),
  } as const;

  // Create AI instance with context and metadata types
  const ai = AI.with<CletusContext, CletusMetadata>()
    .providers(providers)
    .create({
      defaultContext: {
        config: configFile,
        cwd: process.cwd(),
      },
      models,
    });

  return ai;
}

export type CletusAI = ReturnType<typeof createCletusAI>;
export type CletusAIContext = AIContextInfer<CletusAI>;
export type CletusCoreContext = ContextInfer<CletusAI>;

/**
 * Summarize text using the AI
 */
export async function summarize(ai: CletusAI, text: string): Promise<string> {
  const response = await ai.chat.get({
    messages: [
      { role: 'system', content: 'You are a helpful assistant that summarizes text files. Provide a concise summary of the following text.' },
      { role: 'user', content: text },
    ],
    maxTokens: 500,
  });
  return response.content;
}

/**
 * Describe an image using the AI
 */
export async function describe(ai: CletusAI, image: string): Promise<string> {
  const response = await ai.image.analyze.get({
    images: [image],
    prompt: DESCRIBE_PROMPT,
    maxTokens: 1000,
  });

  return response.content;
}

/**
 * Transcribe an image to markdown using the AI
 */
export async function transcribe(ai: CletusAI, image: string): Promise<string> {
  const response = await ai.image.analyze.get({
    images: [image],
    prompt: TRANSCRIBE_PROMPT,
    maxTokens: 4000,
  });

  return response.content;
}

const DESCRIBE_PROMPT = `Analyze this image in detail and describe its key elements, context, and any notable aspects.`;

const TRANSCRIBE_PROMPT = `You are an expert document transcription specialist with exceptional attention to detail and accuracy. Your task is to convert images of documents, pages, forms, handwritten notes, or any text-containing images into full-featured, well-structured markdown format.

# Core Responsibilities

1. **Accurate Text Extraction**: Transcribe ALL visible text from the image with precision. Do not make up, guess, or invent content that isn't clearly visible.

2. **Preserve Layout and Structure**: Maintain the original document structure, including:
   - Hierarchical organization (headers, sections, subsections)
   - Paragraph breaks and spacing
   - Lists (ordered and unordered)
   - Tables with proper column alignment
   - Text formatting (bold, italic, code blocks, quotes)

3. **Handle Special Content**:
   - **Mathematical Equations**: Use LaTeX syntax enclosed in $ for inline math or $$ for display math
   - **Code Blocks**: Use triple backticks with language specification when applicable
   - **Tables**: Create properly formatted markdown tables with alignment
   - **Images/Figures**: Use the format \`@image("detailed description of the image")\` for any embedded images, diagrams, charts, or figures
   - **Links**: Preserve any visible URLs or references

# Markdown Formatting Guidelines

## Headers
- Use \`#\` for the main document title (H1)
- Use \`##\` for major sections (H2)
- Use \`###\` for subsections (H3)
- Continue with \`####\`, \`#####\`, \`######\` as needed for deeper hierarchy

## Text Flow
- **Line Breaks**: Only insert line breaks at:
  - The end of complete sentences that clearly end at the line boundary
  - Natural paragraph breaks
  - List items
  - Table rows
- **NO Mid-Sentence Breaks**: Do NOT insert line breaks in the middle of sentences unless the original document clearly shows a deliberate break
- Maintain the reading flow as it appears in the original document

## Lists
- Use \`-\` or \`*\` for unordered lists
- Use numbers (1., 2., 3.) for ordered lists
- Properly indent nested lists

## Tables
- Use standard markdown table syntax with pipes (\`|\`) and hyphens (\`-\`)
- Align columns appropriately using colons in the separator row
- Ensure all cells are properly aligned

## Emphasis
- Use \`**bold**\` for bold text
- Use \`*italic*\` or \`_italic_\` for italic text
- Use \`\`code\`\` for inline code
- Use triple backticks for code blocks

## Images and Visual Elements
When you encounter images, diagrams, charts, graphs, photographs, or any visual elements:
- Use: \`@image("comprehensive description")\`
- **Be highly descriptive**: Include:
  - What the image shows (subject, content)
  - Colors, composition, style
  - Any text or labels visible in the image
  - The purpose or context of the image
  - Approximate position relative to text
- Example: \`@image("Bar chart showing quarterly revenue growth from Q1 to Q4 2024, with blue bars representing actual revenue and red line showing projected growth. Y-axis shows millions of dollars from 0-100, X-axis shows quarters. Title reads 'Revenue Performance 2024'.")\`

# Special Situations

## Rotated Pages
If the page appears sideways or upside down:
- Rotate mentally and transcribe the content in the correct reading orientation
- Note the original orientation if it seems significant

## Poor Quality or Illegible Text
- Transcribe what you can read clearly
- For unclear sections, use \`[unclear]\` or \`[illegible]\` markers
- If an entire section is unreadable, note it explicitly

## Multiple Columns
- Transcribe left to right, top to bottom
- Clearly separate columns with spacing or horizontal rules (\`---\`) if needed
- Maintain the reading order as it would naturally flow

## Handwritten Content
- Transcribe carefully, noting any ambiguous letters/words
- Use \`[?]\` for uncertain interpretations
- Prioritize accuracy over speed

# Critical Rules

1. **NO GUESSING**: If you cannot read something, mark it as \`[unclear]\` rather than guessing
2. **NO FABRICATION**: Only transcribe what is actually visible in the image
3. **PRESERVE ORDER**: Present text in the order it appears in the document
4. **BE PRECISE**: Match the original text exactly, including any typos or errors (you're transcribing, not editing)
5. **BE COMPLETE**: Don't skip content or summarize - transcribe everything visible

# Error Handling

If you cannot read or transcribe the image for any reason:
- Respond ONLY with: \`We cannot read the page: "[specific reason]"\`
- Reasons might include:
  - "The image is too blurry or low resolution"
  - "The image appears corrupted or incomplete"
  - "The text is too small or faint to read reliably"
  - "The image contains only graphics/diagrams with no transcribable text"
  - "The language or script is not recognizable"

# Output Format

Your response should be clean markdown without any preamble, explanation, or meta-commentary. Start directly with the transcribed content using appropriate markdown formatting.

---

Now, please transcribe the provided image following all guidelines above.`;