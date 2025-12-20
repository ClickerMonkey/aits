import { ImageGenerationResponse } from "@aeye/ai";
import fs from 'fs/promises';
import path from 'path';
import url from 'url';
import { abbreviate, cosineSimilarity, deepMerge, isObject, linkFile, paginateText, pluralize } from "../common";
import { canEmbed, embed } from "../embed";
import { getImagePath } from "../file-manager";
import { fileIsReadable, searchFiles } from "../helpers/files";
import { renderOperation } from "../helpers/render";
import { operationOf } from "./types";
import type { ChartConfig, ChartDataPoint } from "../tools/artist_schemas";

function resolveImage(cwd: string, imagePath: string): string {
  const [_, _filename, filepath] = imagePath.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || [];
  const actualPath = filepath || imagePath;
  const cleanPath = actualPath.startsWith('file://') ? url.fileURLToPath(actualPath) : actualPath;
  return path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cwd, cleanPath);
}

function linkImage(imagePath: string): string {
  const filename = path.basename(imagePath);
  return `[${filename}](${imagePath})`;
}

async function loadImageAsDataUrl(cwd: string, imagePath: string): Promise<string> {
  const fullPath = resolveImage(cwd, imagePath);

  // Lazy-load sharp
  const sharp = (await import("sharp")).default;
  
  const metadata = await sharp(fullPath).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const format = metadata.format;
  const needsResize = width > 2048 || height > 2048;
  const needsConversion = format !== 'png';

  let buffer: Buffer<ArrayBufferLike>;

  if (needsResize || needsConversion) {
    let pipeline = sharp(fullPath);

    if (needsResize) {
      pipeline = pipeline.resize(2048, 2048, {
        fit: 'inside',
      });
    }

    pipeline = pipeline.png();
    buffer = await pipeline.toBuffer();
  } else {
    buffer = await fs.readFile(fullPath);
  }

  const base64 = buffer.toString('base64');

  return `data:image/png;base64,${base64}`;
}

async function saveGeneratedImage(response: ImageGenerationResponse) {
  const imagesDir = await getImagePath(true);

  return await Promise.all(response.images.map(async (img, index) => {
    const timestamp = Date.now();
    const filename = `image_${timestamp}_${index}.png`;
    const filepath = path.join(imagesDir, filename);

    if (img.b64_json) {
      const buffer = Buffer.from(img.b64_json, 'base64');
      await fs.writeFile(filepath, buffer);
    } else if (img.url) {
      const urlResponse = await fetch(img.url);
      const buffer = Buffer.from(await urlResponse.arrayBuffer());
      await fs.writeFile(filepath, buffer);
    }

    return filepath;
  }));
}

export const image_generate = operationOf<
  { prompt: string; n?: number },
  { count: number; images: string[], links: string[] }
>({
  mode: 'create',
  signature: 'image_generate(prompt: string, n?: number)',
  status: (input) => `Generating image: ${abbreviate(input.prompt, 35)}`,
  analyze: async ({ input }, ctx) => {
    const count = input.n || 1;

    return {
      analysis: `This will generate ${count} image(s) with prompt: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async ({ input }, { ai, cwd, config, chatMessage }) => {
    // Generate images
    const response = await ai.image.generate.get({
      model: config.getData().user.models?.imageGenerate,
      prompt: input.prompt,
      n: input.n || 1,
    });

    // Save images to files and collect file URLs
    const imagePaths = await saveGeneratedImage(response);
    const imageLinks = imagePaths.map(linkImage);

    return {
      count: imagePaths.length,
      images: imagePaths,
      links: imageLinks,
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `ImageGenerate("${abbreviate(op.input.prompt, 30)}", n=${op.input.n || 1})`,
    (op) => {
      if (op.output) {
        const count = op.output.count;
        return `Generated **${count}** image${count !== 1 ? 's' : ''}: *"${op.input.prompt}"*\n${op.output.images.map(linkImage).join(' | ')}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const image_edit = operationOf<
  { prompt: string; path: string },
  { editedLink: string }
>({
  mode: 'update',
  signature: 'image_edit(path: string, prompt: string)',
  status: (input) => `Editing image: ${paginateText(input.path, 100, -100)}`,
  analyze: async ({ input }, { cwd }) => {
    const fullImagePath = resolveImage(cwd, input.path);

    if (!await fileIsReadable(fullImagePath)) {
      return {
        analysis: `This would fail - image ${linkFile(fullImagePath)} not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will edit image ${linkFile(fullImagePath)} with prompt: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async ({ input }, { ai, cwd, config, chatMessage }) => {
    const image = await loadImageAsDataUrl(cwd, input.path);

    // Edit image
    const response = await ai.image.edit.get({
      model: config.getData().user.models?.imageEdit,
      prompt: input.prompt,
      image,
    });

    const edited = await saveGeneratedImage(response);
    const imageUrls = edited.map(linkImage);

    return {
      editedLink: imageUrls[0],
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `ImageEdit("${paginateText(op.input.path, 100, -100)}", "${abbreviate(op.input.prompt, 20)}")`,
    (op) => {
      if (op.output) {
        return `Edited ${linkImage(op.input.path)} → saved to ${op.output.editedLink}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const image_analyze = operationOf<
  { prompt: string; paths: string[]; maxCharacters?: number },
  { analysis: string, links: string[] }
>({
  mode: 'read',
  signature: 'image_analyze(imagePaths: string[], prompt: string, maxCharacters?: number)',
  status: (input) => `Analyzing ${input.paths.length} image(s)`,
  analyze: async ({ input }, { cwd }) => {
    const maxChars = input.maxCharacters || 2084;
    const imageCount = input.paths.length;

    // Check if all images exist
    const imageChecks = await Promise.all(input.paths.map(async (imagePath) => {
      return await fileIsReadable(resolveImage(cwd, imagePath));
    }));

    const allExist = imageChecks.every((exists) => exists);

    if (!allExist) {
      return {
        analysis: `This would fail - one or more images not found.`,
        doable: false,
      };
    }

    return {
      analysis: `This will analyze ${imageCount} image(s) with prompt: "${input.prompt}" (max ${maxChars} characters)`,
      doable: true,
    };
  },
  do: async ({ input }, { ai, cwd, config }) => {
    const imageUrls = await Promise.all(input.paths.map(async (imagePath) => {
      return loadImageAsDataUrl(cwd, imagePath);
    }));

    // Analyze images
    const response = await ai.image.analyze.get({
      model: config.getData().user.models?.imageAnalyze,
      prompt: input.prompt,
      images: imageUrls,
      maxTokens: Math.floor((input.maxCharacters || 2084) / 4),
    });

    return {
      analysis: response.content,
      links: input.paths.map(linkImage),
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `ImageAnalyze(${pluralize(op.input.paths.length, paginateText(op.input.paths[0], 100, -100), 'images')}, "${abbreviate(op.input.prompt, 20)}")`,
    (op) => {
      if (op.output) {
        return abbreviate(op.output.analysis, 60);
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const image_describe = operationOf<
  { path: string },
  { link: string; description: string }
>({
  mode: 'read',
  signature: 'image_describe(path: string)',
  status: (input) => `Describing image: ${paginateText(input.path, 100, -100)}`,
  analyze: async ({ input }, { cwd }) => {
    const fullPath = resolveImage(cwd, input.path);

    if (!await fileIsReadable(fullPath)) {
      return {
        analysis: `This would fail - image ${linkFile(fullPath)} not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will describe the image at ${linkFile(fullPath)}`,
      doable: true,
    };
  },
  do: async ({ input }, { ai, cwd, config }) => {
    const fullPath = resolveImage(cwd, input.path);
    const image = await loadImageAsDataUrl(cwd, input.path);

    // Describe image
    const response = await ai.image.analyze.get({
      model: config.getData().user.models?.imageAnalyze,
      prompt: 'Describe this image in detail.',
      images: [image],
    });

    return {
      link: linkImage(fullPath),
      description: response.content,
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `ImageDescribe("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output) {
        return `${op.output.link}: *${abbreviate(op.output.description, 60)}*`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const image_find = operationOf<
  { query: string; glob: string; maxImages?: number; n?: number },
  { searched: number; results: Array<{ path: string; link: string; score: number, matches: string }> }
>({
  mode: 'read',
  signature: 'image_find(query: string, glob: string, maxImages?: number, n?: number)',
  status: (input) => `Finding images: ${abbreviate(input.query, 35)}`,
  analyze: async ({ input }, { cwd, signal }) => {
    const maxImages = input.maxImages || 100;
    const n = input.n || 5;
    const files = await searchFiles(cwd, input.glob, signal);
    const images = files.filter(f => f.fileType === 'image').slice(0, maxImages);
    
    if (images.length === 0) {
      return {
        analysis: `This would search 0 images - no images match pattern "${input.glob}".`,
        doable: true,
      };
    }

    if (!await canEmbed()) {
      return {
        analysis: 'This would fail - image finding requires embedding capabilities, which are not available.',
        doable: false,
      };
    }

    const searchCount = Math.min(images.length, maxImages);
    return {
      analysis: `This will search ${searchCount} image(s) matching pattern "${input.glob}", returning top ${n} matches for: "${input.query}"`,
      doable: true,
    };
  },
  do: async ({ input }, { ai, cwd, config, chatStatus, signal }) => {
    const maxImages = input.maxImages || 100;
    const n = input.n || 5;
    const files = await searchFiles(cwd, input.glob, signal);
    const images = files.filter(f => f.fileType === 'image').slice(0, maxImages);

    if (images.length === 0) {
      return {
        searched: 0,
        results: [],
      };
    }

    if (!await canEmbed()) {
      throw new Error('Image finding requires embedding capabilities, which are not available.');
    }

    // Fallback to using image analysis with text prompt
    const model = config.getData().user.models?.imageAnalyze;
    const prompt = `The user is looking for images that match this description
<description>
${input.query}
</description>
Analyze the image and return a subset of the description that best matches the content of the image. 
If the description does not match the image in anyway, return an empty string.
If the description perfectly matches the image, return the entire description.
Do not return any additional text other than the matching description subset.`;

    let analyzeCount = 0;
    chatStatus(`Step 1/3: Describing ${images.length} images...`);

    // Generate descriptions for all images concurrently
    const imagesDescribed = await Promise.all(images.map(async ({ file }) => {
      try {
        const imageData = await loadImageAsDataUrl(cwd, file);
        
        const response = await ai.image.analyze.get({
          model,
          prompt,
          images: [imageData],
        });

        analyzeCount++;
        chatStatus(`Step 1/3: Described ${analyzeCount}/${images.length} images...`);

        return {
          path: file,
          description: response.content,
        };
      } catch (error) {
        return {
          path: file,
          description: '',
        };
      }
    }));

    // Filter out failed descriptions
    const imagesValid = imagesDescribed.filter((d) => d.description);

    // Embed descriptions
    chatStatus(`Step 2/3: Embedding descriptions...`);
    const imagesEmbeddings = await embed(imagesValid.map((d) => d.description), signal);
    const imagesEmbedded = imagesValid.map((d, i) => ({
      ...d,
      embedding: imagesEmbeddings![i],
    }));

    chatStatus(`Step 3/3: Scoring and selecting top ${n} images...`);

    // Score images by cosine similarity to prompt embedding
    const [promptEmbedding] = await embed([input.query], signal) || [];

    const imagesScored = imagesEmbedded.map((item) => ({
      score: cosineSimilarity(promptEmbedding, item.embedding),
      ...item,
    }));

    // Sort by score descending
    imagesScored.sort((a, b) => b.score - a.score);

    // Return top N results
    const topResults = imagesScored.slice(0, n).map((item) => ({
      path: item.path,
      link: linkImage(item.path),
      score: item.score,
      matches: item.description,
    }));

    return {
      searched: images.length,
      results: topResults, 
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `ImageFind("${abbreviate(op.input.query, 50)}", "${op.input.glob}")`,
    (op) => {
      if (op.output) {
        const resultCount = op.output.results.length;
        const searched = op.output.searched;
        return `Found ${resultCount} matching image${resultCount !== 1 ? 's' : ''} (searched ${searched})`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

export const image_attach = operationOf<
  { path: string },
  { fullPath: string, attached: boolean }
>({
  mode: 'create',
  signature: 'image_attach({ path })',
  status: ({ path: imagePath }) => `Attaching image: ${paginateText(imagePath, 100, -100)}`,
  analyze: async ({ input: { path: imagePath } }, { cwd }) => {
    // Resolve path (supports both absolute and relative)
    const fullPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(cwd, imagePath);

    // Check if file exists and is readable
    const readable = await fileIsReadable(fullPath);
    if (!readable) {
      return {
        analysis: `This would fail - image file ${linkFile(fullPath)} not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will attach the image ${linkFile(fullPath)} to the chat as a user message.`,
      doable: true,
    };
  },
  do: async ({ input: { path: imagePath } }, { cwd, chatMessage }) => {
    // Resolve path (supports both absolute and relative)
    const fullPath = resolveImage(cwd, imagePath);
    const imageLink = linkFile(fullPath);

    // Add image to the chat message
    if (chatMessage) {
      chatMessage.content.push({ type: 'image', content: imageLink });
    }

    return { fullPath, attached: true };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `ImageAttach("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output?.attached) {
        return `Attached image: ${linkFile(op.output.fullPath)}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

// ============================================================================
// Chart Display Types
// ============================================================================

export type ChartGroup = 
  | 'partToWhole'
  | 'categoryComparison'
  | 'timeSeries'
  | 'distribution'
  | 'correlation'
  | 'ranking'
  | 'hierarchical'
  | 'flow'
  | 'geospatial'
  | 'multivariateComparison';

export type ChartVariant = 
  // partToWhole
  | 'pie' | 'donut' | 'treemap' | 'sunburst'
  // categoryComparison
  | 'bar' | 'horizontalBar' | 'pictorialBar'
  // timeSeries
  | 'line' | 'area' | 'step' | 'smoothLine'
  // distribution
  | 'histogram' | 'boxplot'
  // correlation
  | 'scatter' | 'effectScatter' | 'heatmap'
  // ranking
  | 'orderedBar' | 'horizontalOrderedBar'
  // hierarchical (overlaps with partToWhole)
  | 'tree'
  // flow
  | 'sankey' | 'funnel'
  // geospatial
  | 'map'
  // multivariateComparison
  | 'groupedBar' | 'stackedBar' | 'radar' | 'parallel';

export const ChartGroupVariants: Record<ChartGroup, ChartVariant[]> = {
  partToWhole: ['pie', 'donut', 'treemap', 'sunburst'],
  categoryComparison: ['bar', 'horizontalBar', 'pictorialBar'],
  timeSeries: ['line', 'area', 'step', 'smoothLine'],
  distribution: ['histogram', 'boxplot'],
  correlation: ['scatter', 'effectScatter', 'heatmap'],
  ranking: ['orderedBar', 'horizontalOrderedBar'],
  hierarchical: ['treemap', 'sunburst', 'tree'],
  flow: ['sankey', 'funnel'],
  geospatial: ['map'], // Removed scatter to avoid duplication with correlation group
  multivariateComparison: ['groupedBar', 'stackedBar', 'radar', 'parallel'],
};

// ECharts option type (simplified - in reality it's much more complex)
export type EChartsOption = Record<string, unknown>;

export type ChartDisplayInput = {
  chart: ChartConfig;
};

export type ChartDisplayOutput = {
  chartGroup: ChartGroup;
  availableVariants: ChartVariant[];
  currentVariant: ChartVariant;
  option: EChartsOption;
  data: ChartDataPoint[];
  variantOptions: Partial<Record<ChartVariant, Partial<EChartsOption>>>;
};

// ============================================================================
// Chart Display Operation
// ============================================================================

export const chart_display = operationOf<
  ChartDisplayInput,
  ChartDisplayOutput
>({
  mode: 'local',
  signature: 'chart_display(chart)',
  status: (input) => `Displaying ${input.chart.chartGroup} chart`,
  analyze: async ({ input }) => {
    // Local operation, no analysis needed
    return {
      analysis: `This will display a ${input.chart.chartGroup} chart with ${input.chart.data?.length || 0} data points`,
      doable: true,
    };
  },
  do: async ({ input }) => {
    const { chartGroup, data, title, variantOptions, defaultVariant } = input.chart;
    const availableVariants = ChartGroupVariants[chartGroup];
    const currentVariant = defaultVariant || availableVariants[0];
    const variantOpts = variantOptions || {};

    // Build base option from input
    const baseOption: EChartsOption = {
      title: title ? { text: title, left: 'center' } : undefined,
      tooltip: { trigger: 'item' },
      legend: {},
      series: [],
    };

    // Apply variant-specific options
    const variantOption = variantOpts[currentVariant] || {};
    const option = applyVariantToOption(baseOption, currentVariant, data, variantOption);

    return {
      chartGroup,
      availableVariants,
      currentVariant,
      option,
      data,
      variantOptions: variantOpts,
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `ChartDisplay(${op.input.chart.chartGroup}, ${op.input.chart.data?.length || 0} points)`,
    (op) => {
      if (op.output) {
        return `Displaying ${op.output.chartGroup} chart as ${op.output.currentVariant}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

/**
 * Apply variant-specific transformations to the base option
 * 
 * Note: This function is duplicated in browser/operations/artist.tsx as buildOptionForVariant because:
 * 1. The browser code cannot import from Node.js-specific files
 * 2. Extracting to shared.ts would require moving all chart logic there
 * 3. The logic needs to be in sync for server-side and client-side rendering
 * 
 * If making changes here, ensure the same changes are made in browser/operations/artist.tsx
 */
function applyVariantToOption(
  baseOption: EChartsOption,
  variant: ChartVariant,
  data: ChartDataPoint[],
  variantOption: Partial<EChartsOption>
): EChartsOption {
  const option = { ...baseOption };

  // Apply variant-specific series configuration
  switch (variant) {
    case 'pie':
      option.series = [{
        type: 'pie',
        radius: '50%',
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }];
      break;

    case 'donut':
      option.series = [{
        type: 'pie',
        radius: ['40%', '70%'],
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }];
      break;

    case 'treemap':
      option.series = [{
        type: 'treemap',
        data,
      }];
      break;

    case 'sunburst':
      option.series = [{
        type: 'sunburst',
        data,
        radius: [0, '90%'],
      }];
      break;

    case 'bar':
      option.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.yAxis = { type: 'value' };
      option.series = [{
        type: 'bar',
        data: data.map((d: any) => d.value),
      }];
      break;

    case 'horizontalBar':
      option.yAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.xAxis = { type: 'value' };
      option.series = [{
        type: 'bar',
        data: data.map((d: any) => d.value),
      }];
      break;

    case 'pictorialBar':
      option.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.yAxis = { type: 'value' };
      option.series = [{
        type: 'pictorialBar',
        data: data.map((d: any) => d.value),
        symbol: 'rect',
      }];
      break;

    case 'line':
      option.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.yAxis = { type: 'value' };
      option.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
      }];
      break;

    case 'area':
      option.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.yAxis = { type: 'value' };
      option.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
        areaStyle: {},
      }];
      break;

    case 'step':
      option.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.yAxis = { type: 'value' };
      option.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
        step: 'start',
      }];
      break;

    case 'smoothLine':
      option.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.yAxis = { type: 'value' };
      option.series = [{
        type: 'line',
        data: data.map((d: any) => d.value),
        smooth: true,
      }];
      break;

    case 'histogram':
    case 'boxplot':
    case 'scatter':
    case 'effectScatter':
    case 'heatmap':
    case 'tree':
    case 'sankey':
    case 'funnel':
    case 'map':
    case 'radar':
    case 'parallel':
      // Use the variant name directly as ECharts type (these are already correct)
      option.series = [{
        type: variant,
        data,
      }];
      break;
      
    case 'orderedBar':
    case 'horizontalOrderedBar':
      // Ordered bars are just bars with sorted data
      const sortedData = [...data].sort((a: any, b: any) => b.value - a.value);
      if (variant === 'horizontalOrderedBar') {
        option.yAxis = { type: 'category', data: sortedData.map((d: any) => d.name) };
        option.xAxis = { type: 'value' };
      } else {
        option.xAxis = { type: 'category', data: sortedData.map((d: any) => d.name) };
        option.yAxis = { type: 'value' };
      }
      option.series = [{
        type: 'bar',
        data: sortedData.map((d: any) => d.value),
      }];
      break;
      
    case 'groupedBar':
    case 'stackedBar':
      // Grouped and stacked bars need multiple series
      // For now, treat as regular bar - requires more complex data structure
      option.xAxis = { type: 'category', data: data.map((d: any) => d.name) };
      option.yAxis = { type: 'value' };
      option.series = [{
        type: 'bar',
        data: data.map((d: any) => d.value),
        stack: variant === 'stackedBar' ? 'total' : undefined,
      }];
      break;
  }

  // Merge variant-specific options
  return deepMerge(option, variantOption);
}

