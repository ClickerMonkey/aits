# AWS Bedrock Model Scraper

## Overview

The AWS Bedrock model scraper fetches model information from AWS Bedrock using the AWS SDK's `ListFoundationModelsCommand`. It converts the AWS model data to the standardized `ModelInfo` format used by the @aits framework.

## Features

- **Automatic Model Discovery**: Uses AWS Bedrock API to list all available foundation models
- **Comprehensive Pricing**: Includes pricing information for all major AWS Bedrock models
- **Context Window Data**: Provides context window and max output token information
- **Capability Detection**: Automatically detects model capabilities based on modalities and model families
- **Tier Classification**: Classifies models into appropriate tiers (flagship, efficient, legacy, experimental)

## Prerequisites

### AWS Credentials

The scraper uses the AWS SDK v3 credential chain to automatically discover credentials:

1. **Environment variables** - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
2. **Shared credentials file** - `~/.aws/credentials`
3. **IAM roles** - When running on EC2, ECS, Lambda, etc.

### AWS Bedrock Access

Ensure you have:
1. Access to AWS Bedrock in your target region
2. Permissions to invoke `bedrock:ListFoundationModels`
3. Model access enabled in the AWS Bedrock console (if you want to use specific models)

## Usage

### Run the AWS scraper alone

```bash
# Using default region (us-east-1 or AWS_REGION env var)
npm run scrape:aws

# Specify a custom region
npm run scrape:aws -- --region=us-west-2

# Specify custom output directory
npm run scrape:aws path/to/output --region=eu-west-1
```

### Run all scrapers including AWS

```bash
# Run all scrapers (OpenAI, OpenRouter, Replicate, AWS)
npm run scrape

# Run only specific scrapers
npm run scrape -- --sources=aws,openai

# Run with custom AWS region
npm run scrape -- --aws-region=us-west-2
```

## Output

The scraper generates the following files:

1. **`data/aws-models.json`** - Raw AWS Bedrock model data from the API
2. **`data/aws-modelinfo.json`** - Converted model data in ModelInfo format
3. **`src/models/aws.ts`** - TypeScript file with model definitions
4. **`src/models/index.ts`** - Updated to include AWS models
5. **`src/index.ts`** - Updated to export AWS models

## Supported Models

The scraper automatically detects and includes:

### Chat Models
- **Anthropic Claude** - Claude 3.5 Sonnet, Claude 3 (Opus, Sonnet, Haiku), Claude 2.x
- **Meta Llama** - Llama 3.2, Llama 3.1, Llama 3, Llama 2
- **Mistral AI** - Mistral 7B, Mixtral 8x7B, Mistral Large
- **Cohere** - Command, Command Light, Command R, Command R+
- **AI21 Labs** - Jurassic-2 models
- **Amazon Titan** - Titan Text models

### Image Models
- **Stability AI** - Stable Diffusion XL, Stable Diffusion 3
- **Amazon Titan** - Titan Image Generator

### Embedding Models
- **Amazon Titan** - Titan Text Embeddings v1 and v2
- **Cohere** - Cohere Embed models

## Pricing Data

The scraper includes hardcoded pricing data (per million tokens) from AWS Bedrock pricing documentation. This data is maintained manually and should be updated periodically to reflect current AWS pricing.

To update pricing:
1. Visit https://aws.amazon.com/bedrock/pricing/
2. Update the `MODEL_PRICING` constant in `scripts/scrapers/aws.ts`

## Context Window Data

Context window and max output token information is also hardcoded based on AWS documentation. To update:
1. Check model documentation at https://docs.aws.amazon.com/bedrock/
2. Update the `MODEL_CONTEXT_WINDOWS` constant in `scripts/scrapers/aws.ts`

## Model Capabilities

The scraper automatically detects capabilities based on:
- **Input/Output Modalities**: TEXT, IMAGE, AUDIO
- **Model Family**: anthropic, meta, mistral, cohere, amazon, stability
- **Streaming Support**: From AWS API response

Detected capabilities include:
- `chat` - Text-to-text models
- `streaming` - Models that support streaming responses
- `image` - Image generation models
- `vision` - Image understanding models
- `embedding` - Embedding models
- `tools` - Models that support function/tool calling

## Example Output

```typescript
{
  provider: 'aws',
  id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  name: 'Claude 3.5 Sonnet v2',
  capabilities: new Set(['chat', 'streaming', 'tools']),
  tier: 'efficient',
  pricing: {
    text: {
      input: 3,
      output: 15,
    },
  },
  contextWindow: 200000,
  maxOutputTokens: 8192,
  metadata: {
    modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0',
    providerName: 'Anthropic',
    responseStreamingSupported: true,
    inputModalities: ['TEXT', 'IMAGE'],
    outputModalities: ['TEXT'],
  },
}
```

## Troubleshooting

### "No credentials found"
- Ensure AWS credentials are configured via environment variables or ~/.aws/credentials
- Run `aws configure` to set up credentials

### "Access Denied"
- Verify your AWS credentials have `bedrock:ListFoundationModels` permission
- Add the following IAM policy:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "bedrock:ListFoundationModels",
        "Resource": "*"
      }
    ]
  }
  ```

### "Model access not available"
- Some models require explicit access to be enabled in the AWS Bedrock console
- The scraper will list all models available in your region, but you may need to request access to use them

### "No models returned"
- Check if AWS Bedrock is available in your selected region
- Try a different region (e.g., us-east-1, us-west-2, eu-west-1)
- Verify your AWS account has access to Bedrock

## Integration

The generated AWS models are automatically integrated into the @aits framework:

```typescript
import { awsModels } from '@aits/models';

// Get all AWS models
console.log(`Found ${awsModels.length} AWS Bedrock models`);

// Filter by capability
const chatModels = awsModels.filter(m => m.capabilities.has('chat'));
const imageModels = awsModels.filter(m => m.capabilities.has('image'));
const embeddingModels = awsModels.filter(m => m.capabilities.has('embedding'));
```

## Maintenance

The AWS scraper requires periodic maintenance to:
1. Update pricing information when AWS changes pricing
2. Update context window limits when new model versions are released
3. Add new model families or update capability detection logic

Check the AWS Bedrock documentation regularly for updates:
- Pricing: https://aws.amazon.com/bedrock/pricing/
- Model IDs: https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
- Release Notes: https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html
