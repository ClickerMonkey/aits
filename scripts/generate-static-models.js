/**
 * Generate Static Model Sources from OpenRouter API
 *
 * Fetches models from OpenRouter and generates TypeScript files with static model data
 * for testing and development use.
 */

const fs = require('fs');
const path = require('path');

function detectTier(model) {
  const name = model.name.toLowerCase();

  if (name.includes('mini') || name.includes('small') || name.includes('haiku') || name.includes('efficient')) {
    return 'efficient';
  }

  if (name.includes('preview') || name.includes('experimental') || name.includes('alpha') || name.includes('beta')) {
    return 'experimental';
  }

  if (name.includes('legacy')) {
    return 'legacy';
  }

  return 'flagship';
}

function detectCapabilities(model) {
  const capabilities = new Set();
  const modality = model.architecture.modality.toLowerCase();

  // Text capabilities
  if (modality.includes('text')) {
    capabilities.add('chat');
    capabilities.add('streaming');
    capabilities.add('json');
  }

  // Vision
  if (modality.includes('image') && modality.includes('->text')) {
    capabilities.add('vision');
  }

  // Image generation
  if (modality.includes('->image')) {
    capabilities.add('image');
  }

  // Audio capabilities
  if (modality.includes('audio')) {
    if (modality.includes('audio->text')) {
      capabilities.add('hearing');
    }
    if (modality.includes('->audio')) {
      capabilities.add('audio');
    }
  }

  // Embedding
  if (modality.includes('embedding') || modality.includes('vector')) {
    capabilities.add('embedding');
  }

  return Array.from(capabilities);
}

function transformModel(model) {
  const provider = model.id.split('/')[0];

  return {
    id: model.id,
    provider,
    name: model.name,
    capabilities: detectCapabilities(model),
    tier: detectTier(model),
    pricing: {
      inputTokensPer1M: parseFloat(model.pricing.prompt) * 1_000_000,
      outputTokensPer1M: parseFloat(model.pricing.completion) * 1_000_000,
    },
    contextWindow: model.context_length,
    maxOutputTokens: model.top_provider.max_completion_tokens || undefined,
    modality: model.architecture.modality,
  };
}

async function main() {
  console.log('Reading OpenRouter models from file...');

  const jsonPath = path.join(__dirname, '..', 'openrouter-models.json');
  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(rawData);

  console.log(`Found ${data.data.length} models`);

  // Transform models
  const models = data.data.map(transformModel);

  // Generate TypeScript file
  const timestamp = new Date().toISOString();
  const content = `/**
 * Static OpenRouter Models
 *
 * Generated from OpenRouter API on ${timestamp}
 * Source: https://openrouter.ai/api/v1/models
 *
 * This file contains static model data for testing and development.
 * Pricing may change - regenerate periodically with:
 * \`npm run generate:models\`
 */

export interface ModelCapability {
  chat?: boolean;
  streaming?: boolean;
  json?: boolean;
  vision?: boolean;
  image?: boolean;
  hearing?: boolean;
  audio?: boolean;
  embedding?: boolean;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  capabilities: string[];
  tier: 'flagship' | 'efficient' | 'experimental' | 'legacy';
  pricing: {
    inputTokensPer1M: number;
    outputTokensPer1M: number;
  };
  contextWindow: number;
  maxOutputTokens?: number;
  modality?: string;
}

/**
 * Static models from OpenRouter
 * Total models: ${models.length}
 * Last updated: ${timestamp}
 */
export const OPENROUTER_MODELS: ModelInfo[] = ${JSON.stringify(models, null, 2)};

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: string): ModelInfo[] {
  return OPENROUTER_MODELS.filter(m => m.provider === provider);
}

/**
 * Get models by capability
 */
export function getModelsByCapability(capability: string): ModelInfo[] {
  return OPENROUTER_MODELS.filter(m => m.capabilities.includes(capability));
}

/**
 * Get models by tier
 */
export function getModelsByTier(tier: 'flagship' | 'efficient' | 'experimental' | 'legacy'): ModelInfo[] {
  return OPENROUTER_MODELS.filter(m => m.tier === tier);
}

/**
 * Get model by ID
 */
export function getModelById(id: string): ModelInfo | undefined {
  return OPENROUTER_MODELS.find(m => m.id === id);
}
`;

  // Save to packages
  const packages = ['core', 'ai', 'openai'];

  for (const pkg of packages) {
    const targetPath = path.join(__dirname, '..', 'packages', pkg, 'src', '__static__');

    // Create directory if it doesn't exist
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    const filePath = path.join(targetPath, 'openrouter-models.ts');
    fs.writeFileSync(filePath, content);

    console.log(`✓ Generated ${filePath}`);
  }

  // Generate summary
  const providers = new Set(models.map(m => m.provider));
  const byTier = {
    flagship: models.filter(m => m.tier === 'flagship').length,
    efficient: models.filter(m => m.tier === 'efficient').length,
    experimental: models.filter(m => m.tier === 'experimental').length,
    legacy: models.filter(m => m.tier === 'legacy').length,
  };

  console.log('\nSummary:');
  console.log(`  Total models: ${models.length}`);
  console.log(`  Unique providers: ${providers.size}`);
  console.log(`  By tier:`);
  console.log(`    Flagship: ${byTier.flagship}`);
  console.log(`    Efficient: ${byTier.efficient}`);
  console.log(`    Experimental: ${byTier.experimental}`);
  console.log(`    Legacy: ${byTier.legacy}`);

  console.log('\nTop 10 providers by model count:');
  const providerCounts = Array.from(providers).map(p => ({
    provider: p,
    count: models.filter(m => m.provider === p).length
  })).sort((a, b) => b.count - a.count).slice(0, 10);

  providerCounts.forEach(({ provider, count }) => {
    console.log(`    ${provider}: ${count}`);
  });

  console.log('\nDone! Files generated in packages/*/src/__static__/openrouter-models.ts');
}

main().catch(console.error);
