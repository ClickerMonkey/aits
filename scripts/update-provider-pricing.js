#!/usr/bin/env node

/**
 * Update Anthropic, Google, and xAI model pricing in static model sources
 *
 * This script updates pricing information for multiple providers in the
 * generated openrouter-models.ts files across all packages.
 *
 * Run with: npm run update:provider-pricing
 */

const fs = require('fs');
const path = require('path');

// Anthropic Claude pricing (per 1M tokens)
// Source: https://claude.com/pricing
const ANTHROPIC_PRICING = {
  // Current Models
  'anthropic/claude-opus-4.1': { input: 15, output: 75 },
  'anthropic/claude-opus-4': { input: 15, output: 75 },
  'anthropic/claude-sonnet-4.5': { input: 3, output: 15 }, // Base pricing (≤200K)
  'anthropic/claude-sonnet-4': { input: 3, output: 15 },
  'anthropic/claude-sonnet-3.7': { input: 3, output: 15 },
  'anthropic/claude-haiku-4.5': { input: 1, output: 5 },

  // Legacy Models
  'anthropic/claude-3-opus': { input: 15, output: 75 },
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
  'anthropic/claude-3-sonnet': { input: 3, output: 15 },
  'anthropic/claude-3.5-haiku': { input: 0.8, output: 4 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },

  // Versioned variants
  'anthropic/claude-opus-4.1:beta': { input: 15, output: 75 },
  'anthropic/claude-sonnet-4.5:beta': { input: 3, output: 15 },
  'anthropic/claude-haiku-4.5:beta': { input: 1, output: 5 },
  'anthropic/claude-3-opus-20240229': { input: 15, output: 75 },
  'anthropic/claude-3.5-sonnet-20241022': { input: 3, output: 15 },
  'anthropic/claude-3.5-sonnet-20240620': { input: 3, output: 15 },
  'anthropic/claude-3-sonnet-20240229': { input: 3, output: 15 },
  'anthropic/claude-3.5-haiku-20241022': { input: 0.8, output: 4 },
  'anthropic/claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

// Google Gemini pricing (per 1M tokens)
// Source: https://ai.google.dev/pricing
const GOOGLE_PRICING = {
  // Gemini 2.5 Models
  'google/gemini-2.5-pro': { input: 1.25, output: 10 }, // Base pricing (≤200K)
  'google/gemini-2.5-flash': { input: 0.3, output: 2.5 }, // Text/image/video pricing
  'google/gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },

  // Gemini 2.0 Models
  'google/gemini-2.0-flash': { input: 0.1, output: 0.4 }, // Text/image/video pricing
  'google/gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
  'google/gemini-2.0-flash-exp': { input: 0.1, output: 0.4 },

  // Gemini 1.5 Models (legacy)
  'google/gemini-pro-1.5': { input: 1.25, output: 10 },
  'google/gemini-flash-1.5': { input: 0.3, output: 2.5 },
  'google/gemini-1.5-pro': { input: 1.25, output: 10 },
  'google/gemini-1.5-flash': { input: 0.3, output: 2.5 },

  // Versioned variants
  'google/gemini-2.5-pro-exp': { input: 1.25, output: 10 },
  'google/gemini-2.0-flash-thinking-exp': { input: 0.1, output: 0.4 },
  'google/gemini-exp-1206': { input: 0.1, output: 0.4 },
};

// xAI Grok pricing (per 1M tokens)
// Source: https://docs.x.ai/docs/models + web search
const XAI_PRICING = {
  // Grok 4 Models
  'x-ai/grok-4': { input: 3, output: 15 },
  'x-ai/grok-4-fast': { input: 0.2, output: 0.5 },
  'x-ai/grok-4-fast-reasoning': { input: 0.2, output: 0.5 },
  'x-ai/grok-4-fast-non-reasoning': { input: 0.2, output: 0.5 },

  // Grok 3 Models
  'x-ai/grok-3': { input: 3, output: 15 },
  'x-ai/grok-3-mini': { input: 0.3, output: 0.5 },

  // Grok 2 Models (legacy)
  'x-ai/grok-2': { input: 3, output: 15 },
  'x-ai/grok-2-mini': { input: 0.3, output: 0.5 },

  // Versioned variants
  'x-ai/grok-beta': { input: 3, output: 15 },
  'x-ai/grok-vision-beta': { input: 3, output: 15 },
};

// Model aliases for variant matching
const MODEL_ALIASES = {
  // Anthropic aliases
  'anthropic/claude-opus-4.1:beta': 'anthropic/claude-opus-4.1',
  'anthropic/claude-sonnet-4.5:beta': 'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5:beta': 'anthropic/claude-haiku-4.5',

  // Google aliases
  'google/gemini-pro': 'google/gemini-2.5-pro',
  'google/gemini-flash': 'google/gemini-2.5-flash',

  // xAI aliases
  'x-ai/grok': 'x-ai/grok-4',
};

// Combined pricing map
const ALL_PRICING = {
  ...ANTHROPIC_PRICING,
  ...GOOGLE_PRICING,
  ...XAI_PRICING,
};

/**
 * Get pricing for a model, checking aliases and pattern matching
 */
function getPricingForModel(modelId) {
  // Direct match
  if (ALL_PRICING[modelId]) {
    return ALL_PRICING[modelId];
  }

  // Check aliases
  if (MODEL_ALIASES[modelId]) {
    const aliasedId = MODEL_ALIASES[modelId];
    if (ALL_PRICING[aliasedId]) {
      return ALL_PRICING[aliasedId];
    }
  }

  // Pattern matching: check if modelId starts with any known model ID
  for (const [knownId, pricing] of Object.entries(ALL_PRICING)) {
    if (modelId.startsWith(knownId)) {
      return pricing;
    }
  }

  return null;
}

/**
 * Update models in a single file
 */
function updateModelsFile(filePath) {
  console.log(`\nProcessing: ${filePath}`);

  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract the models array
  const modelsMatch = content.match(/export const OPENROUTER_MODELS: ModelInfo\[\] = (\[[\s\S]*?\n\]);/);
  if (!modelsMatch) {
    console.log('  ❌ Could not find OPENROUTER_MODELS array');
    return { updated: 0, notFound: [] };
  }

  let models;
  try {
    models = eval(modelsMatch[1]); // Safe here as we control the input
  } catch (e) {
    console.log('  ❌ Could not parse models array:', e.message);
    return { updated: 0, notFound: [] };
  }

  let updatedCount = 0;
  const notFound = [];
  const updated = [];

  // Check which providers we're updating
  const providers = new Set(['anthropic', 'google', 'x-ai']);

  for (const model of models) {
    if (providers.has(model.provider)) {
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
            oldInput,
            oldOutput,
            newInput: pricing.input,
            newOutput: pricing.output,
          });
        }
      } else {
        notFound.push(model.id);
      }
    }
  }

  if (updatedCount > 0) {
    // Regenerate the file content
    const modelsJson = JSON.stringify(models, null, 2);
    const newContent = content.replace(
      /export const OPENROUTER_MODELS: ModelInfo\[\] = \[[\s\S]*?\n\];/,
      `export const OPENROUTER_MODELS: ModelInfo[] = ${modelsJson};`
    );

    fs.writeFileSync(filePath, newContent);
    console.log(`  ✓ Updated ${updatedCount} model(s)`);
  } else {
    console.log(`  ℹ No updates needed`);
  }

  return { updated, notFound };
}

/**
 * Main execution
 */
function main() {
  console.log('Provider Pricing Updater');
  console.log('========================\n');
  console.log('Updating pricing for:');
  console.log('  • Anthropic Claude (https://claude.com/pricing)');
  console.log('  • Google Gemini (https://ai.google.dev/pricing)');
  console.log('  • xAI Grok (https://docs.x.ai/docs/models)');
  console.log(`\nTotal pricing entries: ${Object.keys(ALL_PRICING).length}`);
  console.log(`  - Anthropic: ${Object.keys(ANTHROPIC_PRICING).length}`);
  console.log(`  - Google: ${Object.keys(GOOGLE_PRICING).length}`);
  console.log(`  - xAI: ${Object.keys(XAI_PRICING).length}`);

  const packages = ['core', 'ai', 'openai'];
  const allUpdated = [];
  const allNotFound = new Set();

  for (const pkg of packages) {
    const filePath = path.join(__dirname, '..', 'packages', pkg, 'src', '__static__', 'openrouter-models.ts');

    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠ Skipping ${pkg}: File not found`);
      continue;
    }

    const result = updateModelsFile(filePath);
    allUpdated.push(...result.updated);
    result.notFound.forEach(id => allNotFound.add(id));
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  if (allUpdated.length > 0) {
    console.log(`\n✓ Updated pricing for ${allUpdated.length} model(s):\n`);

    for (const update of allUpdated) {
      console.log(`  ${update.id}`);
      console.log(`    Input:  $${update.oldInput} → $${update.newInput} per 1M tokens`);
      console.log(`    Output: $${update.oldOutput} → $${update.newOutput} per 1M tokens`);
    }
  }

  if (allNotFound.size > 0) {
    console.log(`\n⚠ Could not find pricing for ${allNotFound.size} model(s):\n`);

    Array.from(allNotFound).sort().forEach(id => {
      console.log(`  - ${id}`);
    });

    console.log('\nThese models may be:');
    console.log('  • Deprecated/removed models');
    console.log('  • Beta/preview models not yet in pricing docs');
    console.log('  • Models with different pricing structures');
    console.log('  • Aliases that need to be added to MODEL_ALIASES');
    console.log('\nTo add pricing for these models:');
    console.log('  1. Check the provider\'s pricing page');
    console.log('  2. Add entries to the appropriate PRICING map in this script');
    console.log('  3. Run: npm run update:provider-pricing');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done! Updated files in packages/*/src/__static__/');
  console.log('='.repeat(60));
}

main();
