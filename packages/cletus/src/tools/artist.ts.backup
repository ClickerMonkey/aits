import { z } from 'zod';
import { globalToolProperties, type CletusAI } from '../ai';
import { getOperationInput } from '../operations/types';

/**
 * Create artist tools for image operations
 * Images are stored in .cletus/images/ and referenced via [filename](filepath) syntax
*/
export function createArtistTools(ai: CletusAI) {
  const imageGenerate = ai.tool({
    name: 'image_generate',
    description: 'Generate one or more images from a text prompt',
    instructions: `Use this to create new images. Generated images are saved to .cletus/images/ and returned as file paths.

Example: Generate a landscape image:
{ "prompt": "A serene mountain landscape at sunset with a lake in the foreground", "n": 1 }
 
{{modeInstructions}}`,
    schema: z.object({
      prompt: z.string().describe('Text description of the image to generate'),
      n: z.number().optional().default(1).describe('Number of images to generate (default: 1)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('image_generate'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_generate', input }, ctx),
  });

  const imageEdit = ai.tool({
    name: 'image_edit',
    description: 'Edit an existing image based on a text prompt',
    instructions: `Use this to modify an existing image. Provide a file path (relative or absolute path or[filename](filepath)) and a description of the edit. The edited image will be saved as a new file.

Example: Add a sunset effect to an image:
{ "prompt": "Add warm sunset colors and lighting", "path": "images/photo.jpg" }
 
{{modeInstructions}}`,
    schema: z.object({
      prompt: z.string().describe('Description of how to edit the image'),
      path: z.string().describe('Path to the image to edit (relative path or absolute path or [filename](filepath) URL)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('image_edit'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_edit', input }, ctx),
  });

  const imageAnalyze = ai.tool({
    name: 'image_analyze',
    description: 'Analyze one or more images with AI and answer questions',
    instructions: `Use this to understand what's in images or answer specific questions about them. Can analyze multiple images together for comparison.

Example: Compare two designs:
{ "prompt": "What are the main differences between these two UI designs?", "paths": ["designs/v1.png", "designs/v2.png"] }
 
{{modeInstructions}}`,
    schema: z.object({
      prompt: z.string().describe('Question or analysis request about the images'),
      paths: z.array(z.string()).describe('Paths to images to analyze (relative paths or absolute file or [filename](filepath))'),
      maxCharacters: z.number().optional().default(2084).describe('Maximum response length (maxCharacters/4 = maxTokens, default: 2084)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('image_analyze'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_analyze', input }, ctx),
  });

  const imageDescribe = ai.tool({
    name: 'image_describe',
    description: 'Get a detailed description of what\'s in an image',
    instructions: `Use this to generate a comprehensive description of an image's contents without a specific question.

Example: Describe a screenshot:
{ "path": "screenshots/dashboard.png" }
 
{{modeInstructions}}`,
    schema: z.object({
      path: z.string().describe('Path to the image to describe (relative path or absolute path or [filename](filepath))'),
      ...globalToolProperties,
    }),
    input: getOperationInput('image_describe'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_describe', input }, ctx),
  });

  const imageFind = ai.tool({
    name: 'image_find',
    description: 'Find images matching a description using semantic search',
    instructions: `Use this to search for images in a directory that match a text description. Each image is analyzed and embedded, then compared to the prompt embedding for similarity scoring. This operation can be slow for large numbers of images.

Example: Find images of people in photos:
{ "query": "photos containing people smiling", "glob": "photos/**/*.jpg", "n": 5 }
 
{{modeInstructions}}`,
    schema: z.object({
      query: z.string().describe('Description of what to find in images'),
      glob: z.string().describe('Glob pattern for image files to search (e.g., "**/*.png", "photos/*.jpg")'),
      maxImages: z.number().optional().default(100).describe('Maximum number of images to analyze (default: 100)'),
      n: z.number().optional().default(5).describe('Number of top results to return (default: 5)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('image_find'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_find', input }, ctx),
  });

  const imageAttach = ai.tool({
    name: 'image_attach',
    description: 'Attach an image to the chat for the user & AI assistant to see',
    instructions: `Use this to attach an image file to the chat conversation. The image will be added as a user message and displayed in the chat. Accepts both absolute and relative paths.

Example: Attach an image file:
{ "path": "images/diagram.png" }
 
{{modeInstructions}}`,
    schema: z.object({
      path: z.string().describe('Path to the image file to attach (absolute or relative)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('image_attach'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'image_attach', input }, ctx),
  });

  // Chart display schemas - one for each chart group
  const ChartDataPointSchema = z.object({
    name: z.string().describe('Name/label for the data point'),
    value: z.number().describe('Numeric value for the data point'),
  });

  const PartToWholeChartSchema = z.object({
    chartGroup: z.literal('partToWhole'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of data points showing parts of a whole'),
    variantOptions: z.record(
      z.enum(['pie', 'donut', 'treemap', 'sunburst']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['pie', 'donut', 'treemap', 'sunburst']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const CategoryComparisonChartSchema = z.object({
    chartGroup: z.literal('categoryComparison'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of data points for category comparison'),
    variantOptions: z.record(
      z.enum(['bar', 'horizontalBar', 'pictorialBar']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['bar', 'horizontalBar', 'pictorialBar']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const TimeSeriesChartSchema = z.object({
    chartGroup: z.literal('timeSeries'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of time-series data points'),
    variantOptions: z.record(
      z.enum(['line', 'area', 'step', 'smoothLine']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['line', 'area', 'step', 'smoothLine']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const DistributionChartSchema = z.object({
    chartGroup: z.literal('distribution'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of data points for distribution analysis'),
    variantOptions: z.record(
      z.enum(['histogram', 'boxplot']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['histogram', 'boxplot']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const CorrelationChartSchema = z.object({
    chartGroup: z.literal('correlation'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of data points for correlation analysis'),
    variantOptions: z.record(
      z.enum(['scatter', 'effectScatter', 'heatmap']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['scatter', 'effectScatter', 'heatmap']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const RankingChartSchema = z.object({
    chartGroup: z.literal('ranking'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of data points to rank'),
    variantOptions: z.record(
      z.enum(['orderedBar', 'horizontalOrderedBar']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['orderedBar', 'horizontalOrderedBar']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const HierarchicalChartSchema = z.object({
    chartGroup: z.literal('hierarchical'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of hierarchical data points'),
    variantOptions: z.record(
      z.enum(['treemap', 'sunburst', 'tree']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['treemap', 'sunburst', 'tree']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const FlowChartSchema = z.object({
    chartGroup: z.literal('flow'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of flow/funnel data points'),
    variantOptions: z.record(
      z.enum(['sankey', 'funnel']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['sankey', 'funnel']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const GeospatialChartSchema = z.object({
    chartGroup: z.literal('geospatial'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of geographic data points'),
    variantOptions: z.record(
      z.enum(['map']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['map']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const MultivariateComparisonChartSchema = z.object({
    chartGroup: z.literal('multivariateComparison'),
    title: z.string().optional().describe('Optional chart title'),
    data: z.array(ChartDataPointSchema).describe('Array of data points for multivariate comparison'),
    variantOptions: z.record(
      z.enum(['groupedBar', 'stackedBar', 'radar', 'parallel']),
      z.record(z.unknown())
    ).optional().describe('Optional variant-specific ECharts options'),
    defaultVariant: z.enum(['groupedBar', 'stackedBar', 'radar', 'parallel']).optional().describe('Default variant to display'),
    ...globalToolProperties,
  });

  const chartDisplay = ai.tool({
    name: 'chart_display',
    description: 'Display data as an interactive chart in the browser UI',
    instructions: `Use this to visualize data as a chart. This is browser-only and will display an interactive chart with variant switching capabilities.

Chart groups and their available variants:
- partToWhole: pie, donut, treemap, sunburst (for showing parts of a whole)
- categoryComparison: bar, horizontalBar, pictorialBar (for comparing categories)
- timeSeries: line, area, step, smoothLine (for data over time)
- distribution: histogram, boxplot (for data distribution)
- correlation: scatter, effectScatter, heatmap (for showing relationships)
- ranking: orderedBar, horizontalOrderedBar (for ranked data)
- hierarchical: treemap, sunburst, tree (for hierarchical data)
- flow: sankey, funnel (for flow/process data)
- geospatial: map (for geographic data)
- multivariateComparison: groupedBar, stackedBar, radar, parallel (for comparing multiple variables)

Data format: Provide an array of objects with 'name' and 'value' properties, e.g.:
[{ "name": "Apple", "value": 28 }, { "name": "Samsung", "value": 22 }]

The chart will be displayed in the browser with controls to switch between different variants of the same chart group.

Example: Display market share as a pie chart:
{ "chartGroup": "partToWhole", "title": "Market Share", "data": [{"name": "Apple", "value": 28}, {"name": "Samsung", "value": 22}], "defaultVariant": "pie" }
 
{{modeInstructions}}`,
    schema: z.discriminatedUnion('chartGroup', [
      PartToWholeChartSchema,
      CategoryComparisonChartSchema,
      TimeSeriesChartSchema,
      DistributionChartSchema,
      CorrelationChartSchema,
      RankingChartSchema,
      HierarchicalChartSchema,
      FlowChartSchema,
      GeospatialChartSchema,
      MultivariateComparisonChartSchema,
    ]),
    metadata: { onlyClient: 'browser' },
    input: getOperationInput('chart_display'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'chart_display', input }, ctx),
  });

  return [
    imageGenerate,
    imageEdit,
    imageAnalyze,
    imageDescribe,
    imageFind,
    imageAttach,
    chartDisplay,
  ] as [
    typeof imageGenerate,
    typeof imageEdit,
    typeof imageAnalyze,
    typeof imageDescribe,
    typeof imageFind,
    typeof imageAttach,
    typeof chartDisplay,
  ];
}
