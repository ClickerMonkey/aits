/**
 * AWS Bedrock Model Scraper
 *
 * Fetches model information from AWS Bedrock using the AWS SDK
 */

import type { ModelCapability, ModelInfo, ModelTier } from '@aeye/ai';
import {
  BedrockClient,
  ListFoundationModelsCommand,
  type FoundationModelSummary,
} from '@aws-sdk/client-bedrock';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';
import { writeModelTS } from '../codegen';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Model pricing information (per million tokens)
 * Source: https://aws.amazon.com/bedrock/pricing/
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude 3.5 Sonnet
  'anthropic.claude-3-5-sonnet-20240620-v1:0': { input: 3, output: 15 },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': { input: 3, output: 15 },
  
  // Anthropic Claude 3 Opus
  'anthropic.claude-3-opus-20240229-v1:0': { input: 15, output: 75 },
  
  // Anthropic Claude 3 Sonnet
  'anthropic.claude-3-sonnet-20240229-v1:0': { input: 3, output: 15 },
  
  // Anthropic Claude 3 Haiku
  'anthropic.claude-3-haiku-20240307-v1:0': { input: 0.25, output: 1.25 },
  
  // Anthropic Claude 2.x
  'anthropic.claude-v2:1': { input: 8, output: 24 },
  'anthropic.claude-v2': { input: 8, output: 24 },
  'anthropic.claude-instant-v1': { input: 0.8, output: 2.4 },
  
  // Meta Llama 3.2
  'meta.llama3-2-1b-instruct-v1:0': { input: 0.1, output: 0.1 },
  'meta.llama3-2-3b-instruct-v1:0': { input: 0.15, output: 0.15 },
  'meta.llama3-2-11b-instruct-v1:0': { input: 0.35, output: 0.35 },
  'meta.llama3-2-90b-instruct-v1:0': { input: 2.65, output: 2.65 },
  
  // Meta Llama 3.1
  'meta.llama3-1-8b-instruct-v1:0': { input: 0.3, output: 0.6 },
  'meta.llama3-1-70b-instruct-v1:0': { input: 2.65, output: 3.5 },
  'meta.llama3-1-405b-instruct-v1:0': { input: 5.32, output: 16 },
  
  // Meta Llama 3
  'meta.llama3-8b-instruct-v1:0': { input: 0.3, output: 0.6 },
  'meta.llama3-70b-instruct-v1:0': { input: 2.65, output: 3.5 },
  
  // Meta Llama 2
  'meta.llama2-13b-chat-v1': { input: 0.75, output: 1 },
  'meta.llama2-70b-chat-v1': { input: 1.95, output: 2.56 },
  
  // Mistral AI
  'mistral.mistral-7b-instruct-v0:2': { input: 0.15, output: 0.2 },
  'mistral.mixtral-8x7b-instruct-v0:1': { input: 0.45, output: 0.7 },
  'mistral.mistral-large-2402-v1:0': { input: 4, output: 12 },
  'mistral.mistral-large-2407-v1:0': { input: 3, output: 9 },
  
  // Cohere
  'cohere.command-text-v14': { input: 1.5, output: 2 },
  'cohere.command-light-text-v14': { input: 0.3, output: 0.6 },
  'cohere.command-r-v1:0': { input: 0.5, output: 1.5 },
  'cohere.command-r-plus-v1:0': { input: 3, output: 15 },
  
  // Amazon Titan Text
  'amazon.titan-text-lite-v1': { input: 0.15, output: 0.2 },
  'amazon.titan-text-express-v1': { input: 0.2, output: 0.6 },
  'amazon.titan-text-premier-v1:0': { input: 0.5, output: 1.5 },
};

/**
 * Model context window information (in tokens)
 * Source: AWS Bedrock documentation
 */
const MODEL_CONTEXT_WINDOWS: Record<string, { context: number; maxOutput?: number }> = {
  // Anthropic Claude 3.5 Sonnet
  'anthropic.claude-3-5-sonnet-20240620-v1:0': { context: 200000, maxOutput: 8192 },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': { context: 200000, maxOutput: 8192 },
  
  // Anthropic Claude 3 Opus
  'anthropic.claude-3-opus-20240229-v1:0': { context: 200000, maxOutput: 4096 },
  
  // Anthropic Claude 3 Sonnet
  'anthropic.claude-3-sonnet-20240229-v1:0': { context: 200000, maxOutput: 4096 },
  
  // Anthropic Claude 3 Haiku
  'anthropic.claude-3-haiku-20240307-v1:0': { context: 200000, maxOutput: 4096 },
  
  // Anthropic Claude 2.x
  'anthropic.claude-v2:1': { context: 100000, maxOutput: 4096 },
  'anthropic.claude-v2': { context: 100000, maxOutput: 4096 },
  'anthropic.claude-instant-v1': { context: 100000, maxOutput: 4096 },
  
  // Meta Llama 3.2
  'meta.llama3-2-1b-instruct-v1:0': { context: 128000, maxOutput: 2048 },
  'meta.llama3-2-3b-instruct-v1:0': { context: 128000, maxOutput: 2048 },
  'meta.llama3-2-11b-instruct-v1:0': { context: 128000, maxOutput: 2048 },
  'meta.llama3-2-90b-instruct-v1:0': { context: 128000, maxOutput: 2048 },
  
  // Meta Llama 3.1
  'meta.llama3-1-8b-instruct-v1:0': { context: 128000, maxOutput: 2048 },
  'meta.llama3-1-70b-instruct-v1:0': { context: 128000, maxOutput: 2048 },
  'meta.llama3-1-405b-instruct-v1:0': { context: 128000, maxOutput: 4096 },
  
  // Meta Llama 3
  'meta.llama3-8b-instruct-v1:0': { context: 8192, maxOutput: 2048 },
  'meta.llama3-70b-instruct-v1:0': { context: 8192, maxOutput: 2048 },
  
  // Meta Llama 2
  'meta.llama2-13b-chat-v1': { context: 4096, maxOutput: 2048 },
  'meta.llama2-70b-chat-v1': { context: 4096, maxOutput: 2048 },
  
  // Mistral AI
  'mistral.mistral-7b-instruct-v0:2': { context: 32000, maxOutput: 8192 },
  'mistral.mixtral-8x7b-instruct-v0:1': { context: 32000, maxOutput: 8192 },
  'mistral.mistral-large-2402-v1:0': { context: 32000, maxOutput: 8192 },
  'mistral.mistral-large-2407-v1:0': { context: 128000, maxOutput: 8192 },
  
  // Cohere
  'cohere.command-text-v14': { context: 4096, maxOutput: 4096 },
  'cohere.command-light-text-v14': { context: 4096, maxOutput: 4096 },
  'cohere.command-r-v1:0': { context: 128000, maxOutput: 4096 },
  'cohere.command-r-plus-v1:0': { context: 128000, maxOutput: 4096 },
  
  // Amazon Titan Text
  'amazon.titan-text-lite-v1': { context: 4096, maxOutput: 4096 },
  'amazon.titan-text-express-v1': { context: 8192, maxOutput: 8192 },
  'amazon.titan-text-premier-v1:0': { context: 32000, maxOutput: 3072 },
};

/**
 * Detect model family from model ID
 */
function detectModelFamily(modelId: string): string {
  if (modelId.startsWith('anthropic.')) return 'anthropic';
  if (modelId.startsWith('meta.')) return 'meta';
  if (modelId.startsWith('mistral.')) return 'mistral';
  if (modelId.startsWith('cohere.')) return 'cohere';
  if (modelId.startsWith('ai21.')) return 'ai21';
  if (modelId.startsWith('amazon.')) return 'amazon';
  if (modelId.startsWith('stability.')) return 'stability';
  return 'unknown';
}

/**
 * Detect capabilities from model information
 */
function detectCapabilities(model: FoundationModelSummary): Set<ModelCapability> {
  const capabilities = new Set<ModelCapability>();
  const modelId = model.modelId || '';
  const family = detectModelFamily(modelId);

  // Check for chat capability (text-to-text models)
  if (
    model.inputModalities?.includes('TEXT') &&
    model.outputModalities?.includes('TEXT')
  ) {
    // Chat models
    if (
      family === 'anthropic' ||
      family === 'meta' ||
      family === 'mistral' ||
      family === 'cohere' ||
      family === 'ai21' ||
      (family === 'amazon' && modelId.includes('text'))
    ) {
      capabilities.add('chat');
      
      // Streaming support
      if (model.responseStreamingSupported) {
        capabilities.add('streaming');
      }
    }
  }

  // Image generation
  if (
    model.inputModalities?.includes('TEXT') &&
    model.outputModalities?.includes('IMAGE')
  ) {
    capabilities.add('image');
  }

  // Vision (image understanding)
  if (
    model.inputModalities?.includes('IMAGE') &&
    model.outputModalities?.includes('TEXT')
  ) {
    capabilities.add('vision');
  }

  // Embeddings
  if (family === 'amazon' && modelId.includes('embed')) {
    capabilities.add('embedding');
  }
  if (family === 'cohere' && modelId.includes('embed')) {
    capabilities.add('embedding');
  }

  // Tool calling for supported models
  if (family === 'anthropic' && modelId.includes('claude-3')) {
    capabilities.add('tools');
  }

  return capabilities;
}

/**
 * Convert AWS Bedrock model to ModelInfo format
 */
function convertAWSModel(model: FoundationModelSummary): ModelInfo | null {
  const modelId = model.modelId;
  if (!modelId) return null;

  const family = detectModelFamily(modelId);
  const capabilities = detectCapabilities(model);
  
  // Determine tier based on model family and name
  let tier: ModelTier = 'efficient';
  if (family === 'anthropic' && modelId.includes('opus')) {
    tier = 'flagship';
  } else if (family === 'anthropic' && modelId.includes('sonnet')) {
    tier = 'efficient';
  } else if (family === 'anthropic' && modelId.includes('haiku')) {
    tier = 'efficient';
  } else if (family === 'meta' && (modelId.includes('405b') || modelId.includes('90b'))) {
    tier = 'flagship';
  } else if (family === 'meta' && (modelId.includes('70b') || modelId.includes('13b'))) {
    tier = 'efficient';
  } else if (family === 'meta' && (modelId.includes('8b') || modelId.includes('7b') || modelId.includes('3b') || modelId.includes('1b'))) {
    tier = 'efficient';
  } else if (family === 'mistral' && modelId.includes('large')) {
    tier = 'flagship';
  } else if (family === 'mistral' && modelId.includes('mixtral')) {
    tier = 'efficient';
  } else if (family === 'mistral' && modelId.includes('7b')) {
    tier = 'efficient';
  } else if (family === 'cohere' && modelId.includes('plus')) {
    tier = 'flagship';
  } else {
    tier = 'efficient';
  }

  // Get pricing information
  const pricing = MODEL_PRICING[modelId];
  const contextInfo = MODEL_CONTEXT_WINDOWS[modelId];

  return {
    provider: 'aws',
    id: modelId,
    name: model.modelName || modelId,
    capabilities,
    tier,
    pricing: pricing ? {
      text: {
        input: pricing.input,
        output: pricing.output,
      },
    } : {},
    contextWindow: contextInfo?.context || 0,
    maxOutputTokens: contextInfo?.maxOutput,
    metadata: {
      modelArn: model.modelArn,
      providerName: model.providerName,
      responseStreamingSupported: model.responseStreamingSupported,
      customizationsSupported: model.customizationsSupported,
      inferenceTypesSupported: model.inferenceTypesSupported,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
    },
  };
}

/**
 * Main scraper function
 */
export async function scrapeAWS(
  outputDir: string,
  options: { region?: string } = {}
): Promise<void> {
  const { region = process.env.AWS_REGION || 'us-east-1' } = options;

  console.log('\n=== AWS Bedrock Scraper ===\n');
  console.log(`Using region: ${region}`);

  // Create Bedrock client
  const client = new BedrockClient({
    region,
    // Credentials are automatically picked up from environment
  });

  try {
    // List foundation models
    console.log('Fetching models from AWS Bedrock...');
    const command = new ListFoundationModelsCommand({});
    const response = await client.send(command);

    if (!response.modelSummaries) {
      console.log('✗ No models returned from AWS Bedrock');
      return;
    }

    console.log(`✓ Fetched ${response.modelSummaries.length} AWS Bedrock models`);

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Save raw data
    await fs.writeFile(
      path.join(outputDir, 'aws-models.json'),
      JSON.stringify({ data: response.modelSummaries }, (key, value) => {
        if (value instanceof Set) {
          return Array.from(value);
        }
        return value;
      }, 2)
    );
    console.log(`✓ Saved raw AWS models to aws-models.json`);

    // Convert to ModelInfo format
    const modelInfos = response.modelSummaries
      .map(convertAWSModel)
      .filter((m): m is ModelInfo => m !== null);

    // Save JSON for reference
    await fs.writeFile(
      path.join(outputDir, 'aws-modelinfo.json'),
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
    await writeModelTS(modelInfos, 'awsModels', path.join(srcDir, 'aws.ts'));
    console.log(`✓ Generated TypeScript file: src/models/aws.ts`);

    console.log('\n✓ AWS Bedrock scraping complete\n');
  } catch (error) {
    console.error('✗ AWS Bedrock scraping failed:', error);
    throw error;
  }
}

// CLI execution
if (process.argv[1].endsWith('aws.ts')) {
  const args = process.argv.slice(2);
  const outputDir = args.find((arg) => !arg.startsWith('--')) || path.join(__dirname, '../../data');
  const regionArg = args.find((arg) => arg.startsWith('--region='));
  const region = regionArg ? regionArg.split('=')[1] : undefined;

  scrapeAWS(outputDir, { region }).catch((error) => {
    console.error('✗ AWS Bedrock scraping failed:', error);
    process.exit(1);
  });
}
