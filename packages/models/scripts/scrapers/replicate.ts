/**
 * Replicate Model Scraper
 *
 * Fetches model information from Replicate API using the Replicate npm module
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';
import { z } from 'zod';
import Replicate from 'replicate';
import type { ModelInfo, ModelCapability } from '@aeye/ai';
import { AI, detectTier } from '@aeye/ai';
import { writeModelTS } from '../codegen';
import { OpenRouterProvider } from 'packages/openrouter/src/openrouter';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ReplicateModelData {
  url: string;
  owner: string;
  name: string;
  description: string | null;
  visibility: string;
  github_url: string | null;
  paper_url: string | null;
  license_url: string | null;
  run_count: number;
  cover_image_url: string | null;
  default_example: {
    model: string;
    version: string;
    input: Record<string, unknown>;
    output: unknown;
  } | null;
  latest_version: {
    id: string;
    created_at: string;
    cog_version: string;
    openapi_schema: {
      info: {
        title: string;
        version: string;
      };
      paths: Record<string, unknown>;
      components: {
        schemas: {
          Input?: {
            type: string;
            properties: Record<string, unknown>;
            required?: string[];
          };
          Output?: {
            type: string;
            properties?: Record<string, unknown>;
            items?: unknown;
          };
        };
      };
    };
  } | null;
}

/**
 * Detect capabilities from model name, description, and schema
 */
function detectCapabilities(model: ReplicateModelData): Set<ModelCapability> {
  const capabilities = new Set<ModelCapability>();

  const lowerName = model.name.toLowerCase();
  const lowerDesc = (model.description || '').toLowerCase();

  // Image generation
  if (
    lowerName.includes('stable-diffusion') ||
    lowerName.includes('sdxl') ||
    lowerName.includes('flux') ||
    lowerName.includes('imagen') ||
    lowerName.includes('midjourney') ||
    lowerName.includes('dalle') ||
    lowerDesc.includes('image generation') ||
    lowerDesc.includes('image edit') ||
    lowerDesc.includes('text-to-image')
  ) {
    capabilities.add('image');
  }

  // Vision/image input
  if (
    lowerName.includes('vision') ||
    lowerName.includes('image-to-text') ||
    lowerDesc.includes('image analysis') ||
    lowerDesc.includes('image understanding') ||
    lowerDesc.includes('image edit')
  ) {
    capabilities.add('vision');
  }

  // Transcription/hearing
  if (
    lowerName.includes('whisper') ||
    lowerName.includes('transcribe') ||
    lowerDesc.includes('speech-to-text') ||
    lowerDesc.includes('transcription')
  ) {
    capabilities.add('hearing');
  }

  // Speech/audio output
  if (
    lowerName.includes('tts') ||
    lowerName.includes('speech') ||
    lowerName.includes('voice') ||
    lowerDesc.includes('text-to-speech')
  ) {
    capabilities.add('audio');
  }

  // Embeddings
  if (lowerName.includes('embed') || lowerDesc.includes('embedding')) {
    capabilities.add('embedding');
  }

  // Chat/language models
  if (
    lowerName.includes('llm') ||
    lowerName.includes('chat') ||
    lowerName.includes('gpt') ||
    lowerName.includes('llama') ||
    lowerName.includes('mistral') ||
    lowerName.includes('gemma') ||
    lowerName.includes('vicuna') ||
    lowerDesc.includes('language model') ||
    lowerDesc.includes('conversational')
  ) {
    capabilities.add('chat');
    capabilities.add('streaming');
  }

  // If no capabilities detected but has a schema, add chat as default
  if (capabilities.size === 0 && model.latest_version?.openapi_schema) {
    capabilities.add('chat');
  }

  return capabilities;
}

/**
 * Convert Replicate model to ModelInfo
 */
function convertReplicateModel(model: ReplicateModelData): ModelInfo {
  const modelId = `${model.owner}/${model.name}`;
  const capabilities = detectCapabilities(model);
  const tier = detectTier(model.name);

  return {
    provider: 'replicate',
    id: modelId,
    name: model.name,
    capabilities: capabilities, // Already an array
    tier,
    pricing: {},
    contextWindow: 0, // Not consistently available in Replicate API
    maxOutputTokens: undefined,
    metadata: {
      owner: model.owner,
      description: model.description,
      runCount: model.run_count,
      githubUrl: model.github_url,
      // paperUrl: model.paper_url,
      // coverImageUrl: model.cover_image_url,
      visibility: model.visibility,
      source: 'replicate',
      latestVersionId: model.latest_version?.id,
      cogVersion: model.latest_version?.cog_version,
      // schema: model.latest_version?.openapi_schema,
    },
  };
}

const ai = AI
  .with()
  .providers({
    openrouter: new OpenRouterProvider({ 
      apiKey: process.env.OPENROUTER_API_KEY!,
      hooks: {
        chat: {
          beforeRequest: (a, b, c, d) => {
            console.log('OpenRouter Chat Request:', b);
          },
        },
      },
    }),
  })
  .create({})
;

const typeInfo = await fs.readFile(path.join(__dirname, 'extract.md'), 'utf-8');

const extract = ai.prompt({
  name: 'extract',
  description: 'Extract model information & a transformer definition from Replicate model data',
  content: `Extract model information & a transformer definition from the following data.
  
<modelData>
{{modelData}}
</modelData>

Create a TypeScript implementation of a ModelTransformer for the model.
Here's an example transformer implementation for reference. This is the exact format to follow:
<exampleTransformer>
{ 
  // this key comes from modelData.owner/modelData.name
  "google/nano-banana": () => ({
    // you must use this ModelTransformer type to avoid TypeScript errors
    const transformer: ModelTransformer = { 
      imageGenerate: {
        // only use variable known to be in this request type based on the types below
        convertRequest: async (request, ctx) => ({ 
          prompt: request.prompt,
          ...request.extra,
        }),
        // only use known output schema from the model and only use properties expected on the response type based on the types below
        parseResponse: async (response, ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
      imageEdit: {
        convertRequest: async (request, ctx) => ({
          prompt: request.prompt,
          image_input: [await toURL(request.image)],
          ...request.extra,
        }),
        parseResponse: async (response, ctx) => ({
          images: [{ url: await toURL(response) }],
        }),
      },
    };
    return transformer;
  })(),
}
</exampleTransformer>

<availableFunctions>
- \`toURL(resource, mimeType?: string, fallback?: string): Promise<string>\` converts to URL string
- \`toBase64(resource, mimeType?: string, fallback?: string): Promise<string>\`
- \`toText(resource, fallback?: string): Promise<string>\`
- \`toStream(resource, fallback?: Readable): Promise<Readable>\`
- \`toFile(resource, mimeType?: string, filename?: string): Promise<File>\`
</availableFunctions>

Here's how the replicate code looks around the transformer:
<replicateCode>
// =============================================================
// Execute
// =============================================================
const { convertRequest, parseResponse } = transformer;
const client = new Replicate({ /* config */ });
const input = await convertRequest(request, ctx);
const output = await client.run(modelId, { input, signal });
const response = await parseResponse(output, ctx);

// =============================================================
// Stream
// =============================================================
const { convertRequest, parseChunk } = transformer;
const client = new Replicate({ /* config */ });
const input = await convertRequest(request, ctx);
for await (const event of client.stream(modelId, { input, signal })) {
  if (signal?.aborted) {
    throw new Error('Request aborted');
  }

  // Parse chunk using transformer
  const chunk = await parseChunk(event, ctx);
  yield chunk;
}
</replicateCode>

Here is type information you need to use to understand the shape of all the types:
It is EXTREMELY important you only use properties that are guaranteed to be present based on the types below when it comes to transformer, request, response, and chunk types.
The request parameters in the converted request should only be the properties that are known to be in the input schema for the model. The rest may be passed in via \`extra\` property.
<typeInfo>
{{typeInfo}}
</typeInfo>
  `,
  strict: false,
  schema: z.object({
    transformerImplementation: z.string().describe('The TypeScript implementation of the model handler (without imports or ``` marks)'),
    modelInfo: z.object({
      capabilities: z.array(z.enum([
        'chat',
        'tools',
        'vision',
        'json',
        'structured',
        'streaming',
        'reasoning',
        'image',
        'audio',
        'hearing',
        'embedding',
        'zdr'
      ])).describe(`Set of capabilities this model supports:

  - chat: Text input & output
  - tools: Ability to make tool calls
  - vision: Image inputs
  - json: Supports JSON response format 
  - structured: Supports structured output (strict JSON response format)
  - streaming: Supports streaming responses
  - reasoning: Enhanced reasoning capabilities
  - image: Image output
  - audio: Audio output
  - hearing: Audio input
  - embedding: Text -> embedding generation
  - zdr: Supports zero-data-retention through a parameter`),
      tier: z.enum(['flagship', 'efficient', 'legacy', 'experimental']).describe(`Model performance and quality tiers.
  Used for categorizing models by their capabilities and cost.
  
  - flagship: Top-tier models with best performance
  - efficient: Smaller, faster, more cost-effective models
  - legacy: Older models, may be deprecated
  - experimental: Preview/beta models`),
      pricing: z.object({
        text: z.object({
          input: z.number(),
          output: z.number(),
          cached: z.number(),
        }).optional(),
        audio: z.object({
          input: z.number().optional(),
          output: z.number().optional(),
          perSecond: z.number().optional(),
        }).optional(),
        image: z.object({
          input: z.number().optional(),
          output: z.array(z.object({
            quality: z.string().describe('Quality level - like low, medium, high'),
            sizes: z.array(z.object({
              width: z.number(),
              height: z.number(),
              cost: z.number().describe('Cost per image in USD'),
            })).describe('Supported image sizes and their costs'),
          })).optional(),
        }).optional(),
        reasoning: z.object({
          input: z.number().optional(),
          output: z.number().optional(),
          cached: z.number().optional(),
        }).optional(),
        embedding: z.object({
          cost: z.number().optional(),
        }).optional(),
        perRequest: z.number().optional().describe('Flat cost per request in USD'),
      }).describe('Pricing information. input/output/cached are per 1 million tokens unless otherwise specified.'),
      contextWindow: z.number(),
      maxOutputTokens: z.number().optional(),
      metrics: z.object({
        tokensPerSecond: z.number().optional().describe('Processing speed in tokens per second'),
        timeToFirstToken: z.number().optional().describe('Time to first token in milliseconds'),
        averageRequestDuration: z.number().optional().describe('Average request duration in milliseconds'),
        accuracyScore: z.number().optional().describe('Accuracy score based on benchmark tests 0-1'),
      }).optional().describe('Performance metrics if available'),
      tokenizer: z.enum(([
        'Other', 'GPT', 'Mistral', 'Llama3', 'Qwen3', 'Qwen', 'Gemini', 'DeepSeek', 'Claude', 'Grok', 'Llama4', 'Llama2', 'Cohere', 'Nova', 'Router'
      ])).optional().describe('The tokenizer type used by this model if known, otherwise leave undefined'),
      supportedParameters: z.array(z.enum([
        // Chat Request
        'maxTokens', // max_tokens / max_completion_tokens
        'temperature', // temperature
        'topP', // top_p
        'frequencyPenalty', // frequency_penalty
        'presencePenalty', // presence_penalty
        'stop', // stop
        'seed', // seed
        'responseFormat', // response_format
        'structuredOutput', // structured_outputs
        'tools', // tools
        'toolChoice', // tool_choice
        'logitBias', // logit_bias
        'logProbabilities', // logprobs
        'reason', // reasoning
        // Image
        'imageBackground', // background
        'imageMultiple', // n
        'imageFormat', // output_format ()
        'imageStream', // stream / partial_images
        'imageStyle',
        // Embedding
        'embeddingDimensions', // dimensions
        // Transcription
        'transcribeStream', // stream
        'transcribePrompt', // prompt
        // Speech
        'speechInstructions', // instructions
      ])).optional().describe('The supported parameters for this model'),
    }).describe('The extracted model information'),
  }),
  input: ({ modelData }: { model: string, modelData: ReplicateModelData }) => ({
    modelData: JSON.stringify(modelData, null, 2),
    typeInfo,
  }),
  config: (input) => ({
    model: input?.model,
  }),
})

/**
 * Fetch all models from Replicate collections
 */
async function fetchAllModels(apiKey?: string): Promise<ReplicateModelData[]> {
  console.log('Fetching Replicate models...');

  const client = new Replicate({
    auth: apiKey || process.env.REPLICATE_API_KEY,
  });

  const allModels: ReplicateModelData[] = [];
  const seenModels = new Set<string>();

  // Collections to scrape
  const collections = [
    'text-to-image',
    'image-to-text',
    'text-to-speech',
    'speech-to-text',
    'super-resolution',
    'image-editing',
    'ai-face-generator',
    'ai-music-generation',
    'text-recognition-ocr',
    'flux',
    'ai-image-restoration',
    'text-classification',
    'sketch-to-image',
    'embedding-models',
    'vision-models',
  ];

  console.log(`Fetching models from ${collections.length} collections...`);

  for (const collectionSlug of collections) {
    try {
      console.log(`  Fetching collection: ${collectionSlug}...`);

      const collection = await client.collections.get(collectionSlug);

      if (collection.models) {
        for (const model of collection.models) {
          const modelId = `${(model as any).owner}/${(model as any).name}`;

          // Skip duplicates
          if (seenModels.has(modelId)) {
            continue;
          }

          seenModels.add(modelId);
          allModels.push(model as ReplicateModelData);
        }

        console.log(`    ✓ Found ${collection.models.length} models in ${collectionSlug}`);
      }
    } catch (error) {
      console.log(`    ⚠ Failed to fetch collection ${collectionSlug}:`, error instanceof Error ? error.message : error);
    }
  }

  allModels.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n✓ Fetched ${allModels.length} unique Replicate models`);

  return allModels;
}

/**
 * Fetch model details including schema (for cache)
 */
async function fetchModelSchema(
  modelId: string,
  client: Replicate
): Promise<{
  modelId: string;
  data: ReplicateModelData | null;
}> {
  try {
    const [owner, name] = modelId.split('/');
    const model = await client.models.get(owner, name);
    return { modelId, data: model as ReplicateModelData };
  } catch (error) {
    console.log(`  ⚠ Failed to fetch model ${modelId}:`, error instanceof Error ? error.message : error);
    return { modelId, data: null };
  }
}

/**
 * Fetch schemas in parallel with concurrency control
 */
async function fetchSchemasParallel(
  models: ReplicateModelData[],
  apiKey: string,
  concurrency: number = 50
): Promise<Record<string, ReplicateModelData>> {
  console.log(`\nCaching detailed model schemas (concurrency: ${concurrency})...`);

  const client = new Replicate({
    auth: apiKey,
  });

  const schemasCache: Record<string, ReplicateModelData> = {};

  // First, add models that already have schemas
  for (const model of models) {
    const modelId = `${model.owner}/${model.name}`;
    if (model.latest_version?.openapi_schema) {
      schemasCache[modelId] = model;
    }
  }

  // Find models that need schema fetching
  const modelsToFetch = models.filter((model) => {
    const modelId = `${model.owner}/${model.name}`;
    return !model.latest_version?.openapi_schema;
  });

  if (modelsToFetch.length === 0) {
    console.log(`✓ All ${models.length} models already have schemas\n`);
    return schemasCache;
  }

  console.log(`  ${Object.keys(schemasCache).length - modelsToFetch.length} models already have schemas`);
  console.log(`  Fetching schemas for ${modelsToFetch.length} models...\n`);

  // Process in batches with concurrency control
  const modelIdsToFetch = modelsToFetch.map((m) => `${m.owner}/${m.name}`);

  for (let i = 0; i < modelIdsToFetch.length; i += concurrency) {
    const batch = modelIdsToFetch.slice(i, i + concurrency);
    console.log(`  Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(modelIdsToFetch.length / concurrency)} (${batch.length} models)...`);

    const batchResults = await Promise.all(
      batch.map((modelId) => fetchModelSchema(modelId, client))
    );

    // Store results
    for (const { modelId, data } of batchResults) {
      if (data) {
        schemasCache[modelId] = data;
      }
    }

    console.log(`    ✓ Fetched ${batchResults.filter((r) => r.data).length}/${batch.length} schemas`);
  }

  console.log(`\n✓ Cached ${Object.keys(schemasCache).length} model schemas\n`);

  return schemasCache;
}

/**
 * Main scraper function
 */
export async function scrapeReplicate(
  outputDir: string,
  cacheDir?: string,
  options: { 
    concurrency?: number, 
    transformers?: boolean,
    transformerModel: string,
    models?: string[],
    n?: number,
  } = {
    transformerModel: 'google/gemini-2.5-flash',
  }
): Promise<void> {
  const { concurrency = 50 } = options;

  console.log('\n=== Replicate Scraper ===\n');

  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) {
    console.error('✗ REPLICATE_API_KEY environment variable is required');
    process.exit(1);
  }

  // Fetch all models from collections
  const models = await fetchAllModels(apiKey);

  // Convert to ModelInfo format
  const modelInfos = models.map(convertReplicateModel);

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  // Save raw models data
  await fs.writeFile(
    path.join(outputDir, 'replicate-models.json'),
    JSON.stringify({ data: models }, (key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }, 2)
  );
  console.log(`✓ Saved raw Replicate models to replicate-models.json`);

  let schemasCache: Record<string, ReplicateModelData> = {};

  // Create cache directory if specified
  if (cacheDir) {
    await fs.mkdir(cacheDir, { recursive: true });

    // Cache detailed model schemas (for transformer generation)
    schemasCache = await fetchSchemasParallel(models, apiKey, concurrency);

    // Save schemas cache
    await fs.writeFile(
      path.join(cacheDir, 'replicate-schemas.json'),
      JSON.stringify(schemasCache, (key, value) => {
        if (value instanceof Set) {
          return Array.from(value);
        }
        return value;
      }, 2)
    );

    console.log(`✓ Saved ${Object.keys(schemasCache).length} model schemas to ${cacheDir}/replicate-schemas.json`);
    console.log('  (This cache file is for transformer generation and should not be committed)');

    // Chunk it up to 80,000 character files for easier loading later
    const chunkSize = 80000;
    const schemaEntries = Object.entries(schemasCache);
    let currentChunk: Record<string, ReplicateModelData> = {};
    let currentSize = 0;
    let chunkIndex = 1;
    for (const [modelId, modelData] of schemaEntries) {
      const entryString = JSON.stringify({ [modelId]: modelData });
      if (currentSize + entryString.length > chunkSize && Object.keys(currentChunk).length > 0) {
        // Save current chunk
        await fs.writeFile(
          path.join(cacheDir, `replicate-schemas-chunk-${chunkIndex}.json`),
          JSON.stringify(currentChunk, null, 2)
        );
        console.log(`✓ Saved schema chunk ${chunkIndex} with ${Object.keys(currentChunk).length} models`);
        chunkIndex++;
        currentChunk = {};
        currentSize = 0;
      }
      currentChunk[modelId] = modelData;
      currentSize += entryString.length;
    }
    // Save any remaining chunk
    if (Object.keys(currentChunk).length > 0) {
      await fs.writeFile(
        path.join(cacheDir, `replicate-schemas-chunk-${chunkIndex}.json`),
        JSON.stringify(currentChunk, null, 2)
      );
      console.log(`✓ Saved schema chunk ${chunkIndex} with ${Object.keys(currentChunk).length} models`);
    }

    // Calculate number of unique schemas
    const uniqueSchemas = new Set<string>();
    for (const modelData of Object.values(schemasCache)) {
      if (modelData.latest_version) {
        uniqueSchemas.add(JSON.stringify(modelData.latest_version.openapi_schema.components.schemas));
      }
    }
  
    console.log(`\n✓ Found ${uniqueSchemas.size} unique model schemas across ${Object.keys(schemasCache).length} models\n`);

    // Generate Model Transformers
    if (options.transformers) {
      console.log('=== Generating Model Transformers ===\n');

      // Create replicate transformers directory
      await fs.mkdir(path.join(cacheDir, 'replicate'), { recursive: true });

      let transformingModels = models;
      let overwrite = false;
      
      // Filter to only models with schemas if transformers are desired
      if (options.models && options.models.length > 0) {
        const modelSet = new Set(options.models);
        transformingModels = models.filter((model) => {
          const modelId = `${model.owner}/${model.name}`;
          return modelSet.has(modelId);
        });
        overwrite = true;
      }

      // If models were not specified, filter out already transformed models
      if (!overwrite) {
        const alreadyTransformed = await fs.readdir(
          path.join(cacheDir, 'replicate'),
        );
        const alreadyTransformedSet = new Set(
          alreadyTransformed.map((filename) => filename.replace('.ts', ''))
        );
        transformingModels = transformingModels.filter((model) => {
          const modelId = `${model.owner}/${model.name}`;
          const transformedFile = modelId.replace(/[^\w]/g, '-') + '.ts';
          return !alreadyTransformedSet.has(transformedFile);
        });
      }

      // Only first N models if specified
      if (options.n && options.n > 0) {
        transformingModels = models.slice(0, options.n);
      }

      // Call extractor for each model
      console.log(`Generating transformers for ${transformingModels.length} models...\n`);

      for (const model of transformingModels) {
        const modelId = `${model.owner}/${model.name}`;
        const transformedFile = modelId.replace(/[^\w]/g, '-') + '.ts';
        const modelData = schemasCache[modelId] || model;

        console.log(`\n--- Generating transformer for model: ${modelId} ---`);

        const result = await extract.get('result', { modelData, model: options.transformerModel });
        if (!result) {
          console.log(`  ✗ Failed to generate transformer for model: ${modelId}`);
          continue;
        }

        const converted = convertReplicateModel(modelData);

        const translatedModelInfo: ModelInfo<'replicate'> = {
          id: converted.id,
          provider: 'replicate',
          name: converted.name,
          contextWindow: result.modelInfo.contextWindow,
          maxOutputTokens: result.modelInfo.maxOutputTokens,
          pricing: result.modelInfo.pricing,
          tier: result.modelInfo.tier,
          capabilities: new Set(result.modelInfo.capabilities),
          metrics: result.modelInfo.metrics,
          tokenizer: result.modelInfo.tokenizer,
          supportedParameters: new Set(result.modelInfo.supportedParameters),
          metadata: converted.metadata,
        };

        const replaceIndex = modelInfos.findIndex((m) => m.id === translatedModelInfo.id);
        if (replaceIndex >= 0) {
          modelInfos[replaceIndex] = translatedModelInfo;
        } else {
          console.log(`  ⚠ ModelInfo for ${modelId} not found in main list, adding new entry`);
        }

        await fs.writeFile(
          path.join(cacheDir, 'replicate', transformedFile),
          `
import { toURL, toBase64, toText, toStream, toFile } from '@aeye/core';
import { ModelTransformer } from '@aeye/ai';

const transformer = ${result.transformerImplementation};

const modelInfo = ${JSON.stringify(translatedModelInfo, null, 2)};

export { transformer, modelInfo };`.trim()
        );
      }
    }
  }

  // Save JSON for reference
  await fs.writeFile(
    path.join(outputDir, 'replicate-modelinfo.json'),
    JSON.stringify(modelInfos, (key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }, 2)
  );
  console.log(`✓ Saved ${modelInfos.length} models to JSON`);

  // Generate TypeScript file
  const srcDir = path.join(__dirname, '../../src/models');
  await writeModelTS(modelInfos, 'replicateModels', path.join(srcDir, 'replicate.ts'));
  console.log(`✓ Generated TypeScript file: src/models/replicate.ts`);

  console.log('\n✓ Replicate scraping complete\n');
}

// CLI execution
if (process.argv[1].endsWith('replicate.ts')) {
  const args = process.argv.slice(2);
  const outputDir = args.find((arg) => !arg.startsWith('--')) || path.join(__dirname, '../../data');
  const cacheDir = args.find((arg, i) => i > 0 && !arg.startsWith('--') && !args[i - 1].startsWith('--')) || path.join(__dirname, '../../cache');

  const concurrencyArg = args.find((arg) => arg.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg.split('=')[1], 10)
    : 50;

  const transformers = args.includes('--transformers');

  const transformerModelArg = args.find((arg) => arg.startsWith('--transformer-model='));
  const transformerModel = transformerModelArg
    ? transformerModelArg.split('=', 2)[1]
    : 'google/gemini-2.5-pro';

  const modelsArg = args.find((arg) => arg.startsWith('--models='));
  let models: string[] | undefined = undefined;
  if (modelsArg) {
    models = modelsArg.substring(9).split(',').map((m) => m.trim());
  }

  const nArg = args.find((arg) => arg.startsWith('--n='));;
  const n = nArg ? parseInt(nArg.split('=')[1], 10) : undefined;

  scrapeReplicate(outputDir, cacheDir, { concurrency, transformers, transformerModel, models, n }).catch((error) => {
    console.error('✗ Replicate scraping failed:', error);
    process.exit(1);
  });
}
