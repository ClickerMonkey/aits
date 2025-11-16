import { ImageGenerationResponse, ScoredModel } from "@aits/ai";
import fs from 'fs/promises';
import path from 'path';
import sharp from "sharp";
import { abbreviate, chunkArray, cosineSimilarity, linkFile, paginateText, pluralize } from "../common";
import { CONSTS } from "../constants";
import { getImagePath } from "../file-manager";
import { fileIsReadable, searchFiles } from "../helpers/files";
import { renderOperation } from "../helpers/render";
import { operationOf } from "./types";

function resolveImage(cwd: string, imagePath: string): string {
  const [_, _filename, filepath] = imagePath.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || [];
  const cleanPath = filepath || imagePath;
  return path.isAbsolute(cleanPath) ? cleanPath : path.resolve(cwd, cleanPath);
}

function linkImage(imagePath: string): string {
  const filename = path.basename(imagePath);
  return `[${filename}](${imagePath})`;
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
  { count: number; images: string[], links: string[] }
>({
  mode: 'create',
  signature: 'image_generate(prompt: string, n?: number)',
  status: (input) => `Generating image: ${abbreviate(input.prompt, 35)}`,
  analyze: async (input, ctx) => {
    const count = input.n || 1;

    return {
      analysis: `This will generate ${count} image(s) with prompt: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config, chatMessage }) => {
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
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `ImageGenerate("${abbreviate(op.input.prompt, 30)}", n=${op.input.n || 1})`,
    (op) => {
      if (op.output) {
        const count = op.output.count;
        return `Generated **${count}** image${count !== 1 ? 's' : ''}: *"${abbreviate(op.input.prompt, 40)}"*\n${op.output.images.map(linkImage).join(' | ')}`;
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
  analyze: async (input, { cwd }) => {
    const fullImagePath = resolveImage(cwd, input.path);

    if (!await fileIsReadable(fullImagePath)) {
      return {
        analysis: `This would fail - image ${linkFile(input.path)} not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will edit image ${linkFile(input.path)} with prompt: "${input.prompt}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config, chatMessage }) => {
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
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `ImageEdit("${paginateText(op.input.path, 100, -100)}", "${abbreviate(op.input.prompt, 20)}")`,
    (op) => {
      if (op.output) {
        return `Edited **${linkFile(op.input.path)}** → saved to ${op.output.editedLink}`;
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
  analyze: async (input, { cwd }) => {
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
  do: async (input, { ai, cwd, config }) => {
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
  render: (op, config, showInput, showOutput) => renderOperation(
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
  analyze: async (input, { cwd }) => {
    const fullPath = resolveImage(cwd, input.path);

    if (!await fileIsReadable(fullPath)) {
      return {
        analysis: `This would fail - image ${linkFile(input.path)} not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will describe the image at ${linkFile(input.path)}`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config }) => {
    const image = await loadImageAsDataUrl(cwd, input.path);

    // Describe image
    const response = await ai.image.analyze.get({
      model: config.getData().user.models?.imageAnalyze,
      prompt: 'Describe this image in detail.',
      images: [image],
    });

    return {
      link: linkImage(input.path),
      description: response.content,
    };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
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
  analyze: async (input, { cwd }) => {
    const maxImages = input.maxImages || 100;
    const n = input.n || 5;
    const files = await searchFiles(cwd, input.glob);
    const images = files.filter(f => f.fileType === 'image').slice(0, maxImages);
    
    if (images.length === 0) {
      return {
        analysis: `This would search 0 images - no images match pattern "${input.glob}".`,
        doable: true,
      };
    }

    const searchCount = Math.min(images.length, maxImages);
    return {
      analysis: `This will search ${searchCount} image(s) matching pattern "${input.glob}", returning top ${n} matches for: "${input.query}"`,
      doable: true,
    };
  },
  do: async (input, { ai, cwd, config, chatStatus }) => {
    const maxImages = input.maxImages || 100;
    const n = input.n || 5;
    const files = await searchFiles(cwd, input.glob);
    const images = files.filter(f => f.fileType === 'image').slice(0, maxImages);

    if (images.length === 0) {
      return {
        searched: 0,
        results: [],
      };
    }

    // Perferred search method is to use image embeddings and cosine similarity
    // Not all providers have an image embedding model.
    const embedModel = config.getData().user.models?.imageEmbed;
    const embeddingModels: ScoredModel[] = []; // ai.models.search({ required: ['embedding', 'vision'] });

    // If we have a suitable image embedding model, use that
    if ((embedModel && embeddingModels.find(m => m.model.id === embedModel)) || embeddingModels.length > 0) {
      throw new Error('Image embedding search not yet implemented');
    } else {
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
      const chunks = chunkArray(imagesValid, CONSTS.EMBED_CHUNK_SIZE);

      // Track embedding progress
      let embeddedCount = 0;
      chatStatus(`Step 2/3: Embedding descriptions...`);

      // Embed descriptions in chunks
      const imagesEmbeddedChunks = await Promise.all(chunks.map(async (chunk, chunkIndex) => {
        const texts = chunk.map((d) => d.description);
        const embeddings = await ai.embed.get({ texts });

        embeddedCount += chunk.length;
        chatStatus(`Step 2/3: Embedded ${embeddedCount}/${chunk.length} descriptions...`);

        return embeddings.embeddings.map(({ embedding, index }, i) => ({
          embedding,
          ...chunk[index],
        }));
      }));

      const imagesEmbedded = imagesEmbeddedChunks.flat();

      chatStatus(`Step 3/3: Scoring and selecting top ${n} images...`);

      // Score images by cosine similarity to prompt embedding
      const { embeddings: [{ embedding: promptEmbedding }] } = await ai.embed.get({ texts: [input.query] });

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
    }
  },
  render: (op, config, showInput, showOutput) => renderOperation(
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
  { attached: boolean }
>({
  mode: 'create',
  signature: 'image_attach({ path })',
  status: ({ path: imagePath }) => `Attaching image: ${paginateText(imagePath, 100, -100)}`,
  analyze: async ({ path: imagePath }, { cwd }) => {
    // Resolve path (supports both absolute and relative)
    const fullPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(cwd, imagePath);

    // Check if file exists and is readable
    const readable = await fileIsReadable(fullPath);
    if (!readable) {
      return {
        analysis: `This would fail - image file ${linkFile(imagePath)} not found or not readable.`,
        doable: false,
      };
    }

    return {
      analysis: `This will attach the image ${linkFile(imagePath)} to the chat as a user message.`,
      doable: true,
    };
  },
  do: async ({ path: imagePath }, { cwd, chatMessage }) => {
    // Resolve path (supports both absolute and relative)
    const fullPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(cwd, imagePath);
    const imageLink = linkFile(fullPath);

    // Add image to the chat message
    if (chatMessage) {
      chatMessage.content.push({ type: 'image', content: imageLink });
    }

    return { attached: true };
  },
  render: (op, config, showInput, showOutput) => renderOperation(
    op,
    `ImageAttach("${paginateText(op.input.path, 100, -100)}")`,
    (op) => {
      if (op.output?.attached) {
        return `Attached image: ${linkFile(op.input.path)}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

