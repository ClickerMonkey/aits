import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import XLSX from "xlsx";
import * as mammoth from "mammoth";
import * as yauzl from "yauzl";
import { fileTypeFromFile } from "file-type";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { Poppler } from "node-poppler";
import { RecursiveCharacterTextSplitter, SupportedTextSplitterLanguage, SupportedTextSplitterLanguages } from "@langchain/textsplitters";
import { glob } from "glob";


export interface FileOptions {
  assetPath: string;

  sections?: boolean;

  summarize?: boolean;
  extractImages?: boolean;
  transcribeImages?: boolean;
  describeImages?: boolean;
  renderPages?: boolean;

  summarizer?: (text: string) => Promise<string>;
  transcriber?: (base64Image: string) => Promise<string>;
  describer?: (base64Image: string) => Promise<string>;

  signal?: AbortSignal;
}

// Get environment variable with default fallback
const getEnvVar = (key: string, defaultValue: string): string => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
};

// Zip bomb protection constants
const ZIP_LIMITS = {
  MAX_FILES: 1000, // Maximum number of files in a zip
  MAX_TOTAL_SIZE: 100 * 1024 * 1024, // 100MB total uncompressed size
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB per file
  MAX_COMPRESSION_RATIO: 100, // Max compression ratio (uncompressed/compressed)
};

// File Processing Constants
const FILE_PROCESSING = {
  // Text chunking settings
  TEXT_CHUNK_SIZE: parseInt(getEnvVar('CLETUS_TEXT_CHUNK_SIZE', '2000')),
  TEXT_CHUNK_OVERLAP: parseInt(getEnvVar('CLETUS_TEXT_CHUNK_OVERLAP', '200')),

  // File size limits (in bytes)
  MAX_FILE_SIZE: parseInt(getEnvVar('CLETUS_MAX_FILE_SIZE', '10485760')), // 10MB default

  // Processing timeouts (in milliseconds)
  AI_PROCESSING_TIMEOUT: parseInt(getEnvVar('CLETUS_AI_PROCESSING_TIMEOUT', '30000')), // 30 seconds

  // Default file processing options
  DEFAULT_SUMMARIZE: getEnvVar('CLETUS_FILE_DEFAULT_SUMMARIZE', 'true') === 'true',
  DEFAULT_EXTRACT_IMAGES: getEnvVar('CLETUS_FILE_DEFAULT_EXTRACT_IMAGES', 'true') === 'true',
  DEFAULT_TRANSCRIBE_IMAGES: getEnvVar('CLETUS_FILE_DEFAULT_TRANSCRIBE_IMAGES', 'true') === 'true',
  DEFAULT_DESCRIBE_IMAGES: getEnvVar('CLETUS_FILE_DEFAULT_DESCRIBE_IMAGES', 'true') === 'true',
  DEFAULT_RENDER_PAGES: getEnvVar('CLETUS_FILE_DEFAULT_RENDER_PAGES', 'true') === 'true',
};

const DEFAULT_FILE_OPTIONS: Partial<FileOptions> = {
  summarize: FILE_PROCESSING.DEFAULT_SUMMARIZE,
  extractImages: FILE_PROCESSING.DEFAULT_EXTRACT_IMAGES,
  transcribeImages: FILE_PROCESSING.DEFAULT_TRANSCRIBE_IMAGES,
  describeImages: FILE_PROCESSING.DEFAULT_DESCRIBE_IMAGES,
  renderPages: FILE_PROCESSING.DEFAULT_RENDER_PAGES,
};

type ProcessResultChild = {
  filePath: string;
  fileName: string;
  originalName?: string;
  overrideOptions?: Partial<FileOptions>;
  mimeType: string;
  size: number;
  useSections?: boolean;
}

type ProcessResult = {
  error?: any;
  sections?: string[];
  description?: string; // file description to update in database
  childSections?: boolean; // if true, use children files as source for sections instead of this file
  children?: ProcessResultChild[]; // additional files to process, like if it was an unzipped zip file or a file with images
}

type ProcessingResultWithSections = { description?: string; sections: string[] };

/**
 * Split text using language-specific or general RecursiveCharacterTextSplitter
 */
export async function splitTextIntoSections(text: string, targetSize: number = FILE_PROCESSING.TEXT_CHUNK_SIZE, overlap: number = FILE_PROCESSING.TEXT_CHUNK_OVERLAP, fileName?: string): Promise<string[]> {
  try {
    let splitter: RecursiveCharacterTextSplitter;
    
    // Try to detect language for language-specific splitting
    if (fileName) {
      const detectedLanguage = detectLanguageFromFileName(fileName);
      if (detectedLanguage && SupportedTextSplitterLanguages.includes(detectedLanguage as any)) {
        splitter = RecursiveCharacterTextSplitter.fromLanguage(detectedLanguage, {
          chunkSize: targetSize,
          chunkOverlap: overlap,
        });
      } else {
        // Use general splitter for unknown file types
        splitter = new RecursiveCharacterTextSplitter({
          chunkSize: targetSize,
          chunkOverlap: overlap,
        });
      }
    } else {
      // Use general splitter when no filename provided
      splitter = new RecursiveCharacterTextSplitter({
        chunkSize: targetSize,
        chunkOverlap: overlap,
      });
    }
    
    // Split the text into sections
    const sections = await splitter.splitText(text);
    
    // Filter out empty sections
    const filteredSections = sections
      .map(section => section.trim())
      .filter(section => section.length > 0);
    
    return filteredSections.length > 0 ? filteredSections : [text];
    
  } catch (error) {
    // If splitting fails, fall back to legacy splitting
    console.warn("Text splitting failed, using fallback method:", error);
    return splitTextIntoSectionsSync(text, targetSize, overlap);
  }
}

/**
 * Legacy synchronous version for backward compatibility
 */
function splitTextIntoSectionsSync(text: string, targetSize: number = FILE_PROCESSING.TEXT_CHUNK_SIZE, overlap: number = FILE_PROCESSING.TEXT_CHUNK_OVERLAP): string[] {
  if (text.length <= targetSize) {
    return [text];
  }

  const sections: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + targetSize;
    
    if (end >= text.length) {
      end = text.length;
    } else {
      // Try to find a good breaking point (sentence end, paragraph, etc.)
      const searchEnd = Math.min(end + 100, text.length);
      let bestBreak = end;
      
      // Look for sentence endings
      for (let i = end; i < searchEnd; i++) {
        if (text[i] === '.' || text[i] === '!' || text[i] === '?') {
          if (i + 1 < text.length && text[i + 1] === ' ') {
            bestBreak = i + 1;
            break;
          }
        }
      }
      
      // Look for paragraph breaks
      for (let i = end; i < searchEnd; i++) {
        if (text[i] === '\n' && (i + 1 >= text.length || text[i + 1] === '\n')) {
          bestBreak = i + 1;
          break;
        }
      }
      
      end = bestBreak;
    }

    const section = text.slice(start, end).trim();
    if (section.length > 0) {
      sections.push(section);
    }

    start = end - overlap;
    if (start <= 0) start = end;
  }

  return sections;
}

async function processXlsxFile(
  filePath: string,
  fileName: string,
  options: FileOptions,
): Promise<ProcessResult> {
  try {
    // Read the XLSX file
    const workbook = XLSX.readFile(filePath);
    const sections: string[] = [];
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert sheet to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, // Use first row as header
        defval: '', // Default value for empty cells
        raw: false // Convert all values to strings
      });
      
      if (jsonData.length === 0) {
        continue;
      }
      
      // Get headers from first row
      const headers = jsonData[0] as string[];
      if (headers.length === 0) {
        continue;
      }
      
      // Process each data row (skip header row)
      for (let rowIndex = 1; rowIndex < jsonData.length; rowIndex++) {
        const row = jsonData[rowIndex] as string[];
        
        // Skip empty rows
        if (row.every(cell => !cell || cell.toString().trim() === '')) {
          continue;
        }
        
        // Create object from headers and row data
        const rowObject: Record<string, string> = {};
        headers.forEach((header, colIndex) => {
          const cellValue = row[colIndex] || '';
          if (header && header.trim()) {
            rowObject[header.trim()] = cellValue.toString().trim();
          }
        });
        
        // Convert row to readable text for knowledge extraction
        const rowText = Object.entries(rowObject)
          .filter(([key, value]) => key && value)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        
        if (rowText.trim()) {
          const knowledgeText = `Sheet: ${sheetName}, Row ${rowIndex}: ${rowText}`;
          sections.push(knowledgeText);
        }
      }
    }
    
    if (sections.length === 0) {
      return { sections: [] };
    }
    
    return { sections };
    
  } catch (error) {
    return { error };
  }
}

/**
 * General file type categories
 */
export type FileType = 'image' | 'pdf' | 'docx' | 'xlsx' | 'zip' | 'text' | 'unknown';

/**
 * Categorize file based on detected or filename extension
 * 
 * @param filePath - Path to the file
 * @param fileName - Original filename
 * @returns 
 */
export async function categorizeFile(filePath: string, fileName: string = filePath): Promise<FileType> {
  // Use detected extension or fall back to filename extension
  const fileExtension = await detectExtension(filePath, fileName);

  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg'].includes(fileExtension)) {
    return 'image';
  } else if (fileExtension === 'pdf') {
    return 'pdf';
  } else if (['docx', 'doc'].includes(fileExtension)) {
    return 'docx';
  } else if (['xlsx', 'xls'].includes(fileExtension)) {
    return 'xlsx';
  } else if (fileExtension === 'zip') {
    return 'zip';
  } else if (
    ['txt', 'md', 'markdown', 'html', 'htm', 'xml', 'csv', 'json', 'js', 'ts', 'jsx', 'tsx',
      'py', 'java', 'cpp', 'c', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt',
      'scala', 'r', 'sql', 'sh', 'bash', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
      'log', 'rtf', 'tex', 'latex', 'rst', 'org', 'proto', 'sol', 'css', 'scss', 'less'].includes(fileExtension)
  ) {
    return 'text';
  } else {
    return 'unknown';
  }
}

/**
 * Search files in a directory matching a glob pattern
 * 
 * @param cwd - Current working directory
 * @param pattern - Glob pattern
 * @returns 
 */
export async function searchFiles(cwd: string, pattern: string, signal?: AbortSignal): Promise<{ file: string; fileType: FileType | 'unreadable' }[]> {
  const filePaths = await glob(pattern, { cwd, nocase: true, signal });
  const files = await Promise.all(filePaths.map(async (file) => ({
    file,
    fileType: await categorizeFile(path.join(cwd, file)).catch(() => 'unreadable') as FileType | 'unreadable',
  })));

  return files;
}

export async function processFile(
  filePath: string,
  fileName: string,
  fileOptions: FileOptions,
): Promise<ProcessingResultWithSections> {
  // Check if cancelled before starting
  if (fileOptions?.signal?.aborted) {
    throw new Error('Operation cancelled');
  }

  let result: ProcessingResultWithSections = {
    sections: [],
  };

  try {
    // Detect file type
    const fileType = await categorizeFile(filePath, fileName);

    // Process based on detected file extension
    let processResult: ProcessResult;

    // Merge fileOptions with defaults
    const options: FileOptions = {
      ...DEFAULT_FILE_OPTIONS,
      ...fileOptions,
    };

    switch (fileType) {
      case 'image':
        processResult = await processImageFile(filePath, fileName, options);
        break;
      case 'pdf':
        processResult = await processPdfFile(filePath, fileName, options);
        break;
      case 'docx':
        processResult = await processDocxFile(filePath, fileName, options);
        break;
      case 'xlsx':
        processResult = await processXlsxFile(filePath, fileName, options);
        break;
      case 'zip':
        processResult = await processZipFile(filePath, fileName, options);
        break;
      case 'text':
        processResult = await processTextFile(filePath, fileName, options);
        break;
      default:
        processResult = { error: `Unsupported file type: ${fileType}` };
    }

    result.sections = processResult.sections || [];

    // Handle processing errors
    if (processResult.error) {
      return result; // Return empty result on error
    }

    // Process sections as soon as we can.
    const processSections = async () => {
      // Generate description if enabled and needed
      if (options.summarize && !result.description && result.sections && result.sections.length > 0 && options.summarizer) {
        const text = result.sections.join("\n\n");
        if (text.trim().length > 0) {
          const description = await options.summarizer(text.trim());
          result.description = description;
        }
      }
    };

    if (!processResult.childSections) {
      await processSections();
    }

    // Record child sections if they were marked to be used.
    const childSections: string[] = [];

    // Process child files if any (e.g., from zip extraction)
    if (processResult.children && processResult.children.length > 0) {
      // Process each child file recursively
      await Promise.allSettled(processResult.children.map(async (childData) => {
        if (await fileIsReadable(childData.filePath)) {
          try {
            const childResult = await processFile(
              childData.filePath,
              childData.originalName || childData.fileName,
              childData.overrideOptions ? { // Pass file options to child files
                ...fileOptions,
                ...childData.overrideOptions,
              } : fileOptions,
            );

            if (childData.useSections && childResult.sections && childResult.sections.length > 0) {
              childSections.push(...childResult.sections);
            }
          } catch (childError) {
            console.error(`Failed to process child file ${childData.fileName}:`, { error: childError });
            // Continue processing other children even if one fails
          }
        }
      }));
    }

    // Inject in child sections if requested
    if (processResult.childSections) {
      processResult.sections = result.sections = childSections;

      await processSections();
    }

    return result;
  } catch (error) {    
    throw error;
  }
}

async function processImageFile(
  filePath: string,
  fileName: string,
  options: FileOptions,
): Promise<ProcessResult> {
  try {
    const imageBuffer = await fs.promises.readFile(filePath, { signal: options.signal });
    const base64Image = imageBuffer.toString("base64");

    const sections: string[] = [];
    let description: string | undefined;
    
    // Transcribe image to markdown if enabled
    if (options.transcribeImages && options.transcriber) {
      const mimeType = await detectMimeType(filePath, fileName);

      const transcription = await options.transcriber(`data:${mimeType};base64,${base64Image}`);

      sections.push(`# ${fileName}\n\n${transcription}`);
    }

    // Describe image content if enabled (not for rendered pages)
    if (options.describeImages && options.describer) {
      description = await options.describer(base64Image);

      // Only add description to sections if we didn't transcribe
      if (!options.transcribeImages) {
        const fullImageText = `Image: ${fileName}\n\n${description}`;
        if (options.sections) {
          const descriptionSections = await splitTextIntoSections(fullImageText, 800, 150, fileName + ".md");
          sections.push(...descriptionSections);
        } else {
          sections.push(fullImageText);
        }
      }
    }

    return { sections, description };
  } catch (error) {
    return { error };
  }
}

async function hasPoppler(): Promise<boolean> {
  try {
    new Poppler();
    return true;
  } catch {
    return false;
  }
}

async function processPdfFile(
  filePath: string,
  fileName: string,
  options: FileOptions,
): Promise<ProcessResult> {
  try {
    const processResult: ProcessResult = {
      sections: [],
      children: [],
    };
    const processing: Promise<void>[] = [];
    const pageChildren: ProcessResult['children'] = [];
    const embeddedChildren: ProcessResult['children'] = [];

    const canRenderPages = await hasPoppler();
    const renderPages = canRenderPages && options.renderPages && options.transcriber;

    // Only extract text if we're NOT rendering pages (since we'll get markdown from rendered pages)
    if (!renderPages) {
      // Read PDF file
      const pdfBuffer = await fs.promises.readFile(filePath, { signal: options.signal });
      const pdfData = await pdfParse(pdfBuffer);
      const pdfText = pdfData.text;

      // Extract text if available
      if (pdfText && pdfText.trim().length > 0) {
        // Clean and normalize the text
        const cleanedText = pdfText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();

        // Split into sections
        if (options.sections) {
          processResult.sections = await splitTextIntoSections(cleanedText);
        } else {
          processResult.sections = [cleanedText];
        }
      }
    }

    // Render pages if enabled
    if (renderPages) {
      try {
        const poppler = new Poppler();

        // Create a temporary directory for rendered pages
        const tempDir = path.join(path.dirname(filePath), `${path.basename(filePath, '.pdf')}_pages`);
        await fs.promises.mkdir(tempDir, { recursive: true });

        // Convert PDF pages to PNG images using node-poppler
        const outputPath = path.join(tempDir, 'page'); // Base name for output files
        await poppler.pdfToPpm(filePath, outputPath, {
          antialiasFonts: 'yes',
          pngFile: true,
          singleFile: false,
          resolutionXYAxis: 150,
          antialiasVectors: 'yes',
          quiet: true,
        });

        // Find all generated PNG files
        const renderedFiles = await fs.promises.readdir(tempDir);
        const pngFiles = renderedFiles
          .filter(f => f.endsWith('.png'))
          .sort((a, b) => {
            // Extract page numbers for proper sorting
            const aNum = parseInt(a.match(/-(\d+)\.png$/)?.[1] || '0');
            const bNum = parseInt(b.match(/-(\d+)\.png$/)?.[1] || '0');
            return aNum - bNum;
          });

        // Pre-allocate array to maintain order
        pageChildren.length = pngFiles.length;

        // Process all pages in parallel with transcription
        pngFiles.forEach((pngFile, index) => {
          processing.push((async () => {
            const pngPath = path.join(tempDir, pngFile);
            const stats = await fs.promises.stat(pngPath);

            // Add rendered page as child at specific index to maintain order
            pageChildren[index] = {
              filePath: pngPath,
              fileName: pngFile,
              originalName: `${fileName} - Page ${index + 1}`,
              mimeType: 'image/png',
              size: stats.size,
              overrideOptions: { transcribeImages: true }, // Force transcription for rendered pages
              useSections: true, // Use sections from rendered pages
            };
          })());
        });

        processResult.childSections = true; // Use child sections instead of parent
      } catch (error) {
        console.error(`Failed to render PDF pages for ${fileName}:`, error);
      }
    }

    // Extract embedded images if enabled
    if (options.extractImages && canRenderPages) {
      try {
        const poppler = new Poppler();

        // Create a temporary directory for extracted images
        const tempDir = path.join(options.assetPath, `${path.basename(filePath, '.pdf')}_images`);
        await fs.promises.mkdir(tempDir, { recursive: true });

        // Extract images using node-poppler
        const outputPath = path.join(tempDir, 'image')
        await poppler.pdfImages(filePath, outputPath, {
          pngFile: true,
        });

        // Find all extracted image files and sort them
        const extractedFiles = (await fs.promises.readdir(tempDir)).sort();

        // Pre-allocate array to maintain order
        embeddedChildren.length = extractedFiles.length;

        // Filter and process extracted images
        extractedFiles.forEach((imageFile, index) => {
          processing.push((async () => {
            if (options.signal?.aborted) {
              return;
            }

            const imagePath = path.join(tempDir, imageFile);

            try {
              const valid = await validateImage(imagePath);

              if (valid === false) {
                return;
              }

              const mimeType = await detectMimeType(imagePath, imageFile);

              // Add embedded image at specific index to maintain order
              embeddedChildren[index] = {
                filePath: imagePath,
                fileName: imageFile,
                originalName: `${fileName} - ${imageFile}`,
                mimeType: mimeType,
                size: valid.size,
                // useSections: true, // Use sections from extracted images
              };
            } catch (error) {
              // Try to clean up the file
              try {
                await fs.promises.unlink(imagePath);
              } catch {}
            }
          })());
        });

      } catch (error) {
        console.error(`Failed to extract images from PDF ${fileName}:`, error);
      }
    }

    await Promise.allSettled(processing);

    // Combine page children first, then embedded children to maintain order
    processResult.children = [
      ...pageChildren.filter(Boolean),
      ...embeddedChildren.filter(Boolean)
    ];

    return processResult;

  } catch (error) {
    console.error(`Failed to process PDF ${fileName}:`, { error }, error);
    return { error };
  }
}

async function processDocxFile(
  filePath: string,
  fileName: string,
  options: FileOptions,
): Promise<ProcessResult> {
  try {
    const processResult: ProcessResult = {
      sections: [],
      children: [],
      childSections: true,
    };
    const processing: Promise<void>[] = [];
    const imageChildren: ProcessResult['children'] = [];
    const parentFileName = path.basename(filePath).replace(/\.[^/.]+$/, "");
    const parentOriginalFileName = fileName.replace(/\.[^/.]+$/, "");
    let imageCount = 0;

    // Convert DOCX to HTML & images using mammoth
    const result = await mammoth.convertToHtml({ path: filePath }, {
      ignoreEmptyParagraphs: true,
      convertImage: mammoth.images.imgElement(async (image) => {
        // Only extract images if the option is enabled
        if (!options.extractImages) {
          return { src: '' }; // Skip image extraction
        }

        if (options.signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        const ext = image.contentType.split('/')[1];
        const imageIndex = imageCount++;
        const imageFileName = `${parentFileName}-${imageIndex}.${ext}`;
        const originalName = `${parentOriginalFileName}-${imageIndex}.${ext}`;
        const imageFilePath = path.join(options.assetPath, imageFileName);

        processing.push((async () => {
          if (options.signal?.aborted) {
            throw new Error('Operation cancelled');
          }
          try {
            await fs.promises.writeFile(
              imageFilePath, 
              await image.readAsBuffer(),
              { signal: options.signal }
            );
            const mimeType = await detectMimeType(imageFilePath, imageFileName);
            const size = (await fs.promises.stat(imageFilePath)).size;

            // Add image at specific index to maintain order
            imageChildren[imageIndex] = {
              fileName: imageFileName,
              originalName,
              filePath: imageFilePath,
              mimeType,
              size,
              useSections: true, // Use sections from extracted images
            };
          } catch (error) {
            console.error(`Failed to process image in DOCX ${fileName}:`, { error }, error);
          }
        })());

        return { src: imageFileName };
      }),
    });

    // Convert HTML content to Markdown and convert that to a file.
    const htmlContent = result.value;
    
    if (!htmlContent || htmlContent.trim().length === 0) {
      return processResult;
    }

    let markdownChild: ProcessResultChild | undefined;
    processing.push((async () => {
      const markdownContent = NodeHtmlMarkdown.translate(htmlContent);
      const markdownFileName = `${parentFileName}.md`;
      const markdownOriginalName = `${parentOriginalFileName}.md`;
      const markdownFilePath = path.join(options.assetPath, markdownFileName);

      await fs.promises.writeFile(
        markdownFilePath, 
        markdownContent, 
        { signal: options.signal }
      );

      markdownChild = {
        fileName: markdownFileName,
        filePath: markdownFilePath,
        originalName: markdownOriginalName,
        mimeType: 'text/markdown',
        size: markdownContent.length,
        useSections: true, // Use sections from markdown
      };
    })());

    await Promise.allSettled(processing);

    // Combine image children first, then markdown to maintain order
    processResult.children = [
      ...imageChildren.filter(Boolean),
      ...(markdownChild ? [markdownChild] : [])
    ];

    return processResult;

  } catch (error) {
    return { error };
  }
}

async function processTextFile(
  filePath: string,
  fileName: string,
  options: FileOptions,
): Promise<ProcessResult> {
  try {
    // Read and process text file
    const textContent = await fs.promises.readFile(filePath, { signal: options.signal, encoding: "utf-8" });
    
    // Use language-specific splitting based on file extension
    const sections = options.sections
      ? await splitTextIntoSections(textContent, FILE_PROCESSING.TEXT_CHUNK_SIZE, FILE_PROCESSING.TEXT_CHUNK_OVERLAP, fileName)
      : [textContent];
      
    return { sections };
  } catch (error) {
    return { error };
  }
}

async function processZipFile(
  filePath: string,
  fileName: string,
  options: FileOptions,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const processResult: ProcessResult = {
      sections: [],
      children: [],
    };
    let totalUncompressedSize = 0;
    let fileCount = 0;

    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        return resolve({ error: `Failed to open zip file: ${err.message}` });
      }

      if (!zipfile) {
        return resolve({ error: "Invalid zip file" });
      }

      if (options.signal?.aborted) {
        zipfile.close();
        return resolve({ error: "Operation cancelled" });
      }

      zipfile.readEntry();

      zipfile.on("entry", (entry) => {
        fileCount++;

        // Check file count limit
        if (fileCount > ZIP_LIMITS.MAX_FILES) {
          zipfile.close();
          return resolve({ error: `Zip file contains too many files (max: ${ZIP_LIMITS.MAX_FILES})` });
        }

        // Skip directories
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        // Check compression ratio for zip bomb detection
        const compressionRatio = entry.uncompressedSize / entry.compressedSize;
        if (compressionRatio > ZIP_LIMITS.MAX_COMPRESSION_RATIO) {
          zipfile.close();
          return resolve({ error: `Suspicious compression ratio detected (potential zip bomb)` });
        }

        // Check individual file size
        if (entry.uncompressedSize > ZIP_LIMITS.MAX_FILE_SIZE) {
          zipfile.close();
          return resolve({ error: `File in zip exceeds size limit: ${entry.fileName}` });
        }

        // Check total uncompressed size
        totalUncompressedSize += entry.uncompressedSize;
        if (totalUncompressedSize > ZIP_LIMITS.MAX_TOTAL_SIZE) {
          zipfile.close();
          return resolve({ error: `Zip file total size exceeds limit (max: ${Math.round(ZIP_LIMITS.MAX_TOTAL_SIZE / 1024 / 1024)}MB)` });
        }

        // Extract the file
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            zipfile.readEntry();
            return;
          }

          if (!readStream) {
            zipfile.readEntry();
            return;
          }

          if (options.signal?.aborted) {
            readStream.destroy();
            zipfile.close();
            return resolve({ error: "Operation cancelled" });
          }

          // Generate unique filename to avoid conflicts
          const timestamp = Date.now();
          const randomId = Math.floor(Math.random() * 1000000);
          const sanitizedName = entry.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
          const extractedFileName = `${timestamp}-${randomId}-${sanitizedName}`;
          const extractedPath = path.join('uploads', extractedFileName);

          const writeStream = fs.createWriteStream(extractedPath);
          let extractedSize = 0;

          readStream.on('data', (chunk) => {
            extractedSize += chunk.length;
            // Double-check size during extraction
            if (extractedSize > ZIP_LIMITS.MAX_FILE_SIZE) {
              readStream.destroy();
              writeStream.destroy();
              fs.unlink(extractedPath, () => {});
              zipfile.close();
              return resolve({ error: `File size limit exceeded during extraction: ${entry.fileName}` });
            }
          });

          readStream.on('end', async () => {
            writeStream.end();

            const mimeType = await detectMimeType(extractedPath, sanitizedName);

            processResult.children!.push({
              filePath: extractedPath,
              fileName: sanitizedName,
              mimeType: mimeType,
              size: extractedSize
            });
            zipfile.readEntry();
          });

          readStream.on('error', (err) => {
            writeStream.destroy();
            fs.unlink(extractedPath, () => {});
            zipfile.readEntry();
          });

          readStream.pipe(writeStream);
        });
      });

      zipfile.on("end", () => {
        resolve(processResult);
      });

      zipfile.on("error", (err) => {
        resolve({ error: `Error processing zip file: ${err.message}` });
      });
    });
  });
}

/**
 * Check if an extracted image is applicable (not too small or single color)
 * 
 * @param imagePath 
 * @returns 
 */
async function validateImage(imagePath: string): Promise<{ size: number, width: number, height: number } | false> {
  try {
    // Lazy-load sharp to avoid loading it on startup
    const sharp = (await import("sharp")).default;
    
    // Get image dimensions using sharp
    const metadata = await sharp(imagePath).metadata();
    
    // Skip small images (either dimension < 32px)
    if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32) {
      fs.promises.unlink(imagePath);  // don't wait for it

      return false;
    }

    // Check if image is single color by reading a sample of pixels
    const stats = await fs.promises.stat(imagePath);

    // Calculate expected minimum size for a real image (very rough heuristic)
    const pixelCount = metadata.width * metadata.height;
    const bytesPerPixel = stats.size / pixelCount;

    // If the image compresses to less than 0.05 bytes per pixel, it's likely single color or very simple
    if (bytesPerPixel < 0.05) {
      fs.promises.unlink(imagePath); // don't wait for it

      return false;
    }

    return { size: stats.size, width: metadata.width, height: metadata.height };
  } catch (error) {
    return false;
  }
}

/**
 * Detect file extension from content or fallback to filename extension
 */
export async function detectExtension(
  filePath: string, 
  fileName: string,
): Promise<string> {
  let detectedExtension: string | undefined;
  try {
    const detectedType = await fileTypeFromFile(filePath);
    detectedExtension = detectedType?.ext;
  } catch (error) {
    // Ignore detection errors
  }
  
  // Use detected extension or fall back to filename extension
  const originalExtension = path.extname(fileName).slice(1).toLowerCase();
  const fileExtension = detectedExtension || originalExtension;
  
  return fileExtension;
}

/**
 * Check if a file is an audio file based on its extension
 */
export async function isAudioFile(filePath: string, fileName: string = filePath): Promise<boolean> {
  const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'];
  const ext = await detectExtension(filePath, fileName);
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Detect MIME type from file content or fallback to file extension
 */
export async function detectMimeType(
  filePath: string, 
  fileName: string,
): Promise<string> {
  // Detect MIME type of extracted file
  let detectedMimeType = 'application/octet-stream';
  try {
    const detectedType = await fileTypeFromFile(filePath);
    if (detectedType) {
      detectedMimeType = detectedType.mime;
    } else {
      // Fallback MIME type detection based on file extension
      const ext = path.extname(fileName).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
      };
      detectedMimeType = mimeMap[ext] || 'application/octet-stream';
    }
  } catch (error) {
    console.warn(`Failed to detect MIME type for ${fileName}, using default`);
  }

  return detectedMimeType;
}

/**
 * Detect programming language from file extension
 */
function detectLanguageFromFileName(fileName: string): SupportedTextSplitterLanguage | null {
  const extension = path.extname(fileName).toLowerCase();
  
  // Map file extensions to supported languages (using lowercase strings)
  const extensionToLanguage: Record<string, SupportedTextSplitterLanguage> = {
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c++': 'cpp',
    '.hpp': 'cpp',
    '.hxx': 'cpp',
    '.h++': 'cpp',
    '.c': 'cpp',
    '.h': 'cpp',
    '.go': 'go',
    '.java': 'java',
    '.js': 'js',
    '.jsx': 'js',
    '.ts': 'js',
    '.tsx': 'js',
    '.mjs': 'js',
    '.php': 'php',
    '.proto': 'proto',
    '.py': 'python',
    '.pyx': 'python',
    '.pyw': 'python',
    '.rst': 'rst',
    '.rb': 'ruby',
    '.rbw': 'ruby',
    '.rs': 'rust',
    '.scala': 'scala',
    '.sc': 'scala',
    '.swift': 'swift',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.tex': 'latex',
    '.latex': 'latex',
    '.html': 'html',
    '.htm': 'html',
    '.xml': 'html',
    '.sol': 'sol',
  };
  
  return extensionToLanguage[extension] || null;
}

/**
 * Check if file exists
 * @param filePath 
 * @returns 
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if file is readable
 * 
 * @param filePath - Path to the file
 * @returns 
 */
export async function fileIsReadable(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if file is writable
 * 
 * @param filePath - Path to the file
 * @returns 
 */
export async function fileIsWritable(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}

export async function fileIsDeletable(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if path exists and is a directory
 * 
 * @param filePath - Path to check
 * @returns 
 */
export async function fileIsDirectory(filePath: string): Promise<{ exists: boolean, isDirectory: boolean}> {
  try {
    const stats = await fs.promises.stat(filePath);
    return { exists: true, isDirectory: stats.isDirectory() };
  } catch (e) {
    return { exists: false, isDirectory: true };
  }
}