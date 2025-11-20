/**
 * AWS Bedrock Model Scraper
 *
 * Fetches model information from AWS Bedrock using the AWS SDK
 */

import type { ModelInfo } from '@aeye/ai';
import { convertAWSModel } from '@aeye/aws';
import {
  BedrockClient,
  ListFoundationModelsCommand,
} from '@aws-sdk/client-bedrock';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';
import { writeModelTS } from '../codegen';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main scraper function
 */
export async function scrapeAWS(
  outputDir: string,
  options: { region?: string } = {}
): Promise<void> {
  const { region = process.env.AWS_REGION || 'us-east-2' } = options;

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
