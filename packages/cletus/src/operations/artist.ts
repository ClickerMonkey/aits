import { CletusCoreContext } from "../ai";
import { operationOf } from "./types";
import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';

export const image_generate = operationOf<
  { prompt: string; n?: number },
  { prompt: string; count: number; images: string[] }
>({
  mode: 'create',
  analyze: async (input, ctx) => {
    const count = input.n || 1;
    return {
      analysis: `This will generate ${count} image(s) with prompt: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd }) => {
    const count = input.n || 1;

    // Ensure .cletus/images directory exists
    const imagesDir = path.join(cwd, '.cletus', 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    // Generate images
    const response = await ai.image.generate.get({
      prompt: input.prompt,
      n: count,
    });

    // Save images to files and collect file URLs
    const imagePaths: string[] = [];

    for (let i = 0; i < response.images.length; i++) {
      const image = response.images[i];
      const timestamp = Date.now();
      const filename = `gen_${timestamp}_${i}.png`;
      const filepath = path.join(imagesDir, filename);

      if (image.b64_json) {
        // Decode base64 and save
        const buffer = Buffer.from(image.b64_json, 'base64');
        await fs.writeFile(filepath, buffer);
      } else if (image.url) {
        // Download from URL and save
        const response = await fetch(image.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(filepath, buffer);
      }

      imagePaths.push(`file://${filepath}`);
    }

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
  analyze: async (input, { cwd }) => {
    const imagePath = input.imagePath.replace('file://', '');
    const fullImagePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(cwd, imagePath);

    try {
      await fs.stat(fullImagePath);
      return {
        analysis: `This will edit image "${input.imagePath}" with prompt: "${input.prompt}"`,
        doable: true,
      };
    } catch {
      return {
        analysis: `This would fail - image "${input.imagePath}" not found.`,
        doable: false,
      };
    }
  },
  do: async (input, { ai, cwd }) => {
    // Ensure .cletus/images directory exists
    const imagesDir = path.join(cwd, '.cletus', 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    // Resolve image path
    const imagePath = input.imagePath.replace('file://', '');
    const fullImagePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(cwd, imagePath);

    // Read image file
    const imageBuffer = await fs.readFile(fullImagePath);

    // Edit image
    const response = await ai.image.edit.get({
      prompt: input.prompt,
      image: imageBuffer,
    });

    // Save edited image
    const timestamp = Date.now();
    const filename = `edit_${timestamp}.png`;
    const filepath = path.join(imagesDir, filename);

    if (response.images[0].b64_json) {
      const buffer = Buffer.from(response.images[0].b64_json, 'base64');
      await fs.writeFile(filepath, buffer);
    } else if (response.images[0].url) {
      const urlResponse = await fetch(response.images[0].url);
      const buffer = Buffer.from(await urlResponse.arrayBuffer());
      await fs.writeFile(filepath, buffer);
    }

    return {
      prompt: input.prompt,
      originalPath: input.imagePath,
      editedPath: `file://${filepath}`,
    };
  },
});

export const image_analyze = operationOf<
  { prompt: string; imagePaths: string[]; maxCharacters?: number },
  { prompt: string; imagePaths: string[]; analysis: string }
>({
  mode: 'local',
  analyze: async (input, { cwd }) => {
    const maxChars = input.maxCharacters || 2084;
    const imageCount = input.imagePaths.length;

    // Check if all images exist
    const imageChecks = await Promise.all(input.imagePaths.map(async (imagePath) => {
      const cleanPath = imagePath.replace('file://', '');
      const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cwd, cleanPath);
      try {
        await fs.stat(fullPath);
        return true;
      } catch {
        return false;
      }
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
  do: async (input, { ai, cwd }) => {
    // Convert file:// paths to absolute paths and read images
    const imageUrls = await Promise.all(input.imagePaths.map(async (imagePath) => {
      const cleanPath = imagePath.replace('file://', '');
      const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cwd, cleanPath);

      // Read image and convert to base64 data URL
      const imageBuffer = await fs.readFile(fullPath);
      const base64 = imageBuffer.toString('base64');
      const mimeType = fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    }));

    // Analyze images
    const response = await ai.image.analyze.get({
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
  mode: 'local',
  analyze: async (input, { cwd }) => {
    const cleanPath = input.imagePath.replace('file://', '');
    const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cwd, cleanPath);

    try {
      await fs.stat(fullPath);
      return {
        analysis: `This will describe the image at "${input.imagePath}"`,
        doable: true,
      };
    } catch {
      return {
        analysis: `This would fail - image "${input.imagePath}" not found.`,
        doable: false,
      };
    }
  },
  do: async (input, { ai, cwd }) => {
    // Convert file:// path to absolute path
    const cleanPath = input.imagePath.replace('file://', '');
    const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cwd, cleanPath);

    // Read image and convert to base64 data URL
    const imageBuffer = await fs.readFile(fullPath);
    const base64 = imageBuffer.toString('base64');
    const mimeType = fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Describe image
    const response = await ai.image.analyze.get({
      prompt: 'Describe this image in detail.',
      images: [dataUrl],
    });

    return {
      imagePath: input.imagePath,
      description: response.content,
    };
  },
});

export const image_find = operationOf<
  { prompt: string; glob: string; maxImages?: number; n?: number },
  { prompt: string; searched: number; results: Array<{ path: string; score: number }> }
>({
  mode: 'local',
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
  do: async (input, { ai, cwd }) => {
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
