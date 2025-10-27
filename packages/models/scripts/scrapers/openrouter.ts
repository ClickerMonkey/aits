/**
 * OpenRouter Model Scraper
 *
 * Fetches model information from OpenRouter API endpoints and scrapes performance metrics
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import { fetchModels, fetchZDRModels, OpenRouterModel } from '@aits/openrouter';
import type { ModelInfo, ModelCapability, ModelParameter, ModelTokenizer } from '@aits/ai';
import { detectTier } from '@aits/ai';
import { writeModelTS } from '../codegen';

/**
 * Convert OpenRouter parameter names to our ModelParameter format
 */
function convertSupportedParameters(openRouterParams: string[]): ModelParameter[] {
  const paramMap: Record<string, ModelParameter> = {
    'max_tokens': 'maxTokens',
    'temperature': 'temperature',
    'top_p': 'topP',
    'frequency_penalty': 'frequencyPenalty',
    'presence_penalty': 'presencePenalty',
    'stop': 'stop',
    'seed': 'seed',
    'response_format': 'responseFormat',
    'structured_outputs': 'structuredOutput',
    'tools': 'tools',
    'tool_choice': 'toolChoice',
    'logit_bias': 'logitBias',
    'logprobs': 'logProbabilities',
    'top_logprobs': 'logProbabilities',
    'reasoning': 'reason',
    'include_reasoning': 'reason',
  };

  const converted = new Set<ModelParameter>();
  for (const param of openRouterParams) {
    const mapped = paramMap[param];
    if (mapped) {
      converted.add(mapped);
    }
  }

  return Array.from(converted);
}

/**
 * Detect capabilities from input/output modalities
 */
function detectCapabilities(model: OpenRouterModel): ModelCapability[] {
  const capabilities = new Set<ModelCapability>();

  // Chat capability - if model outputs text
  if (model.architecture.output_modalities.includes('text')) {
    capabilities.add('chat');
  }

  // Image generation - if model outputs images
  if (model.architecture.output_modalities.includes('image')) {
    capabilities.add('image');
  }

  // Vision capability - if model accepts images as input
  if (model.architecture.input_modalities.includes('image')) {
    capabilities.add('vision');
  }

  // Audio/hearing capability - if model accepts audio as input
  if (model.architecture.input_modalities.includes('audio')) {
    capabilities.add('hearing');
  }

  // File handling capability
  if (model.architecture.input_modalities.includes('file')) {
    capabilities.add('vision'); // Files often imply document/vision capabilities
  }

  // Tools/function calling
  if (model.supported_parameters.includes('tools') || model.supported_parameters.includes('tool_choice')) {
    capabilities.add('tools');
  }

  // Reasoning capability
  if (model.supported_parameters.includes('reasoning') || model.supported_parameters.includes('include_reasoning')) {
    capabilities.add('reasoning');
  }

  // JSON output capability
  if (model.supported_parameters.includes('response_format')) {
    capabilities.add('json');
  }

  // Structured output capability
  if (model.supported_parameters.includes('structured_outputs')) {
    capabilities.add('structured');
  }

  // Streaming capability (most models support this)
  capabilities.add('streaming');

  return Array.from(capabilities);
}

/**
 * Scrape performance metrics from OpenRouter model page
 */
async function scrapeModelMetrics(modelId: string, browser: puppeteer.Browser): Promise<{
  modelId: string;
  metrics: {
    latency?: number;
    throughput?: number;
    uptime?: number;
  } | null;
}> {
  const page = await browser.newPage();

  try {
    // OpenRouter model URLs use the canonical slug format
    const url = `https://openrouter.ai/${modelId}`;
    const response = await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 30000,
    });

    if (!response || response.status() === 404) {
      return { modelId, metrics: null };
    }

    const bodyText = await page.$eval('body', el => el.textContent || '');
    const metrics: { latency?: number; throughput?: number; uptime?: number } = {};

    // Latency0.62sThroughput47.46tpsUptime100.0%Uptime 100.0

    // Look for latency (in ms)
    const latencyMatch = bodyText.match(/latency[:\s]*([0-9.]+)\s*s/i);
    if (latencyMatch) {
      metrics.latency = parseFloat(latencyMatch[1]);
    }

    // Look for throughput (tokens/second)
    const throughputMatch = bodyText.match(/throughput[:\s]*([0-9.]+)\s*tps/i);
    if (throughputMatch) {
      metrics.throughput = parseFloat(throughputMatch[1]);
    }

    // Look for uptime (percentage)
    const uptimeMatch = bodyText.match(/uptime[:\s]*([0-9.]+)%/i);
    if (uptimeMatch) {
      metrics.uptime = parseFloat(uptimeMatch[1]);
    }

    if (!latencyMatch || !throughputMatch || !uptimeMatch) {
      console.log(`⚠ No metrics found on page ${modelId}`);
      await fs.writeFile(`./data/pages/openrouter-${modelId.replace(/[^a-z]/gi, '')}.html`, bodyText);
    }

    return { modelId, metrics };
  } catch (error) {
    console.log(`  ✗ Error scraping metrics for ${modelId}:`, error instanceof Error ? error.message : error);
    return { modelId, metrics: null };
  } finally {
    await page.close();
  }
}

/**
 * Scrape metrics for multiple models in parallel with concurrency control
 */
async function scrapeMetricsParallel(
  modelIds: string[],
  concurrency: number = 5
): Promise<Map<string, { latency?: number; throughput?: number; uptime?: number }>> {
  console.log(`\nScraping performance metrics from OpenRouter model pages (concurrency: ${concurrency})...`);

  const browser = await puppeteer.launch({ headless: true });
  const results = new Map<string, { latency?: number; throughput?: number; uptime?: number }>();

  try {
    // Process in batches with concurrency control
    for (let i = 0; i < modelIds.length; i += concurrency) {
      const batch = modelIds.slice(i, i + concurrency);
      console.log(`  Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(modelIds.length / concurrency)} (${batch.length} models)...`);

      const batchResults = await Promise.all(
        batch.map((modelId) => scrapeModelMetrics(modelId, browser))
      );

      // Store results
      for (const { modelId, metrics } of batchResults) {
        if (metrics) {
          results.set(modelId, metrics);
        }
      }

      console.log(`    ✓ Scraped ${batchResults.filter((r) => r.metrics).length}/${batch.length} models`);
    }

    console.log(`✓ Scraped metrics for ${results.size}/${modelIds.length} models\n`);
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Convert OpenRouter model to ModelInfo with full details
 */
export function convertOpenRouterModel(
  model: OpenRouterModel,
  zdrModelIds: Set<string>,
  metrics?: { latency?: number; throughput?: number; uptime?: number } | null
): ModelInfo {
  const capabilities = detectCapabilities(model);
  const supportedParameters = convertSupportedParameters(model.supported_parameters);
  const tier = detectTier(model.name);

  // Update ZDR support from ZDR endpoint
  if (zdrModelIds.has(model.id)) {
    capabilities.push('zdr');
  }

  // Extract provider from model ID (format: provider/model-name)
  const provider = model.id.includes('/') ? model.id.split('/')[0] : 'openrouter';

  const hasValue = (x: string | undefined): x is string => {
    return x !== undefined && x !== null && x !== '' && x !== '0';
  }

  return {
    provider,
    id: model.id,
    name: model.name,
    capabilities: new Set(capabilities), // Will be serialized as array
    tier,
    pricing: {
      text: hasValue(model.pricing.prompt) || hasValue(model.pricing.completion) ? {
        input: hasValue(model.pricing.prompt) ? parseFloat(model.pricing.prompt) * 1_000_000 : undefined,
        output: hasValue(model.pricing.completion) ? parseFloat(model.pricing.completion) * 1_000_000 : undefined,
      } : undefined,
      image: hasValue(model.pricing.image) ? {
        input: parseFloat(model.pricing.image) * 1_000_000,
      } : undefined,
      reasoning: hasValue(model.pricing.internal_reasoning) ? {
        output: parseFloat(model.pricing.internal_reasoning) * 1_000_000,
      } : undefined,
      perRequest: hasValue(model.pricing.request) 
        ? parseFloat(model.pricing.request) 
        : undefined,
    },
    contextWindow: model.context_length,
    maxOutputTokens: model.top_provider.max_completion_tokens ?? undefined,
    tokenizer: model.architecture.tokenizer as ModelTokenizer,
    supportedParameters: new Set(supportedParameters), // Will be serialized as array
    metrics: metrics ? {
      timeToFirstToken: metrics.latency,
      tokensPerSecond: metrics.throughput,
      // Store uptime in metadata since it's not a standard metric
    } : undefined,
    metadata: {
      description: model.description,
      defaultParameters: model.default_parameters,
      source: 'openrouter',
      canonicalSlug: model.canonical_slug,
      huggingFaceId: model.hugging_face_id,
      created: model.created,
      uptime: metrics?.uptime,
    },
  };
}

/**
 * Main scraper function
 */
export async function scrapeOpenRouter(
  outputDir: string,
  options: { metrics?: boolean; concurrency?: number } = {}
): Promise<void> {
  const { metrics: scrapeMetrics = false, concurrency = 5 } = options;

  console.log('\n=== OpenRouter Scraper ===\n');

  // Fetch models using existing functions
  const [models, zdrModelIds] = await Promise.all([
    fetchModels(process.env.OPENROUTER_API_KEY),
    fetchZDRModels(process.env.OPENROUTER_API_KEY),
  ]);

  console.log(`✓ Fetched ${models.length} OpenRouter models`);
  console.log(`✓ Fetched ${zdrModelIds.size} ZDR model IDs`);

  // Save raw data
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(
    path.join(outputDir, 'openrouter-models.json'),
    JSON.stringify({ data: models }, (key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }, 2)
  );
  console.log(`✓ Saved raw OpenRouter models to openrouter-models.json`);

  if (zdrModelIds.size > 0) {
    await fs.writeFile(
      path.join(outputDir, 'openrouter-zdr.json'),
      JSON.stringify({ data: Array.from(zdrModelIds) }, (key, value) => {
        if (value instanceof Set) {
          return Array.from(value);
        }
        return value;
      }, 2)
    );
    console.log(`✓ Saved ZDR model IDs to openrouter-zdr.json`);
  }

  // Scrape performance metrics if requested
  let metricsMap = new Map<string, { latency?: number; throughput?: number; uptime?: number }>();

  if (scrapeMetrics) {
    const modelIds = models.map((m) => m.id);
    metricsMap = await scrapeMetricsParallel(modelIds, concurrency);
  }

  // Convert to ModelInfo format
  const modelInfos = models.map((model) =>
    convertOpenRouterModel(model, zdrModelIds, metricsMap.get(model.id))
  );

  // Save JSON for reference
  await fs.writeFile(
    path.join(outputDir, 'openrouter-modelinfo.json'),
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
  await writeModelTS(modelInfos, 'openrouterModels', path.join(srcDir, 'openrouter.ts'));
  console.log(`✓ Generated TypeScript file: src/models/openrouter.ts`);

  console.log('\n✓ OpenRouter scraping complete\n');
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const outputDir = args.find((arg) => !arg.startsWith('--')) || path.join(__dirname, '../../data');
  const scrapeMetrics = args.includes('--metrics');

  const concurrencyArg = args.find((arg) => arg.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg.split('=')[1], 10)
    : 5;

  scrapeOpenRouter(outputDir, { metrics: scrapeMetrics, concurrency }).catch((error) => {
    console.error('✗ OpenRouter scraping failed:', error);
    process.exit(1);
  });
}
