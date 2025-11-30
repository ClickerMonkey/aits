import { ModelPricing } from '@aeye/ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ModelInfo {
  capabilities: string[];
  tier: string;
  pricing: any;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  metrics: {
    tokensPerSecond: number | null;
    timeToFirstToken: number | null;
    averageRequestDuration: number | null;
    accuracyScore: number | null;
  };
  tokenizer: string;
  supportedParameters: string[];
}

interface ResponseData {
  transformerImplementation: string;
  modelInfo: ModelInfo;
}

// Clean pricing object by removing null/undefined values and empty sub-objects
function cleanPricing(pricing: any): any {
  if (!pricing || typeof pricing !== 'object') return pricing;

  const cleaned: any = {};

  for (const [key, value] of Object.entries(pricing)) {
    if (value === null || value === undefined || value === 0) { // replicate doesn't have free models
      continue; // Skip null/undefined values
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleanedSubObj = cleanPricing(value);
      // Only include if the cleaned sub-object has properties
      if (Object.keys(cleanedSubObj).length > 0) {
        cleaned[key] = cleanedSubObj;
      }
    } else if (Array.isArray(value)) {
      // Keep arrays even if empty (they might be intentionally empty)
      cleaned[key] = value;
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

// Extract model name from transformer implementation
function extractModelName(transformerImpl: string): string | null {
  // Look for patterns like "owner/model" in the implementation
  const match = transformerImpl.match(/"([^"]+\/[^"]+)":/);
  return match ? match[1] : null;
}

async function processResponseFiles() {
  const cacheDir = path.join(__dirname, '..', 'cache', 'replicate');
  const dataFile = path.join(__dirname, '..', 'data', 'replicate-modelinfo.json');

  // Get all response.txt files
  const files = fs.readdirSync(cacheDir)
    .filter(f => f.endsWith('-response.txt'))
    .sort();

  console.log(`Found ${files.length} response files to process`);

  // Load the huge JSON file
  const dataContent = fs.readFileSync(dataFile, 'utf-8');
  let data: { id: string, pricing?: ModelPricing, [key: string]: unknown }[] = JSON.parse(dataContent);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const filePath = path.join(cacheDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    try {
      const responseData: ResponseData = JSON.parse(content);
      const modelName = extractModelName(responseData.transformerImplementation);

      if (!modelName) {
        console.log(`Skipping ${file}: Could not extract model name`);
        skippedCount++;
        continue;
      }

      // Check if model exists in the data
      const existingModelIndex = data.findIndex(m => m.id === modelName);
      if (existingModelIndex < 0) {
        console.log(`Skipping ${file}: Model "${modelName}" not found in data file`);
        skippedCount++;
        continue;
      }

      const existingModel = data[existingModelIndex];

      // Clean the pricing object
      const tokenizer = responseData.modelInfo.tokenizer || existingModel.tokenizer || '';
      const cleanedModelInfo = {
        ...existingModel,
        ...responseData.modelInfo,
        tokenizer: !tokenizer || tokenizer === 'null' ? undefined : tokenizer,
        contextWindow: responseData.modelInfo.contextWindow || existingModel.contextWindow || 0,
        maxOutputTokens: responseData.modelInfo.maxOutputTokens || existingModel.maxOutputTokens || undefined,
        pricing: cleanPricing(responseData.modelInfo.pricing || existingModel.pricing || {}),
        metrics: cleanPricing(responseData.modelInfo.metrics || existingModel.metrics || {}),
      };

      // Update the model info
      data[existingModelIndex] = cleanedModelInfo;
      updatedCount++;
      console.log(`Updated: ${modelName}`);

    } catch (error) {
      console.error(`Error processing ${file}:`, error);
      skippedCount++;
    }
  }

  // Write the updated data back
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');

  console.log('\n=== Summary ===');
  console.log(`Total files processed: ${files.length}`);
  console.log(`Successfully updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
}

processResponseFiles().catch(console.error);
