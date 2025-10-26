/**
 * Multi-Provider Integration Tests
 *
 * Tests that verify multiple providers work together correctly through the AI class.
 * These tests make REAL API calls and require API keys in environment.
 */

import { AI } from '@aits/ai';
import { OpenAIProvider } from '@aits/openai';
import { OpenRouterProvider } from '@aits/openrouter';
import { XAIProvider } from '@aits/xai';
import { getAPIKey, requireMinimumProviders, getAvailableProviders } from '../setup';

const describeMultiProvider = requireMinimumProviders(2);

describeMultiProvider('Multi-Provider Integration', () => {
  let ai: AI;
  let availableProviders: string[];

  beforeAll(async () => {
    availableProviders = getAvailableProviders();
    console.log(`Testing with providers: ${availableProviders.join(', ')}`);

    const providers: any = {};

    if (availableProviders.includes('openai')) {
      providers.openai = new OpenAIProvider({
        apiKey: getAPIKey('openai')
      });
    }

    if (availableProviders.includes('openrouter')) {
      providers.openrouter = new OpenRouterProvider({
        apiKey: getAPIKey('openrouter')
      });
    }

    if (availableProviders.includes('xai')) {
      providers.xai = new XAIProvider({
        apiKey: getAPIKey('xai')
      });
    }

    ai = new AI({ providers });
    await ai.models.refresh();
  });

  describe('Model Discovery', () => {
    it('should have models from all configured providers', () => {
      const models = ai.models.listModels();

      expect(models.length).toBeGreaterThan(0);

      for (const provider of availableProviders) {
        const providerModels = models.filter(m => m.provider === provider);
        expect(providerModels.length).toBeGreaterThan(0);
        console.log(`  ${provider}: ${providerModels.length} models`);
      }
    });

    it('should list models with chat capability', () => {
      const chatModels = ai.models.searchModels({
        required: ['chat']
      });

      expect(chatModels.length).toBeGreaterThan(0);
      console.log(`  Found ${chatModels.length} chat models across all providers`);

      // Verify models from multiple providers
      const providers = new Set(chatModels.map(m => m.model.provider));
      expect(providers.size).toBeGreaterThan(1);
    });
  });

  describe('Model Selection', () => {
    it('should select cheapest model across all providers', () => {
      const selected = ai.models.selectModel({
        required: ['chat'],
        weights: {
          cost: 1.0,
          speed: 0,
          accuracy: 0
        }
      });

      expect(selected).toBeDefined();
      expect(selected!.model.capabilities.has('chat')).toBe(true);

      console.log(`  Cheapest: ${selected!.model.id} from ${selected!.model.provider}`);
      console.log(`  Cost: $${selected!.model.pricing.inputTokensPer1M}/M input, $${selected!.model.pricing.outputTokensPer1M}/M output`);
    });

    it('should select most accurate model when accuracy weighted', () => {
      const selected = ai.models.selectModel({
        required: ['chat'],
        weights: {
          cost: 0,
          speed: 0,
          accuracy: 1.0
        }
      });

      expect(selected).toBeDefined();
      expect(selected!.model.tier).toBe('flagship');

      console.log(`  Most accurate: ${selected!.model.id} from ${selected!.model.provider}`);
    });

    it('should respect provider allowlist', () => {
      const firstProvider = availableProviders[0];

      const selected = ai.models.selectModel({
        required: ['chat'],
        providers: {
          allow: [firstProvider]
        }
      });

      expect(selected).toBeDefined();
      expect(selected!.model.provider).toBe(firstProvider);

      console.log(`  Selected from ${firstProvider}: ${selected!.model.id}`);
    });

    it('should respect provider denylist', () => {
      if (availableProviders.length < 2) {
        return; // Skip if only one provider
      }

      const firstProvider = availableProviders[0];

      const selected = ai.models.selectModel({
        required: ['chat'],
        providers: {
          deny: [firstProvider]
        }
      });

      expect(selected).toBeDefined();
      expect(selected!.model.provider).not.toBe(firstProvider);

      console.log(`  Selected (excluding ${firstProvider}): ${selected!.model.id} from ${selected!.model.provider}`);
    });
  });

  describe('Cross-Provider Chat Execution', () => {
    it('should execute chat on all available providers', async () => {
      const results: Record<string, string> = {};

      for (const provider of availableProviders) {
        const response = await ai.chat.get(
          {
            messages: [
              {
                role: 'user',
                content: 'Reply with exactly: "Hello from AI"'
              }
            ]
          },
          {
            metadata: {
              required: ['chat'],
              providers: { allow: [provider] }
            }
          }
        );

        expect(response.content).toBeTruthy();
        expect(typeof response.content).toBe('string');
        results[provider] = response.content as string;

        console.log(`  ${provider}: ${response.content}`);
      }

      // Verify all providers responded
      expect(Object.keys(results).length).toBe(availableProviders.length);
    }, 120000); // 2 minute timeout for multiple API calls

    it('should execute streaming chat on all available providers', async () => {
      for (const provider of availableProviders) {
        const chunks: string[] = [];

        const stream = ai.chat.stream(
          {
            messages: [
              {
                role: 'user',
                content: 'Count from 1 to 3'
              }
            ]
          },
          {
            metadata: {
              required: ['chat'],
              providers: { allow: [provider] }
            }
          }
        );

        for await (const chunk of stream) {
          if (chunk.content) {
            chunks.push(chunk.content as string);
          }
        }

        const fullResponse = chunks.join('');
        expect(fullResponse).toBeTruthy();

        console.log(`  ${provider}: ${chunks.length} chunks, "${fullResponse.substring(0, 50)}..."`);
      }
    }, 120000); // 2 minute timeout
  });

  describe('Cost Comparison', () => {
    it('should show cost differences between providers for same task', () => {
      const chatModels = ai.models.searchModels({
        required: ['chat']
      });

      // Group by provider and find cheapest from each
      const cheapestByProvider: Record<string, any> = {};

      for (const scored of chatModels) {
        const provider = scored.model.provider;
        if (!cheapestByProvider[provider] ||
            cheapestByProvider[provider].model.pricing.inputTokensPer1M > scored.model.pricing.inputTokensPer1M) {
          cheapestByProvider[provider] = scored;
        }
      }

      console.log('\n  Cheapest chat model by provider:');
      for (const [provider, scored] of Object.entries(cheapestByProvider)) {
        const model = (scored as any).model;
        console.log(`    ${provider}: ${model.id}`);
        console.log(`      Input: $${model.pricing.inputTokensPer1M}/M`);
        console.log(`      Output: $${model.pricing.outputTokensPer1M}/M`);
      }

      expect(Object.keys(cheapestByProvider).length).toBeGreaterThan(1);
    });
  });

  describe('Provider Health', () => {
    it('should check health of all providers', async () => {
      const healthResults: Record<string, boolean> = {};

      for (const providerName of availableProviders) {
        const provider = (ai as any).providers.get(providerName);

        if (provider && provider.checkHealth) {
          const isHealthy = await provider.checkHealth();
          healthResults[providerName] = isHealthy;
          console.log(`  ${providerName}: ${isHealthy ? '✓' : '✗'}`);
        }
      }

      // At least one provider should be healthy
      const healthyCount = Object.values(healthResults).filter(h => h).length;
      expect(healthyCount).toBeGreaterThan(0);
    }, 60000);
  });
});
