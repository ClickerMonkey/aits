/**
 * Update OpenAI Pricing in Static Models
 *
 * Updates pricing for OpenAI models in the static model files.
 * Pricing data is manually maintained from https://platform.openai.com/docs/pricing
 *
 * Run with: node scripts/update-openai-pricing.js
 */

const fs = require('fs');
const path = require('path');

/**
 * OpenAI Pricing Data
 * Source: https://platform.openai.com/docs/pricing (as of October 2025)
 * Prices are per 1M tokens
 */
const OPENAI_PRICING = {
  // GPT-5 Models
  'openai/gpt-5-pro': { input: 15, output: 120 },
  'openai/gpt-5': { input: 10, output: 10 },
  'openai/gpt-5-mini': { input: 2.5, output: 2 },
  'openai/gpt-5-image': { input: 10, output: 10 },
  'openai/gpt-5-image-mini': { input: 2.5, output: 2 },

  // o-series (reasoning models)
  'openai/o4': { input: 7.5, output: 30 },
  'openai/o4-mini': { input: 1.5, output: 6 },
  'openai/o3': { input: 10, output: 40 },
  'openai/o3-mini': { input: 1.1, output: 4.4 },
  'openai/o3-deep-research': { input: 10, output: 40 },
  'openai/o4-mini-deep-research': { input: 2, output: 8 },
  'openai/o1': { input: 15, output: 60 },
  'openai/o1-mini': { input: 3, output: 12 },
  'openai/o1-preview': { input: 15, output: 60 },

  // GPT-4 Models
  'openai/gpt-4': { input: 30, output: 60 },
  'openai/gpt-4-turbo': { input: 10, output: 30 },
  'openai/gpt-4-turbo-preview': { input: 10, output: 30 },
  'openai/gpt-4-vision-preview': { input: 10, output: 30 },
  'openai/gpt-4-32k': { input: 60, output: 120 },
  'openai/gpt-4o': { input: 2.5, output: 10 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-4o-2024-05-13': { input: 5, output: 15 },
  'openai/gpt-4o-2024-08-06': { input: 2.5, output: 10 },
  'openai/gpt-4o-2024-11-20': { input: 2.5, output: 10 },
  'openai/gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },

  // GPT-3.5 Models
  'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'openai/gpt-3.5-turbo-16k': { input: 3, output: 4 },
  'openai/gpt-3.5-turbo-instruct': { input: 1.5, output: 2 },
  'openai/gpt-3.5-turbo-0125': { input: 0.5, output: 1.5 },
  'openai/gpt-3.5-turbo-1106': { input: 1, output: 2 },

  // Image Models (special pricing - per image, not per token)
  // Note: DALL-E pricing is per image, not per token
  // Including here for reference but may need special handling
  'openai/dall-e-3': { input: 0, output: 0 }, // $0.04-0.12 per image
  'openai/dall-e-2': { input: 0, output: 0 }, // $0.016-0.020 per image

  // Embeddings (per 1M tokens)
  'openai/text-embedding-3-small': { input: 0.02, output: 0 },
  'openai/text-embedding-3-large': { input: 0.13, output: 0 },
  'openai/text-embedding-ada-002': { input: 0.1, output: 0 },

  // Audio Models
  'openai/whisper-1': { input: 0, output: 0 }, // $0.006 per minute
  'openai/tts-1': { input: 0, output: 0 }, // $15 per 1M characters
  'openai/tts-1-hd': { input: 0, output: 0 }, // $30 per 1M characters
};

/**
 * Model ID variations/aliases that map to the same pricing
 */
const MODEL_ALIASES = {
  'openai/chatgpt-4o-latest': 'openai/gpt-4o',
  'openai/gpt-4-turbo-2024-04-09': 'openai/gpt-4-turbo',
  'openai/gpt-4-0125-preview': 'openai/gpt-4-turbo',
  'openai/gpt-4-1106-preview': 'openai/gpt-4-turbo',
  'openai/gpt-4-0613': 'openai/gpt-4',
  'openai/gpt-4-32k-0613': 'openai/gpt-4-32k',
  'openai/gpt-3.5-turbo-0613': 'openai/gpt-3.5-turbo',
  'openai/gpt-3.5-turbo-16k-0613': 'openai/gpt-3.5-turbo-16k',
};

function getPricingForModel(modelId) {
  // Direct match
  if (OPENAI_PRICING[modelId]) {
    return OPENAI_PRICING[modelId];
  }

  // Check aliases
  if (MODEL_ALIASES[modelId]) {
    const canonicalId = MODEL_ALIASES[modelId];
    return OPENAI_PRICING[canonicalId];
  }

  // Pattern matching for versioned models
  for (const [knownId, pricing] of Object.entries(OPENAI_PRICING)) {
    if (modelId.startsWith(knownId)) {
      return pricing;
    }
  }

  return null;
}

function updateModelsFile(filePath) {
  console.log(`\nProcessing: ${filePath}`);

  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse the models array
  const modelsMatch = content.match(/export const OPENROUTER_MODELS: ModelInfo\[\] = (\[[\s\S]*?\n\]);/);

  if (!modelsMatch) {
    console.error('Could not find OPENROUTER_MODELS array');
    return { updated: 0, notFound: [], errors: [] };
  }

  const modelsJson = modelsMatch[1];
  let models;

  try {
    models = JSON.parse(modelsJson);
  } catch (error) {
    console.error('Failed to parse models JSON:', error.message);
    return { updated: 0, notFound: [], errors: ['Failed to parse JSON'] };
  }

  let updatedCount = 0;
  const notFound = [];
  const updated = [];

  // Update OpenAI models
  for (const model of models) {
    if (model.provider === 'openai') {
      const pricing = getPricingForModel(model.id);

      if (pricing) {
        const oldInput = model.pricing.inputTokensPer1M;
        const oldOutput = model.pricing.outputTokensPer1M;

        model.pricing.inputTokensPer1M = pricing.input;
        model.pricing.outputTokensPer1M = pricing.output;

        if (oldInput !== pricing.input || oldOutput !== pricing.output) {
          updatedCount++;
          updated.push({
            id: model.id,
            old: { input: oldInput, output: oldOutput },
            new: { input: pricing.input, output: pricing.output }
          });
        }
      } else {
        notFound.push(model.id);
      }
    }
  }

  // Regenerate the file content
  const timestamp = new Date().toISOString();
  const modelsString = JSON.stringify(models, null, 2);

  const newContent = content.replace(
    /export const OPENROUTER_MODELS: ModelInfo\[\] = \[[\s\S]*?\n\];/,
    `export const OPENROUTER_MODELS: ModelInfo[] = ${modelsString};`
  );

  // Update the timestamp comment
  const finalContent = newContent.replace(
    /Last updated: .*?\n/,
    `Last updated: ${timestamp}\n * OpenAI pricing updated: ${timestamp}\n`
  );

  // Write back
  fs.writeFileSync(filePath, finalContent);

  return { updated, notFound };
}

function main() {
  console.log('OpenAI Pricing Updater');
  console.log('======================\n');
  console.log('Pricing source: https://platform.openai.com/docs/pricing');
  console.log(`Total OpenAI pricing entries: ${Object.keys(OPENAI_PRICING).length}`);

  const packages = ['core', 'ai', 'openai'];
  const allUpdated = [];
  const allNotFound = new Set();

  for (const pkg of packages) {
    const filePath = path.join(__dirname, '..', 'packages', pkg, 'src', '__static__', 'openrouter-models.ts');

    if (!fs.existsSync(filePath)) {
      console.log(`\nSkipping ${pkg}: File not found`);
      continue;
    }

    const { updated, notFound } = updateModelsFile(filePath);

    if (updated.length > 0) {
      console.log(`  ✓ Updated ${updated.length} model(s)`);
      allUpdated.push(...updated);
    } else {
      console.log(`  ℹ No pricing changes detected`);
    }

    notFound.forEach(id => allNotFound.add(id));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  if (allUpdated.length > 0) {
    console.log(`\n✓ Updated pricing for ${allUpdated.length} model(s):\n`);
    allUpdated.forEach(({ id, old, new: newPricing }) => {
      console.log(`  ${id}`);
      console.log(`    Input:  $${old.input} → $${newPricing.input} per 1M tokens`);
      console.log(`    Output: $${old.output} → $${newPricing.output} per 1M tokens`);
    });
  } else {
    console.log('\n✓ All OpenAI model pricing is up to date');
  }

  if (allNotFound.size > 0) {
    console.log(`\n⚠ Could not find pricing for ${allNotFound.size} OpenAI model(s):\n`);
    Array.from(allNotFound).sort().forEach(id => {
      console.log(`  - ${id}`);
    });

    console.log('\nThese models may be:');
    console.log('  • Deprecated/removed models');
    console.log('  • Beta/preview models not yet in pricing docs');
    console.log('  • Models with different pricing structures');
    console.log('  • Aliases that need to be added to MODEL_ALIASES');
    console.log('\nTo add pricing for these models:');
    console.log('  1. Check https://platform.openai.com/docs/pricing');
    console.log('  2. Add entries to OPENAI_PRICING in this script');
    console.log('  3. Run: npm run update:openai-pricing');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done! Updated files in packages/*/src/__static__/');
  console.log('='.repeat(60) + '\n');
}

main();
