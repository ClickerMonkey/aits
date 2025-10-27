/**
 * Main Model Scraper
 *
 * Coordinates scraping from all sources: OpenAI, OpenRouter, and Replicate
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { scrapeOpenAI } from './scrapers/openai';
import { scrapeOpenRouter } from './scrapers/openrouter';
import { scrapeReplicate } from './scrapers/replicate';
import { generateModelsIndexTS, generateMainIndexTS } from './codegen';

interface ScraperOptions {
  outputDir?: string;
  cacheDir?: string;
  sources?: ('openai' | 'openrouter' | 'replicate')[];
  concurrency?: number;
  scrapeMetrics?: boolean;
}

/**
 * Run all model scrapers
 */
export async function scrapeAllModels(options: ScraperOptions = {}): Promise<void> {
  const outputDir = options.outputDir || path.join(__dirname, '../data');
  const cacheDir = options.cacheDir || path.join(__dirname, '../cache');
  const sources = options.sources || ['openai', 'openrouter', 'replicate'];
  const concurrency = options.concurrency || 5;
  const scrapeMetrics = options.scrapeMetrics || false;

  console.log('========================================');
  console.log('Model Information Scraper');
  console.log('========================================\n');
  console.log(`Output directory: ${outputDir}`);
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Sources: ${sources.join(', ')}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Scrape metrics: ${scrapeMetrics}\n`);

  // Create directories
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  // Track results
  const results: Record<string, { success: boolean; error?: string }> = {};

  // Scrape OpenRouter
  if (sources.includes('openrouter')) {
    try {
      await scrapeOpenRouter(outputDir, { metrics: scrapeMetrics, concurrency });
      results.openrouter = { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ OpenRouter scraping failed: ${message}\n`);
      results.openrouter = { success: false, error: message };
    }
  }

  // Scrape OpenAI
  if (sources.includes('openai')) {
    try {
      await scrapeOpenAI(outputDir, { concurrency });
      results.openai = { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ OpenAI scraping failed: ${message}\n`);
      results.openai = { success: false, error: message };
    }
  }

  // Scrape Replicate
  if (sources.includes('replicate')) {
    try {
      await scrapeReplicate(outputDir, cacheDir, { concurrency });
      results.replicate = { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ Replicate scraping failed: ${message}\n`);
      results.replicate = { success: false, error: message };
    }
  }

  // Summary
  console.log('========================================');
  console.log('Scraping Summary');
  console.log('========================================\n');

  for (const [source, result] of Object.entries(results)) {
    if (result.success) {
      console.log(`✓ ${source.padEnd(12)} Success`);
    } else {
      console.log(`✗ ${source.padEnd(12)} Failed: ${result.error}`);
    }
  }

  const successCount = Object.values(results).filter((r) => r.success).length;
  const totalCount = Object.keys(results).length;

  console.log(`\n${successCount}/${totalCount} sources completed successfully\n`);

  if (successCount === 0) {
    process.exit(1);
  }

  // Generate index files
  if (successCount > 0) {
    console.log('Generating index files...');

    const srcDir = path.join(__dirname, '../src');

    // Generate src/models/index.ts
    await fs.writeFile(
      path.join(srcDir, 'models/index.ts'),
      generateModelsIndexTS(),
      'utf-8'
    );
    console.log('✓ Generated src/models/index.ts');

    // Generate src/index.ts
    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      generateMainIndexTS(),
      'utf-8'
    );
    console.log('✓ Generated src/index.ts');

    console.log('\n✓ All files generated successfully\n');
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const outputDir = args.find((arg) => arg.startsWith('--output='))?.split('=')[1];
  const cacheDir = args.find((arg) => arg.startsWith('--cache='))?.split('=')[1];
  const sourcesArg = args.find((arg) => arg.startsWith('--sources='))?.split('=')[1];
  const sources = sourcesArg
    ? (sourcesArg.split(',') as ('openai' | 'openrouter' | 'replicate')[])
    : undefined;

  const concurrencyArg = args.find((arg) => arg.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg.split('=')[1], 10)
    : undefined;

  const scrapeMetrics = args.includes('--metrics');

  scrapeAllModels({
    outputDir,
    cacheDir,
    sources,
    concurrency,
    scrapeMetrics,
  }).catch((error) => {
    console.error('✗ Scraping failed:', error);
    process.exit(1);
  });
}
