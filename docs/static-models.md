# Static OpenRouter Models

This document describes the static model data source available in all AITS packages for testing and development purposes.

## Overview

Each package (`@aits/core`, `@aits/ai`, `@aits/openai`) includes a static snapshot of models available from OpenRouter. This provides:

- **Testing**: Use real model data in tests without API calls
- **Development**: Quick access to model information during development
- **Offline Work**: No network required to get model information
- **Pricing Reference**: Historical pricing data for cost estimation

## Location

Static model data is available at:
```typescript
import { OPENROUTER_MODELS, getModelsByProvider } from '@aits/ai/src/__static__/openrouter-models';
```

## Current Snapshot

- **Total Models**: 347
- **Unique Providers**: 55
- **Last Updated**: 2025-10-26
- **Source**: [OpenRouter API](https://openrouter.ai/api/v1/models)

### Model Distribution by Tier

- **Flagship**: 280 models (80.7%)
- **Efficient**: 53 models (15.3%)
- **Experimental**: 14 models (4.0%)
- **Legacy**: 0 models (0%)

### Top Providers

| Provider | Model Count |
|----------|-------------|
| openai | 48 |
| qwen | 47 |
| mistralai | 36 |
| google | 25 |
| meta-llama | 21 |
| deepseek | 19 |
| anthropic | 13 |
| nousresearch | 9 |
| microsoft | 9 |
| z-ai | 7 |

## Usage

### Basic Import

```typescript
import {
  OPENROUTER_MODELS,
  getModelsByProvider,
  getModelsByCapability,
  getModelsByTier,
  getModelById
} from '@aits/ai/src/__static__/openrouter-models';
```

### Get All Models

```typescript
const allModels = OPENROUTER_MODELS;
console.log(`Total models: ${allModels.length}`);
```

### Filter by Provider

```typescript
const openaiModels = getModelsByProvider('openai');
console.log(`OpenAI models: ${openaiModels.length}`);
```

### Filter by Capability

```typescript
const visionModels = getModelsByCapability('vision');
const imageGenModels = getModelsByCapability('image');
```

### Filter by Tier

```typescript
const efficientModels = getModelsByTier('efficient');
const flagshipModels = getModelsByTier('flagship');
```

### Get Specific Model

```typescript
const gpt4 = getModelById('openai/gpt-4');
if (gpt4) {
  console.log(`Context window: ${gpt4.contextWindow}`);
  console.log(`Input cost per 1M tokens: $${gpt4.pricing.inputTokensPer1M}`);
}
```

## Model Data Structure

```typescript
interface ModelInfo {
  id: string;                    // e.g., "openai/gpt-4"
  provider: string;              // e.g., "openai"
  name: string;                  // e.g., "OpenAI: GPT-4"
  capabilities: string[];        // e.g., ["chat", "vision", "streaming"]
  tier: 'flagship' | 'efficient' | 'experimental' | 'legacy';
  pricing: {
    inputTokensPer1M: number;    // Cost per 1M input tokens
    outputTokensPer1M: number;   // Cost per 1M output tokens
  };
  contextWindow: number;         // Maximum context length
  maxOutputTokens?: number;      // Maximum output tokens (if specified)
  modality?: string;             // e.g., "text+image->text"
}
```

## Capabilities

Models can have the following capabilities:

- **chat**: Text generation and conversation
- **streaming**: Supports streaming responses
- **json**: JSON mode/structured outputs
- **vision**: Can process images
- **image**: Can generate images
- **hearing**: Can process audio (STT)
- **audio**: Can generate audio (TTS)
- **embedding**: Can create text embeddings

## Tiers

Models are classified into tiers based on their names:

- **Flagship**: Top-tier models (default)
- **Efficient**: Cost-effective models (mini, small, haiku, efficient)
- **Experimental**: Preview/beta models (preview, experimental, alpha, beta)
- **Legacy**: Deprecated models

## Using in Tests

### Example: Mock Provider with Real Model Data

```typescript
import { getModelsByProvider } from '@aits/ai/src/__static__/openrouter-models';

const openaiModels = getModelsByProvider('openai');

const mockProvider = {
  name: 'openai',
  listModels: async () => openaiModels,
  // ... other methods
};
```

### Example: Test Model Selection

```typescript
import { getModelsByCapability, getModelsByTier } from '@aits/ai/src/__static__/openrouter-models';

test('should select efficient vision model', () => {
  const visionModels = getModelsByCapability('vision');
  const efficientModels = getModelsByTier('efficient');

  const efficientVisionModels = visionModels.filter(m =>
    efficientModels.some(e => e.id === m.id)
  );

  expect(efficientVisionModels.length).toBeGreaterThan(0);
});
```

## Updating Model Data

Model pricing and availability change over time. To update the static snapshot:

```bash
# From project root
npm run generate:models
```

This will:
1. Fetch the latest models from OpenRouter API
2. Parse and transform the data
3. Generate TypeScript files in all packages
4. Show a summary of changes

### When to Update

- **Monthly**: Keep pricing data current
- **After Major Releases**: When new models are announced
- **Before Testing**: Ensure tests use latest model data
- **Version Bumps**: Include in release process

## Implementation Details

### Generation Script

Location: `scripts/generate-static-models.js`

The script:
1. Reads from `openrouter-models.json` (API response)
2. Transforms each model with tier and capability detection
3. Generates TypeScript files with helper functions
4. Copies to all package `src/__static__` directories

### Capability Detection

Capabilities are detected from the model's modality string:

```javascript
// Examples:
"text->text"           → ["chat", "streaming", "json"]
"text+image->text"     → ["chat", "streaming", "json", "vision"]
"text->image"          → ["image"]
"audio->text"          → ["hearing"]
"text->audio"          → ["audio"]
"text->vector"         → ["embedding"]
```

### Tier Detection

Tiers are detected from model names:

```javascript
// Examples:
"gpt-4-mini"          → "efficient"
"claude-haiku"        → "efficient"
"gpt-5-preview"       → "experimental"
"model-legacy"        → "legacy"
"claude-3-opus"       → "flagship" (default)
```

## Benefits

### For Testing

- **No API Keys**: Test without real credentials
- **No Rate Limits**: Unlimited model queries
- **Deterministic**: Same data every test run
- **Fast**: No network latency
- **Offline**: Work without internet

### For Development

- **Type Safety**: Full TypeScript support
- **IntelliSense**: Auto-completion for model IDs
- **Cost Estimation**: Calculate request costs
- **Model Discovery**: Explore available models
- **Filtering**: Find models by requirements

### For Documentation

- **Examples**: Use real model data in docs
- **Pricing**: Show actual costs
- **Capabilities**: Demonstrate what's possible
- **Provider Info**: Show ecosystem breadth

## Limitations

- **Stale Data**: Pricing may change between updates
- **File Size**: ~135KB per package (acceptable for dev)
- **Not Real-Time**: Not a replacement for live API queries
- **OpenRouter Only**: Only includes OpenRouter models

## Contributing

To add models from other sources:

1. Create a fetcher script (e.g., `fetch-anthropic-models.js`)
2. Transform to the `ModelInfo` interface
3. Add to generation script
4. Update this documentation

## License

Model data is sourced from OpenRouter's public API. Usage subject to [OpenRouter's Terms](https://openrouter.ai/docs/terms).
