/**
 * OpenAI Model Scraper
 *
 * Scrapes model information from OpenAI documentation using Puppeteer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import type { ModelInfo, ModelCapability, ModelTier, ModelParameter } from '@aits/ai';
import { writeModelTS } from '../codegen';


const PerformanceScoreMap: Record<string, number> = {
  'highest': 1.0,
  'higher': 0.8,
  'high': 0.6,
  'average': 0.4,
  'low': 0.2,
  'lowest': 0.1,
};
const IntelligenceScoreMap: Record<string, number> = {
  'highest': 1.0,
  'higher': 0.8,
  'high': 0.6,
  'average': 0.4,
  'low': 0.2,
  'lowest': 0.1,
};
const ReasoningScoreMap: Record<string, number> = {
  'highest': 1.0,
  'higher': 0.8,
  'high': 0.6,
  'average': 0.4,
  'low': 0.2,
  'lowest': 0.1,
};
const SpeedScoreMap: Record<string, number> = {
  'fastest': 120,
  'very fast': 100,
  'fast': 80,
  'medium': 60,
  'slow': 40,
  'slowest': 20,
};

interface OpenAIModelData {
  id: string;
  name: string;
  performance?: string; // Highest|Higher|High|Average|Low|Lowest
  intelligence?: string; // Highest|Higher|High|Average|Low|Lowest
  reasoning?: string; // Highest|Higher|High|Average|Low|Lowest
  speed?: string; // Fastest|Very fast|Fast|Medium|Slow|Slowest
  capabilities: Set<ModelCapability>;
  supportedParameters?: Set<ModelParameter>;
  contextWindow?: number;
  maxOutputTokens?: number;
  knowledgeCutoff?: string;
  reasoningTokenSupport?: boolean;
  pricing: {
    textTokens?: {
      input?: number;
      output?: number;
      cached?: number;
    };
    audioTokens?: {
      input?: number;
      output?: number;
    };
    imageTokens?: {
      input?: number;
      output?: {
        quality: string; // e.g., low, medium, high
        sizes: {
          width: number;
          height: number;
          cost: number;
        }[]
      }[];
    };
    embeddings?: {
      cost?: number;
    };
  };
}

/**
 * Scrape OpenAI models list page
 */
async function scrapeModelsListPage(): Promise<string[]> {
  console.log('Scraping OpenAI models list...');

  const models = await fetch('https://api.openai.com/v1/models', {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  const data = await models.json() as { data: { id: string }[] };

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid response from OpenAI API');
  }

  return data.data.map((model: any) => model.id);
}

/**
 * Scrape individual model page for details
 */
async function scrapeModelDetails(modelId: string, browser: puppeteer.Browser): Promise<{
  modelId: string;
  data: OpenAIModelData | null;
}> {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const modelSlug = /-\d{4}$/.test(modelId)
      ? modelId.slice(0, -5)
      : /-\d{4}-\d{2}-\d{2}$/.test(modelId)
        ? modelId.slice(0, -11)
        : modelId;
    
    let url = `https://platform.openai.com/docs/models/${modelSlug}`;
    if (modelSlug !== modelId) {
      url += '?snapshot=' + modelId;
    }

    const response = await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle0'],
      timeout: 30000,
    });

    if (!response || response.status() === 404) {
      return { modelId, data: null };
    }
    
    // Wait for main content to load
    try {
      // await page.waitForSelector('.docs-scroll-container', { timeout: 30000 });
    } catch (e) {}

    const modelData: OpenAIModelData = {
      id: modelId,
      name: modelId,
      pricing: {},
      capabilities: new Set<ModelCapability>(),
    };
    
    const bodyText = await page.$eval('body', el => el.textContent || '');
    const bodyHtml = await page.$eval('body', el => el.innerHTML || '');

    const grab = (regex: RegExp, fromText: string = bodyText): string | undefined => {
      const match = fromText.match(regex);
      return match ? match[1].toLowerCase() : undefined;
    };
    const grabNumber = (regex: RegExp, fromText: string = bodyText): number | undefined => {
      const match = fromText.match(regex);
      return match ? parseFloat(match[1].replace(/,/g, '')) : undefined;
    };

    // ===== HEADER =====
    modelData.intelligence = grab(/Performance\s*(Highest|Higher|High|Average|Low|Lowest)/i);
    modelData.performance = grab(/Intelligence\s*(Highest|Higher|High|Average|Low|Lowest)/i);
    modelData.reasoning = grab(/Reasoning\s*(Highest|Higher|High|Average|Low|Lowest)/i);
    modelData.speed = grab(/Speed\s*(Fastest|Very fast|Fast|Medium|Slow|Slowest)/i);
    modelData.contextWindow = grabNumber(/([0-9,]+)\s+context window/i);
    modelData.maxOutputTokens = grabNumber(/([0-9,]+)\s+max output tokens/i);
    modelData.knowledgeCutoff = grab(/((Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Oct|October|Sep|Sept|September|Nov|November|Dec|December)\s+\d{1,2},\s+\d{4})\s+knowledge\s+cutoff/i);
    modelData.reasoningTokenSupport = /Reasoning token support/i.test(bodyText);

    const headerKeys: (keyof OpenAIModelData)[] = [
      'intelligence',
      'performance',
      'reasoning',
      'speed',
      'contextWindow',
      'maxOutputTokens',
      'knowledgeCutoff',
    ];
    const hasHeaderData = headerKeys.some((key) => modelData[key] !== undefined);
    let hasPricingData = false;

    const pricingStart = bodyText.indexOf('PricingPricing');
    const pricingEnd = bodyText.indexOf('Modalities', pricingStart);
    const pricingSection = bodyText.slice(pricingStart, pricingEnd);
    const pricingSections = pricingSection.split(/(Text tokens|Image tokens|Image generation|Audio tokens|Speech generation|Embeddings|Modalities)/i);
    const modalitiesStart = pricingSections.indexOf('Modalities');
    const pricingSectionsTrimmed = modalitiesStart >= 0
      ? pricingSections.slice(0, modalitiesStart)
      : pricingSections;
    const pricingSectionsGrouped: Record<string, string[]> = {};

    for (let i = 1; i < pricingSectionsTrimmed.length; i += 2) {
      const key = pricingSectionsTrimmed[i].toLowerCase();
      const value = pricingSectionsTrimmed[i + 1] || '';
      pricingSectionsGrouped[key] = pricingSectionsGrouped[key] || [];
      pricingSectionsGrouped[key].push(value);
    }

    const textTokens = pricingSectionsGrouped['text tokens'] || [];
    if (textTokens.length > 0) {
      for (const section of textTokens) {
        modelData.pricing.textTokens = {};
        modelData.pricing.textTokens.input = grabNumber(/Input\$(\d+(\.\d+)?)/s, section);
        modelData.pricing.textTokens.cached = grabNumber(/Cached input\$(\d+(\.\d+)?)/s, section);
        modelData.pricing.textTokens.output = grabNumber(/Output\$(\d+(\.\d+)?)/s, section);

        hasPricingData ||= modelData.pricing.textTokens.input !== undefined;
        hasPricingData ||= modelData.pricing.textTokens.output !== undefined;
        hasPricingData ||= modelData.pricing.textTokens.cached !== undefined;
      }
    }

    const imageTokens = pricingSectionsGrouped['image tokens'] || [];
    if (imageTokens.length > 0) {
      for (const section of imageTokens) {
      modelData.pricing.imageTokens = {};
        modelData.pricing.imageTokens.input = grabNumber(/Input\$(\d+(\.\d+)?)/s, section);
        
        if (modelData.pricing.imageTokens.input !== undefined) {
          modelData.capabilities.add('vision');
          
          hasPricingData = true;
        }
      }
    }

    const imageGeneration = pricingSectionsGrouped['image generation'] || [];
    if (imageGeneration.length > 0) {
      for (const section of imageGeneration) {
        const quality = /Quality\s*([^\d]+)/i.exec(section);
        if (!quality) continue;

        const size = /(1024|1536|256|512|1792)x(1024|1536|256|512|1792)/;
        const sizeSections = section.split(size).slice(1);

        for (let i = 0; i < sizeSections.length; i += 3) {
          const width = parseInt(sizeSections[i], 10);
          const height = parseInt(sizeSections[i + 1], 10);
          const cost = parseFloat(sizeSections[i + 2].replace(/[\$\,]+/g, ''));

          if (!isFinite(cost) || !isFinite(width) || !isFinite(height)) continue;

          modelData.pricing.imageTokens = modelData.pricing.imageTokens || {};
          modelData.pricing.imageTokens.output = modelData.pricing.imageTokens.output || [];

          let qualityEntry = modelData.pricing.imageTokens.output.find((q) => q.quality === quality[1].trim().toLowerCase());
          if (!qualityEntry) {
            qualityEntry = { quality: quality[1].trim().toLowerCase(), sizes: [] };
            modelData.pricing.imageTokens.output.push(qualityEntry);
          }

          qualityEntry.sizes.push({ width, height, cost });
        }
      }

      if (modelData.pricing.imageTokens?.output?.length) {
        modelData.capabilities.add('image');

        hasPricingData = true;
      } else {
        delete modelData.pricing.imageTokens?.output;
      }
    }

    const audioTokens = pricingSectionsGrouped['audio tokens'] || [];
    if (audioTokens.length > 0) {
      for (const section of audioTokens) {
        modelData.pricing.audioTokens = {};
        modelData.pricing.audioTokens.input = grabNumber(/Input\$(\d+(\.\d+)?)/s, section);
        modelData.pricing.audioTokens.output = grabNumber(/Output\$(\d+(\.\d+)?)/s, section);
        if (modelData.pricing.audioTokens.input !== undefined) {
          modelData.capabilities.add('hearing');
          hasPricingData = true;
        }
        if (modelData.pricing.audioTokens.output !== undefined) {
          modelData.capabilities.add('audio');
          hasPricingData = true;
        }
      } 
    }

    const speechGeneration = pricingSectionsGrouped['speech generation'] || [];
    if (speechGeneration.length > 0) {
      for (const section of speechGeneration) {
        modelData.pricing.audioTokens = modelData.pricing.audioTokens || {};
        modelData.pricing.audioTokens.output = grabNumber(/Cost\$(\d+(\.\d+)?)/s, section);
        if (modelData.pricing.audioTokens.output !== undefined) {
          modelData.capabilities.add('audio');
          hasPricingData = true;
        }
      }
    }

    const embeddings = pricingSectionsGrouped['embeddings'] || [];
    if (embeddings.length > 0) {
      for (const section of embeddings) {
        modelData.pricing.embeddings = {};
        modelData.pricing.embeddings.cost = grabNumber(/Cost\$(\d+(\.\d+)?)/s, section);
        if (modelData.pricing.embeddings.cost !== undefined) {
          modelData.capabilities.add('embedding');
          hasPricingData = true;
        } 
      }
    }

    if (/Pricing.*Use caseTranscription/i.test(bodyText)) {
      modelData.pricing.audioTokens = modelData.pricing.audioTokens || {};
      modelData.pricing.audioTokens.input = grabNumber(/Pricing.*?Use caseTranscriptionCost\$(\d+(\.\d+)?)/s);
      
      if (modelData.pricing.audioTokens.input !== undefined) {
        modelData.capabilities.add('hearing');
      }

      hasPricingData ||= modelData.pricing.audioTokens.input !== undefined;
    }

    const textSupport = grab(/Text(Output only|Input only|Input and output|Not supported)/i) || '';
    const imageSupport = grab(/Image(Output only|Input only|Input and output|Not supported)/i) || '';
    const audioSupport = grab(/Audio(Output only|Input only|Input and output|Not supported)/i) || '';
    // const videoSupport = grab(/Video(Output only|Input only|Input and output|Not supported)/i) || '';

    if (textSupport.includes('input')) {
      modelData.capabilities.add('chat');
    }
    if (imageSupport.includes('input')) {
      modelData.capabilities.add('vision');
    }
    if (imageSupport.includes('output')) {
      modelData.capabilities.add('image');
    }
    if (audioSupport.includes('input')) {
      modelData.capabilities.add('hearing');
    }
    if (audioSupport.includes('output')) {
      modelData.capabilities.add('audio');
    }
    if (/Streaming\s*Supported/i.test(bodyText)) {
      modelData.capabilities.add('streaming');
    }
    if (/(Function|Tool) calling\s*Supported/i.test(bodyText)) {
      modelData.capabilities.add('tools');
    }
    if (/Structured outputs?\s*Supported/i.test(bodyText)) {
      modelData.capabilities.add('structured');
      modelData.capabilities.add('json');
    }
    if (modelData.reasoningTokenSupport) {
      modelData.capabilities.add('reasoning');
    }

    // Supported parameters
    const chatEndpoint = bodyHtml.includes('<div class="text-sm font-semibold">Chat Completions</div>');
    const imageEndpoint = bodyHtml.includes('<div class="text-sm font-semibold">Image generation</div>');
    const embeddingEndpoint = bodyHtml.includes('<div class="text-sm font-semibold">Embeddings</div>');
    const transcriptionEndpoint = bodyHtml.includes('<div class="text-sm font-semibold">Transcription</div>');
    const speechEndpoint = bodyHtml.includes('<div class="text-sm font-semibold">Speech generation</div>');

    if (chatEndpoint) {
      modelData.supportedParameters = modelData.supportedParameters || new Set<ModelParameter>();
      modelData.supportedParameters.add('maxTokens');
      modelData.supportedParameters.add('temperature');
      modelData.supportedParameters.add('topP');
      modelData.supportedParameters.add('frequencyPenalty');
      modelData.supportedParameters.add('presencePenalty');
      modelData.supportedParameters.add('logitBias');
      modelData.supportedParameters.add('logProbabilities');
      if (modelData.reasoningTokenSupport) {
        modelData.supportedParameters.add('reason');
      }
      if (modelData.capabilities.has('tools')) {
        modelData.supportedParameters.add('tools');
        modelData.supportedParameters.add('toolChoice');
      }
      if (modelData.capabilities.has('structured')) {
        modelData.supportedParameters.add('responseFormat');
        modelData.supportedParameters.add('structuredOutput');
      }
      if (modelData.capabilities.has('json')) {
        modelData.supportedParameters.add('responseFormat');
      }
      if (!modelId.includes('o3') && !modelId.includes('o4')) {
        modelData.supportedParameters.add('stop');
      }
    }
    if (imageEndpoint) {
      modelData.supportedParameters = modelData.supportedParameters || new Set<ModelParameter>();
      if (!modelId.startsWith('dall-e-3')) {
        modelData.supportedParameters.add('imageStyle');
        modelData.supportedParameters.add('imageMultiple');
      }
      if (modelId.startsWith('gpt-image-1')) {
        modelData.supportedParameters.add('imageBackground');
        modelData.supportedParameters.add('imageStream');
        modelData.supportedParameters.add('imageFormat');
      }
    }
    if (embeddingEndpoint) {
      modelData.supportedParameters = modelData.supportedParameters || new Set<ModelParameter>();
      if (modelId.startsWith('text-embedding-3')) {
        modelData.supportedParameters.add('embeddingDimensions');
      }
    }
    if (transcriptionEndpoint) {
      modelData.supportedParameters = modelData.supportedParameters || new Set<ModelParameter>();
      if (!modelId.startsWith('gpt-4o-transcribe-diarize')) {
        modelData.supportedParameters.add('transcribePrompt');
      }
      if (!modelId.startsWith('whisper-1')) {
        modelData.supportedParameters.add('transcribeStream');
      }
    }
    if (speechEndpoint) {
      modelData.supportedParameters = modelData.supportedParameters || new Set<ModelParameter>();
      if (!modelId.startsWith('tts-1')) {
        modelData.supportedParameters.add('speechInstructions');
      }
    }

    const hasCapabilitiesData = modelData.capabilities.size > 0;
    const populatedOverall = hasHeaderData || hasPricingData || hasCapabilitiesData;

    if (!modelData.supportedParameters || modelData.supportedParameters.size === 0) {
      await fs.writeFile(`./data/pages/openai-${modelId.replace(/[^a-z]/gi, '')}.html`, bodyHtml);
    }

    if (!populatedOverall) {
      console.log(`⚠ No model data found on page ${modelId}`);

      await fs.writeFile(`./data/pages/openai-${modelId.replace(/[^a-z]/gi, '')}.txt`, bodyText);

      return { modelId, data: null };
    }
    
    return {
      modelId,
      data: modelData,
    };
  } catch (error) {
    console.log(`  ✗ Error scraping ${modelId}:`, error instanceof Error ? error.message : error);
    return { modelId, data: null };
  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
}

/**
 * Scrape model details in parallel with concurrency control
 */
async function scrapeModelsParallel(
  modelIds: string[],
  concurrency: number = 5
): Promise<OpenAIModelData[]> {
  console.log(`\nScraping model details (concurrency: ${concurrency})...`);

  const browser = await puppeteer.launch({ headless: true });
  const results: OpenAIModelData[] = [];

  try {
    // Process in batches with concurrency control
    for (let i = 0; i < modelIds.length; i += concurrency) {
      const batch = modelIds.slice(i, i + concurrency);
      console.log(`  Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(modelIds.length / concurrency)} (${batch.length} models)...`);

      const batchResults = await Promise.all(
        batch.map((modelId) => scrapeModelDetails(modelId, browser))
      );

      // Store results
      for (const { data } of batchResults) {
        if (data) {
          results.push(data);
        }
      }

      console.log(`    ✓ Scraped ${batchResults.filter((r) => r.data).length}/${batch.length} models`);
    }

    console.log(`✓ Scraped ${results.length}/${modelIds.length} models\n`);
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Convert OpenAI model data to ModelInfo
 */
function convertOpenAIModel(data: OpenAIModelData): ModelInfo {
  const intelligenceScore = data.intelligence ? IntelligenceScoreMap[data.intelligence] || 0 : 0;
  const performanceScore = data.performance ? PerformanceScoreMap[data.performance] || 0 : 0;
  const reasoningScore = data.reasoning ? ReasoningScoreMap[data.reasoning] || 0 : 0;
  const nonZeros = (intelligenceScore ? 1 : 0) + (performanceScore ? 1 : 0) + (reasoningScore ? 1 : 0);
  const overall = nonZeros > 0 ? (intelligenceScore + performanceScore + reasoningScore) / nonZeros : 0;
  const speedScore = data.speed ? SpeedScoreMap[data.speed] || 0 : 0;

  const tier: ModelTier =
    overall >= 0.8
      ? 'flagship'
      : speedScore >= 80
        ? 'efficient'
        : 'legacy';

  return {
    provider: 'openai',
    id: data.id,
    name: data.name,
    capabilities: data.capabilities,
    supportedParameters: data.supportedParameters,
    tier,
    contextWindow: data.contextWindow || 0,
    maxOutputTokens: data.maxOutputTokens,
    pricing: {
      text: data.pricing.textTokens ? {
        input: data.pricing.textTokens?.input,
        output: data.pricing.textTokens?.output,
        cached: data.pricing.textTokens?.cached,
      } : undefined,
      audio: data.pricing.audioTokens ? {
        input: data.pricing.audioTokens?.input,
        output: data.pricing.audioTokens?.output,
      } : undefined,
      image: data.pricing.imageTokens ? {
        input: data.pricing.imageTokens?.input,
        output: data.pricing.imageTokens?.output,
      } : undefined,
      embeddings: data.pricing.embeddings ? {
        cost: data.pricing.embeddings?.cost,
      } : undefined,
    },
    metadata: {
      knowledgeCutoff: data.knowledgeCutoff,
      intelligence: data.intelligence,
      performance: data.performance,
      reasoning: data.reasoning,
      speed: data.speed,
    },
  };
}

/**
 * Main scraper function
 */
export async function scrapeOpenAI(
  outputDir: string,
  options: { concurrency?: number } = {}
): Promise<void> {
  const { concurrency = 5 } = options;

  console.log('\n=== OpenAI Scraper ===\n');

  // Scrape models list
  const modelIds = await scrapeModelsListPage();

  // Scrape details for each model in parallel
  const models = await scrapeModelsParallel(modelIds, concurrency);

  console.log(`✓ Scraped ${models.length} OpenAI models\n`);

  // Save raw data
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(
    path.join(outputDir, 'openai-models.json'),
    JSON.stringify({ data: models }, (key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }, 2)
  );
  console.log(`✓ Saved raw OpenAI models to openai-models.json`);

  // Convert to ModelInfo format
  const modelInfos = models.map(convertOpenAIModel);

  // Save JSON for reference
  await fs.writeFile(
    path.join(outputDir, 'openai-modelinfo.json'),
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
  await writeModelTS(modelInfos, 'openaiModels', path.join(srcDir, 'openai.ts'));
  console.log(`✓ Generated TypeScript file: src/models/openai.ts`);

  console.log('\n✓ OpenAI scraping complete\n');
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const outputDir = args.find((arg) => !arg.startsWith('--')) || path.join(__dirname, '../../data');

  const concurrencyArg = args.find((arg) => arg.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg.split('=')[1], 10)
    : 5;

  scrapeOpenAI(outputDir, { concurrency }).catch((error) => {
    console.error('✗ OpenAI scraping failed:', error);
    process.exit(1);
  });
}
