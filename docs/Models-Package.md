Lets create a single package '@aits/models' that stores model info scraped from all available sources. These models are static based on a script that will be ran periodically.

Some sources are REST API endpoints - some are pages that need to be rendered. We need to create a script that can be ran to extract all the information. 

The goal is to have a complete list of type `ModelInfo<string>` from openai, openrouter, & replicate.

We want all capabilities, pricing, contextWindow, maxOutputTokens, metrics, tokenzier, supportedParameters.

- https://openrouter.ai/api/v1/models (caps & pricing)
- https://openrouter.ai/api/v1/endpoints/zdr (ZDR models)
- https://platform.openai.com/docs/models - render with puppeteer (all of OpenAI models)
- https://platform.openai.com/docs/models/{model_id} - render with puppeteer (model details - pricing, reasoning, speed, input, output, context window, output tokens, reasoning, knowledge cut-off, features)
- https://openrouter.ai/{model_id} - render with puppeteer (model details - latency, throughput, uptime)
- https://platform.openai.com/docs/api-reference - render with puppeteer (all API reference - parameters per model)
-    https://platform.openai.com/docs/api-reference/images/create - image generation parameters per model
- https://api.replicate.com/v1/models (need to add REPLICATE_API_KEY to get it) - should just use Replicate npm module

You can rely on OPENAI_ADMIN_API_KEY, OPENAI_API_KEY, REPLICATE_API_KEY being environment variables that can be used. (OPENAI_PROJECT_ID might be available)

For replicate pull down the model list, for each one get the model schema. With this stored info as JSON - I will use Claude to create a ModelTransformer for each replicate model. We should cache all this replicate info for the transformer step which is separate from the model info building step. The cache should not be committed.

See packages/replicate/src/replicate.ts for Replicate JSON shapes
See packages/openrouter/src/types.ts for OpenRouter JSON shapes

We need to avoid duplicate types everywhere - those files have the accurate types. We should export them if we need to.