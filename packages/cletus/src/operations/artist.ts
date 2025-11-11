import { ImageGenerationResponse } from "@aits/ai";
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import sharp from "sharp";
import { getImagePath } from "../file-manager";
import { fileIsReadable } from "./file-helper";
import { operationOf } from "./types";

function resolveImage(cwd: string, imagePath: string): string {
  const cleanPath = imagePath.replace('file://', '');
  return path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cwd, cleanPath);
}

async function loadImageAsDataUrl(cwd: string, imagePath: string): Promise<string> {
  const fullPath = resolveImage(cwd, imagePath);

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
  { prompt: string; count: number; images: string[] }
>({
  mode: 'create',
  status: (input) => `Generating image: ${input.prompt.slice(0, 35)}...`,
  analyze: async (input, ctx) => {
    const count = input.n || 1;

    return {
      analysis: `This will generate ${count} image(s) with prompt: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config }) => {
    // Generate images
    const response = await ai.image.generate.get({
      model: config.getData().user.models?.imageGenerate,
      prompt: input.prompt,
      n: input.n || 1,
    });

    // Save images to files and collect file URLs
    const imagePaths = await saveGeneratedImage(response);
    const imageUrls = imagePaths.map((p) => `file://${p}`);

    return {
      prompt: input.prompt,
      count: imagePaths.length,
      images: imagePaths,
    };
  },
});

export const image_edit = operationOf<
  { prompt: string; imagePath: string },
  { prompt: string; originalPath: string; editedPath: string }
>({
  mode: 'update',
  status: (input) => `Editing image: ${path.basename(input.imagePath)}`,
  analyze: async (input, { cwd }) => {
    const fullImagePath = resolveImage(cwd, input.imagePath);
    
    if (!await fileIsReadable(fullImagePath)) {
      return {
        analysis: `This would fail - image "${input.imagePath}" not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will edit image "${input.imagePath}" with prompt: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config }) => {
    const image = await loadImageAsDataUrl(cwd, input.imagePath);

    // Edit image
    const response = await ai.image.edit.get({
      model: config.getData().user.models?.imageEdit,
      prompt: input.prompt,
      image,
    });

    const edited = await saveGeneratedImage(response);

    return {
      prompt: input.prompt,
      originalPath: input.imagePath,
      editedPath: `file://${edited[0]}`,
    };
  },
});

export const image_analyze = operationOf<
  { prompt: string; imagePaths: string[]; maxCharacters?: number },
  { prompt: string; imagePaths: string[]; analysis: string }
>({
  mode: 'read',
  status: (input) => `Analyzing ${input.imagePaths.length} image(s)`,
  analyze: async (input, { cwd }) => {
    const maxChars = input.maxCharacters || 2084;
    const imageCount = input.imagePaths.length;

    // Check if all images exist
    const imageChecks = await Promise.all(input.imagePaths.map(async (imagePath) => {
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
  do: async (input, { ai, cwd, config }) => {
    const imageUrls = await Promise.all(input.imagePaths.map(async (imagePath) => {
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
      prompt: input.prompt,
      imagePaths: input.imagePaths,
      analysis: response.content,
    };
  },
});

export const image_describe = operationOf<
  { imagePath: string },
  { imagePath: string; description: string }
>({
  mode: 'read',
  status: (input) => `Describing image: ${path.basename(input.imagePath)}`,
  analyze: async (input, { cwd }) => {
    const fullPath = resolveImage(cwd, input.imagePath);

    if (!await fileIsReadable(fullPath)) {
      return {
        analysis: `This would fail - image "${input.imagePath}" not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will describe the image at "${input.imagePath}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config }) => {
    const image = await loadImageAsDataUrl(cwd, input.imagePath);
 
    // Describe image
    const response = await ai.image.analyze.get({
      model: config.getData().user.models?.imageAnalyze,
      prompt: 'Describe this image in detail.',
      images: [image],
    });

    return {
      imagePath: input.imagePath,
      description: response.content,
    };
  },
});

// TODO phil this
export const image_find = operationOf<
  { prompt: string; glob: string; maxImages?: number; n?: number },
  { prompt: string; searched: number; results: Array<{ path: string; score: number }> }
>({
  mode: 'read',
  status: (input) => `Finding images: ${input.prompt.slice(0, 35)}...`,
  analyze: async (input, { cwd }) => {
    const maxImages = input.maxImages || 100;
    const n = input.n || 5;

    // Check if any images match the glob pattern
    const files = await glob(input.glob, { cwd });
    const imageFiles = files.filter((f) =>
      f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.gif')
    );

    if (imageFiles.length === 0) {
      return {
        analysis: `This would search 0 images - no images match pattern "${input.glob}".`,
        doable: true,
      };
    }

    const searchCount = Math.min(imageFiles.length, maxImages);
    return {
      analysis: `This will search ${searchCount} image(s) matching pattern "${input.glob}", returning top ${n} matches for: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config }) => {
    const maxImages = input.maxImages || 100;
    const n = input.n || 5;

    // Find images matching glob
    const files = await glob(input.glob, { cwd });
    const imageFiles = files.filter((f) =>
      f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.gif')
    ).slice(0, maxImages);

    if (imageFiles.length === 0) {
      return {
        prompt: input.prompt,
        searched: 0,
        results: [],
      };
    }

    // Generate descriptions for all images concurrently
    const descriptions = await Promise.all(imageFiles.map(async (file) => {
      const fullPath = path.resolve(cwd, file);

      try {
        const imageBuffer = await fs.readFile(fullPath);
        const base64 = imageBuffer.toString('base64');
        const mimeType = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        const response = await ai.image.analyze.get({
          model: config.getData().user.models?.imageAnalyze,
          prompt: 'Describe this image briefly in 1-2 sentences.',
          images: [dataUrl],
        });

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
    const validDescriptions = descriptions.filter((d) => d.description);

    // Embed all descriptions in batches of 1000
    const batchSize = 1000;
    const allEmbeddings: Array<{ path: string; embedding: number[] }> = [];

    for (let i = 0; i < validDescriptions.length; i += batchSize) {
      const batch = validDescriptions.slice(i, i + batchSize);
      const texts = batch.map((d) => d.description);

      const embeddingResult = await ai.embed.get({ texts });

      for (let j = 0; j < batch.length; j++) {
        allEmbeddings.push({
          path: batch[j].path,
          embedding: embeddingResult.embeddings[j].embedding,
        });
      }
    }

    // Embed the prompt
    const promptEmbedding = await ai.embed.get({ texts: [input.prompt] });
    const promptVector = promptEmbedding.embeddings[0].embedding;

    // Calculate similarity scores
    const scored = allEmbeddings.map((item) => ({
      path: item.path,
      score: cosineSimilarity(promptVector, item.embedding),
    }));

    // Sort by score and return top N
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, n);

    return {
      prompt: input.prompt,
      searched: imageFiles.length,
      results: topResults,
    };
  },
});

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}
