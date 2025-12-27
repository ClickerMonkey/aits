import OpenAI from "openai";


/**
* OpenRouter modalities
*/
export type OpenRouterModality = 'text->text' | 'text+image->text' | 'text+image->text+image';

/**
* OpenRouter input modalities
*/
export type OpenRouterInput = 'audio' | 'file' | 'image' | 'text';

/**
* OpenRouter output modalities
*/
export type OpenRouterOutput = 'image' | 'text';

/**
* OpenRouter tokenizer types
*/
export type OpenRouterTokenize = 'Other' | 'GPT' | 'Mistral' | 'Llama3' | 'Qwen3' | 'Qwen' | 'Gemini' | 'DeepSeek' | 'Claude' | 'Grok' | 'Llama4' | 'Llama2' | 'Cohere' | 'Nova' | 'Router';

/**
* OpenRouter supported parameters
*/
export type OpenRouterSupportedParameter =
  'max_tokens' |
  'temperature' |
  'top_p' |
  'stop' |
  'seed' |
  'presence_penalty' |
  'frequency_penalty' |
  'response_format' |
  'top_k' |
  'tools' |
  'structured_outputs' |
  'tool_choice' |
  'repetition_penalty' |
  'reasoning' |
  'include_reasoning' |
  'min_p' |
  'logit_bias' |
  'logprobs' |
  'top_a' |
  'top_logprobs' |
  'web_search_options';

/**
* OpenRouter model response from API
*/
export interface OpenRouterModel {
  id: string;
  canonical_slug: string;
  hugging_face_id: string;
  name: string;
  created: number;
  description?: string;
  context_length: number;
  architecture: {
    modality: string;
    input_modalities: OpenRouterInput[];
    output_modalities: OpenRouterOutput[];
    tokenizer: OpenRouterTokenize;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  supported_parameters: OpenRouterSupportedParameter[];
  default_parameters: {
    frequency_penalty: number;
    temperature: number;
    top_p: number;
  }
}

/**
* ZDR model info from OpenRouter ZDR endpoint
*/
export interface ZDRModel {
  name: string;
  model_name: string;
  context_length: number;
  pricing: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
  };
  provider_name: string;
  tag: string;
  quantization: string | null;
  max_completion_tokens: number | null;
  max_prompt_tokens: number | null;
  supported_parameters: OpenRouterSupportedParameter[];
  status: number;
  uptime_last_30m: number | null;
  supports_implicit_caching: boolean;
}

/**
* OpenRouter chat request with extensions
*/
export type OpenRouterChatRequest = OpenAI.Chat.ChatCompletionCreateParams & {
  // OpenRouter-specific extensions
  reasoning?: {
    enabled: boolean;
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
  };
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    data_collection?: 'deny' | 'allow';
    zdr?: boolean;
    only?: string[];
    ignore?: string[];
    quantizations?: ('int4' | 'int8' | 'fp4' | 'fp6' | 'fp8' | 'fp16' | 'bf16' | 'fp32' | 'unknown')[];
    sort?: 'price' | 'throughput' | 'latency';
    max_price?: {
      prompt?: number; // dollars per million tokens
      completion?: number; // dollars per million tokens
      image?: number; // dollars per image
    };
  };
  transforms?: string[];
  user?: string;
  models?: string[];
};

/**
* OpenRouter's extended usage information
*/
export type OpenRouterUsage = OpenAI.CompletionUsage & {
  completion_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number;
  };
  prompt_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  total_tokens?: number;
}

/**
* OpenRouter reasoning information
*/
export type OpenRouterReasoning = {
  reasoning?: string;
  reasoning_details?: OpenRouterReasoningDetails[];
};

/**
 * OpenRouter reasoning detail
 */
export type OpenRouterReasoningDetails = {
  id: string | null;
  type: 'reasoning.encrypted' | 'reasoning.summary' | 'reasoning.text';
  format: 'unknown' | 'openai-responses-v1' | 'xai-responses-v1' | 'anthropic-claude-v1';
  index?: number;
  summary?: string;
  text?: string;
  signature?: string;
  data?: string;
}

/**
* OpenRouter chunk with extended usage info
*/
export type OpenRouterChatChunk = 
  OpenAI.Chat.Completions.ChatCompletionChunk &
  { 
    usage?: OpenRouterUsage | null;
    choices?: Array<OpenAI.Chat.Completions.ChatCompletionChunk.Choice & {
      delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & OpenRouterReasoning;
    }>
  };

/**
* OpenRouter response with extended usage info
*/
export type OpenRouterChatResponse = OpenAI.Chat.ChatCompletion & {
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
};

/**
 * OpenRouter message parameter with reasoning info
 */
export type OpenRouterRequestMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam & OpenRouterReasoning;


/**
 * OpenRouter message with reasoning info
 */
export type OpenRouterMessage = OpenAI.Chat.Completions.ChatCompletionMessage & OpenRouterReasoning;

/**
 * OpenRouter choice with reasoning info
 */
export type OpenRouterChoice = OpenAI.ChatCompletion.Choice & {
  native_finish_reason?: string;
  message: OpenRouterMessage;
};