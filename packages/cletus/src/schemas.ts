import { z } from 'zod';

// ============================================================================
// User Schema
// ============================================================================

export const UserMemorySchema = z.object({
  text: z.string(),
  created: z.number(),
});

export const UserSchema = z.object({
  name: z.string(),
  pronouns: z.string().optional(),
  memory: z.array(UserMemorySchema).default([]),
});

// ============================================================================
// Provider Schemas
// ============================================================================

export const OpenAIConfigSchema = z.object({
  apiKey: z.string(),
}).nullable();

export const OpenRouterConfigSchema = z.object({
  apiKey: z.string(),
}).nullable();

export const ReplicateConfigSchema = z.object({
  apiKey: z.string(),
}).nullable();

export const ProvidersSchema = z.object({
  openai: OpenAIConfigSchema,
  openrouter: OpenRouterConfigSchema,
  replicate: ReplicateConfigSchema,
});

// ============================================================================
// Assistant Schema
// ============================================================================

export const AssistantSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  created: z.number(),
});

// ============================================================================
// Chat Schema
// ============================================================================

export const TodoItemSchema = z.object({
  name: z.string(),
  done: z.boolean(),
  id: z.string(),
});

export const ChatMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  assistant: z.string().optional(),
  prompt: z.string().optional(),
  mode: z.enum(['read', 'write', 'code']).default('read'),
  created: z.number(),
  updated: z.number(),
  todos: z.array(TodoItemSchema).default([]),
});

// ============================================================================
// Type Definition Schema
// ============================================================================

export const TypeFieldSchema = z.object({
  name: z.string(),
  friendlyName: z.string(),
  type: z.string(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  required: z.boolean().optional(),
  enumOptions: z.array(z.string()).optional(),
});

export const TypeDefinitionSchema = z.object({
  name: z.string(),
  friendlyName: z.string(),
  description: z.string().optional(),
  fields: z.array(TypeFieldSchema),
});

// ============================================================================
// Config Schema
// ============================================================================

export const ConfigSchema = z.object({
  updated: z.number(),
  user: UserSchema,
  providers: ProvidersSchema,
  assistants: z.array(AssistantSchema),
  chats: z.array(ChatMetaSchema),
  types: z.array(TypeDefinitionSchema),
});

// ============================================================================
// Knowledge Schema
// ============================================================================

export const KnowledgeEntrySchema = z.object({
  source: z.string(),
  text: z.string(),
  vector: z.array(z.number()),
  created: z.number(),
  updated: z.number().optional(),
});

export const KnowledgeSchema = z.object({
  updated: z.number(),
  knowledge: z.record(z.string(), z.array(KnowledgeEntrySchema)),
});

// ============================================================================
// Message Content Schema
// ============================================================================

export const MessageContentSchema = z.object({
  type: z.enum(['text', 'image', 'file', 'audio']),
  content: z.string(),
});

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  name: z.string().optional(),
  content: z.array(MessageContentSchema),
  created: z.number(),
  tokens: z.number().optional(),
  todo: z.string().optional(),
  operation: z.record(z.string(), z.any()).optional(),
});

export const ChatMessagesSchema = z.object({
  updated: z.number(),
  messages: z.array(MessageSchema),
});

// ============================================================================
// Data Schema
// ============================================================================

export const DataRecordSchema = z.object({
  id: z.string(),
  created: z.number(),
  updated: z.number(),
  fields: z.record(z.string(), z.any()),
});

export const DataFileSchema = z.object({
  updated: z.number(),
  data: z.array(DataRecordSchema),
});

// ============================================================================
// Type Exports
// ============================================================================

export type UserMemory = z.infer<typeof UserMemorySchema>;
export type User = z.infer<typeof UserSchema>;
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type OpenRouterConfig = z.infer<typeof OpenRouterConfigSchema>;
export type ReplicateConfig = z.infer<typeof ReplicateConfigSchema>;
export type Providers = z.infer<typeof ProvidersSchema>;
export type Assistant = z.infer<typeof AssistantSchema>;
export type TodoItem = z.infer<typeof TodoItemSchema>;
export type ChatMeta = z.infer<typeof ChatMetaSchema>;
export type TypeField = z.infer<typeof TypeFieldSchema>;
export type TypeDefinition = z.infer<typeof TypeDefinitionSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;
export type Knowledge = z.infer<typeof KnowledgeSchema>;
export type MessageContent = z.infer<typeof MessageContentSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type ChatMessages = z.infer<typeof ChatMessagesSchema>;
export type DataRecord = z.infer<typeof DataRecordSchema>;
export type DataFile = z.infer<typeof DataFileSchema>;
