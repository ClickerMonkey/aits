/**
 * Replicate Model Scraper
 *
 * Fetches model information from Replicate API using the Replicate npm module
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import Replicate from 'replicate';
import type { ModelInfo, ModelCapability } from '@aits/ai';
import { detectTier } from '@aits/ai';
import { writeModelTS } from '../codegen';

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
    'image-to-image',
    'text-to-video',
    'image-restoration',
    'super-resolution',
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

  console.log(`  ${schemasCache.length} models already have schemas`);
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
  options: { concurrency?: number } = {}
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

  // Create cache directory if specified
  if (cacheDir) {
    await fs.mkdir(cacheDir, { recursive: true });

    // Cache detailed model schemas (for transformer generation)
    const schemasCache = await fetchSchemasParallel(models, apiKey, concurrency);

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
  }

  // Convert to ModelInfo format
  const modelInfos = models.map(convertReplicateModel);

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
if (require.main === module) {
  const args = process.argv.slice(2);
  const outputDir = args.find((arg) => !arg.startsWith('--')) || path.join(__dirname, '../../data');
  const cacheDir = args.find((arg, i) => i > 0 && !arg.startsWith('--') && !args[i - 1].startsWith('--')) || path.join(__dirname, '../../cache');

  const concurrencyArg = args.find((arg) => arg.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg.split('=')[1], 10)
    : 50;

  scrapeReplicate(outputDir, cacheDir, { concurrency }).catch((error) => {
    console.error('✗ Replicate scraping failed:', error);
    process.exit(1);
  });
}
