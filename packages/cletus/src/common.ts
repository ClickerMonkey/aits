import fs from "fs";
import path from "path";
import { CONSTS } from "./constants";
import { Message, MessageContent } from "./schemas";
import { Message as AIMessage, MessageContent as AIMessageContent, Reasoning, ToolCall } from "@aeye/core";
import { detectMimeType } from "./helpers/files";

// Re-export browser-safe functions from shared.ts
export {
  formatTime,
  formatSize,
  formatName,
  abbreviate,
  deleteUndefined,
  pluralize,
  cosineSimilarity,
  chunkArray,
  chunk,
  groupMap,
  group,
  gate,
  detectNewlineType,
  normalizeNewlines,
  convertNewlines,
  paginateText,
  deepMerge,
  isObject,
  type NewlineType,
} from './shared';

/**
 * Returns the appropriate label for the Alt/Option key based on the platform.
 *
 * @returns "Opt" on macOS, "Alt" on other platforms
 */
export function getAltKeyLabel(): string {
  return process.platform === 'darwin' ? 'Opt' : 'Alt';
}

/**
 * Format a value for text display (high-level representation without JSON escaping)
 * - Arrays: items on separate lines with hyphens
 * - Non-objects (primitives): String(x)
 * - Objects: bullet list with hyphens, property values without JSON escaping
 * 
 * @param value - value to format
 * @param alreadyIndented - whether content should be indented/hyphenated
 * @returns formatted string
 */
export function formatValue(value: any, alreadyIndented: boolean = false): string {
  // Handle null/undefined
  if (value === null) {
    return `null`;
  }
  if (value === undefined) {
    return `undefined`;
  }

  const hyphenPrefix = alreadyIndented ? '' : '- ';
  
  // Arrays: list items with hyphens
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `[]`;
    }
    return value.map((item, i) => `${hyphenPrefix}${formatValue(item, true).split('\n').join('\n  ')}`).join('\n');
  }
  
  // Non-objects (primitives): use String(x)
  if (typeof value !== 'object') {
    const x = String(value);
    return !alreadyIndented && x.includes('\n') ? `\n  ${x.split('\n').join('\n  ')}` : x;
  }
  
  // Objects: bullet list with hyphens
  const entries = Object.entries(value).filter(([_, val]) => val !== undefined);
  if (entries.length === 0) {
    return '{}';
  }
  
  return entries.map(([key, val]) => {
    const prefix = `${hyphenPrefix}${key}:`;
    if (typeof val === 'object' && val !== null) {
      return `${prefix}\n  ${formatValue(val).split('\n').join('\n  ')}`;
    } else {
      return `${prefix} ${formatValue(val).split('\n').join('\n  ')}`;
    }
  }).join('\n');
}

/**
 * Format a value for display based on format type.
 *
 * @param value - value to format
 * @param format - format type ('json' or 'yaml', defaults to 'yaml')
 * @param alreadyIndented - whether content should be indented/hyphenated (only for yaml)
 * @returns formatted string
 */
export function formatValueWithFormat(value: any, format: 'json' | 'yaml' = 'yaml', alreadyIndented: boolean = false): string {
  if (format === 'json') {
    return JSON.stringify(value, null, 2);
  }
  return formatValue(value, alreadyIndented);
}

/**
 * Converts a Message to a ChatMessage.
 * 
 * @param msg 
 * @returns 
 */
export async function convertMessage(msg: Message): Promise<AIMessage[]> {
  /**
   * Example flows from a single assistant message:
   *
   * messageContent = { text, reasoning, op1-auto, op2-approved, op3-rejected, op4-pending, reasoning, text }
   *
   * Assistant: text
   * Assistant: toolCalls (ops input), reasoning
   * Tool: op1 output & instructions
   * Assistant: "Approve tools"
   * User: "Approves op2, Rejects op3"
   * Tool: op2 output & instructions
   * Tool: op3 analysis & rejected message
   * Tool: op4 analysis & pending approval message
   * Assistant: text, reasoning
   *
   * Rules:
   * - Assistant follows tools
   * - User follows assistant - approvals and rejections reference tool call Ids
   *
   * Non-assistant messages are simple - just convert content items directly like commented out below.
   */

  // For non-assistant messages, convert content directly
  if (msg.role !== 'assistant') {
    const content = await Promise.all(
      msg.content.map(mc => convertMessageContent(mc, msg.created))
    );
    return [{
      role: msg.role,
      name: msg.name,
      tokens: msg.tokens,
      content,
    }];
  }

  // For assistant messages, reconstruct the conversation flow
  const messages: AIMessage[] = [];
  let currentContent: AIMessageContent[] = [];
  let currentReasoning: Reasoning | undefined = undefined;
  let toolCallsCreated = false;

  for (const content of msg.content) {
    // Collect reasoning
    if (content.reasoning) {
      currentReasoning = content.reasoning;
    }

    // Handle operations
    if (content.operationIndex !== undefined) {
      const operation = msg.operations?.[content.operationIndex];
      if (!operation) continue;

      // If this is the first operation, create messages for content before operations and tool calls
      if (!toolCallsCreated) {
        // Output any text/reasoning before the tool calls
        if (currentContent.length > 0) {
          messages.push({
            role: 'assistant',
            name: msg.name,
            content: currentContent,
            reasoning: currentReasoning,
          });
          currentContent = [];
          currentReasoning = undefined;
        }

        // Create assistant message with all tool calls
        const toolCalls: ToolCall[] = [];
        for (let i = 0; i < (msg.operations?.length || 0); i++) {
          const op = msg.operations![i];
          toolCalls.push({
            id: `${msg.created}-${i}`,
            name: op.type,
            arguments: JSON.stringify(op.input),
          });
        }

        messages.push({
          role: 'assistant',
          name: msg.name,
          content: '',
          toolCalls,
          reasoning: currentReasoning,
        });
        currentReasoning = undefined;
        toolCallsCreated = true;
      }

      // Create tool result message for this operation
      const toolCallId = `${msg.created}-${content.operationIndex}`;
      const toolContent = await convertMessageContent(content, msg.created);

      messages.push({
        role: 'tool',
        toolCallId,
        content: typeof toolContent.content === 'string'
          ? toolContent.content
          : JSON.stringify(toolContent.content),
      });
    } else {
      // Regular text/image/file/audio content
      const converted = await convertMessageContent(content, msg.created);
      currentContent.push(converted);
    }
  }

  // Output any remaining text content after operations
  if (currentContent.length > 0 || currentReasoning) {
    messages.push({
      role: 'assistant',
      name: msg.name,
      content: currentContent,
      reasoning: currentReasoning,
    });
  }

  // If no messages were created (e.g., empty content), return a single empty assistant message
  if (messages.length === 0) {
    messages.push({
      role: 'assistant',
      name: msg.name,
      content: '',
    });
  }

  return messages;
}

export const INPUT_START = '\n\n<input>\n';
export const INPUT_END = '\n</input>';
export const ANALYSIS_START = '\n\n<analysis>\n';
export const ANALYSIS_END = '\n</analysis>';
export const OUTPUT_START = '\n\n<output>\n';
export const OUTPUT_END = '\n</output>';
export const INSTRUCTIONS_START = '\n\n<instructions>\n';
export const INSTRUCTIONS_END = '\n</instructions>';

/**
 * 
 * @param messageContent - The message content to convert
 * @param messageTimestamp - The timestamp of the message (for operation output storage)
 * @returns 
 */
async function convertMessageContent(messageContent: MessageContent, messageTimestamp: number): Promise<AIMessageContent> {
  const { type, content, operationIndex } = messageContent;
  
  // Handle text content
  if (type === 'text') {
    // Check if this is an operation message that needs truncation
    if (operationIndex !== undefined && content.length > CONSTS.OPERATION_MESSAGE_TRUNCATE_LIMIT) {
      // Generate the truncation message
      const contentTruncated = content.slice(0, CONSTS.OPERATION_MESSAGE_TRUNCATE_LIMIT - CONSTS.OPERATION_MESSAGE_TRUNCATE_BUFFER);
      const truncatedAt = contentTruncated.indexOf(INPUT_START) >= 0 && contentTruncated.indexOf(INPUT_END) === -1
        ? 'input'
        : contentTruncated.indexOf(ANALYSIS_START) >= 0 && contentTruncated.indexOf(ANALYSIS_END) === -1
          ? 'analysis'
            : contentTruncated.indexOf(OUTPUT_START) >= 0 && contentTruncated.indexOf(OUTPUT_END) === -1
              ? 'output'
              : contentTruncated.indexOf(INSTRUCTIONS_START) >= 0 && contentTruncated.indexOf(INSTRUCTIONS_END) === -1
                ? 'instructions'
                : '';
      const sections = [
        ...(content.includes(INPUT_START) ? ['input'] : []),
        ...(content.includes(ANALYSIS_START) ? ['analysis'] : []),
        ...(content.includes(OUTPUT_START) ? ['output'] : []),
        ...(content.includes(INSTRUCTIONS_START) ? ['instructions'] : []),
      ];
      const truncatedSections = sections.slice(sections.indexOf(truncatedAt));

      const truncatedLength = content.length - contentTruncated.length;
      let truncatedContent = contentTruncated;
      if (truncatedAt) {
        truncatedContent += `...\n</${truncatedAt}>`;
      }
      truncatedContent += `\n\nThe operation summary has had <${truncatedSections.join('>, <')}> truncated for length (${truncatedLength} characters not shown). To get the full summary call 'getOperationOutput(${messageTimestamp}, ${operationIndex})'`;

      return { type, content: truncatedContent };
    }
    
    return { type, content };
  }

  // Handle reasoning
  if (type === 'reasoning') {
    return { 
      type: 'text', 
      content: `<reasoning-history>${content}</reasoning-history>`
    };
  }
  
  // Handle image content
  if (content.startsWith('http://') || content.startsWith('https://')) {
    return { type, content: new URL(content) };
  }

  // Handle file content
  const file = unlinkFile(content);
  if (file) {
    const fileBuffer = await fs.promises.readFile(file.filepath);
    const fileBase64 = fileBuffer.toString("base64");
    const fileMimeType = await detectMimeType(file.filepath, file.filename);

    return { type, content: `data:${fileMimeType};base64,${fileBase64}` };
  }

  return { type, content };
}

/**
 * Converts a file link into a file filepath & filename.
 * 
 * @param link 
 * @returns 
 */
export function unlinkFile(link: string): { filename: string; filepath: string} | null {
  const [_, filename, filepath] = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || [];
  return filename && filepath ? { filename, filepath } : null;
}

/**
 * Converts a filepath into a markdown-style file link.
 * 
 * @param filepath - The full path to the file.
 * @param filename - The name of the file to display (defaults to the base name of the filepath).
 * @returns 
 */
export function linkFile(filepath: string, filename: string = path.basename(filepath)): string {
  return `[${filename}](${fileProtocol(filepath)})`;
}

/**
 * Ensures a path is in file protocol format.
 * 
 * @param path 
 * @returns 
 */
export function fileProtocol(path: string): string {
  path = path.replace(/\\/g, '/');
  if (!path.startsWith('file:///')) {
    if (path.startsWith('/')) {
      path = `file://${path}`;
    } else {
      path = `file:///${path}`;
    }
  }
  return path;
}

