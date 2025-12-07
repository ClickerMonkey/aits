import puppeteer from 'puppeteer';
import { tavily } from '@tavily/core';
import fs from 'fs';
import path from 'path';
import { abbreviate } from '../common';
import { operationOf } from './types';
import { renderOperation } from '../helpers/render';
import { detectExtension } from '../helpers/files';

// ============================================================================
// Web Search
// ============================================================================

export const web_search = operationOf<
  { query: string; maxResults?: number },
  { query: string; results: Array<{ title: string; url: string; content: string }> }
>({
  mode: 'read',
  signature: 'web_search(query: string, maxResults?: number)',
  status: (input) => `Searching web: ${abbreviate(input.query, 35)}`,
  analyze: async ({ input }, { config }) => {
    const tavilyConfig = config.getData().tavily;
    
    if (!tavilyConfig?.apiKey) {
      return {
        analysis: 'This would fail - Tavily API key not configured. Please add it in Settings > Tavily.',
        doable: false,
      };
    }

    return {
      analysis: `This will search the web for "${input.query}" and return up to ${input.maxResults || 5} results.`,
      doable: true,
    };
  },
  do: async ({ input }, { config, signal }) => {
    const tavilyConfig = config.getData().tavily;

    if (!tavilyConfig?.apiKey) {
      throw new Error('Tavily API key not configured');
    }

    // Check if operation was cancelled
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    const client = tavily({ apiKey: tavilyConfig.apiKey });

    const response = await client.search(input.query, {
      maxResults: input.maxResults || 5,
    });

    const results = response.results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
    }));

    return {
      query: input.query,
      results,
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `WebSearch("${abbreviate(op.input.query, 30)}")`,
    (op) => {
      if (op.output) {
        return `Found ${op.output.results.length} result${op.output.results.length !== 1 ? 's' : ''}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

// ============================================================================
// Web Get Page
// ============================================================================

export const web_get_page = operationOf<
  { url: string; type: 'html' | 'text'; regex?: string; surrounding?: number; lineStart?: number; lineEnd?: number },
  { url: string; totalLines: number; content: string; matches?: string[] }
>({
  mode: 'read',
  signature: 'web_get_page(url: string, type: "html" | "text", regex?, surrounding?, lineStart?, lineEnd?)',
  status: (input) => `Fetching page: ${abbreviate(input.url, 35)}`,
  analyze: async ({ input }) => {
    const parts: string[] = [`This will fetch the ${input.type} content from "${input.url}"`];
    
    // Validate URL
    try {
      new URL(input.url);
    } catch {
      return {
        analysis: `This would fail - "${input.url}" is not a valid URL.`,
        doable: false,
      };
    }

    // Validate regex if provided
    if (input.regex) {
      try {
        new RegExp(input.regex, 'gi');
        parts.push(`and search for pattern "${input.regex}" with ${input.surrounding || 0} surrounding lines`);
      } catch (e) {
        return {
          analysis: `This would fail - Invalid regex pattern: ${e instanceof Error ? e.message : 'unknown error'}`,
          doable: false,
        };
      }
    }
    
    // Validate line ranges
    if (input.lineStart !== undefined || input.lineEnd !== undefined) {
      if (input.lineStart !== undefined && input.lineStart < 1) {
        return {
          analysis: 'This would fail - lineStart must be greater than or equal to 1.',
          doable: false,
        };
      }
      if (input.lineEnd !== undefined && input.lineEnd < 1) {
        return {
          analysis: 'This would fail - lineEnd must be greater than or equal to 1.',
          doable: false,
        };
      }
      if (input.lineStart !== undefined && input.lineEnd !== undefined && input.lineStart > input.lineEnd) {
        return {
          analysis: 'This would fail - lineStart must be less than or equal to lineEnd.',
          doable: false,
        };
      }
      
      const start = input.lineStart || 1;
      const end = input.lineEnd ? ` to ${input.lineEnd}` : '+';
      parts.push(`from line ${start}${end}`);
    }

    return {
      analysis: parts.join(' ') + '.',
      doable: true,
    };
  },
  do: async ({ input }, { signal }) => {
    // Check if operation was cancelled before starting
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      // Check signal after browser launch
      if (signal?.aborted) {
        await browser.close();
        throw new Error('Operation cancelled');
      }

      const page = await browser.newPage();

      // Set user agent to avoid being blocked
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Check signal before navigation
      if (signal?.aborted) {
        await browser.close();
        throw new Error('Operation cancelled');
      }

      await page.goto(input.url, {
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: 30000,
        signal,
      });

      let content: string;
      if (input.type === 'html') {
        content = await page.content();
      } else {
        content = await page.$eval('body', el => el.textContent || '');
      }

      const lines = content.split('\n');
      const totalLines = lines.length;
      let resultContent = content;
      let matches: string[] | undefined;

      // Apply regex filtering if provided
      if (input.regex) {
        const regex = new RegExp(input.regex, 'gi');
        const surrounding = input.surrounding || 0;
        const matchedLines = new Set<number>();
        matches = [];

        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches!.push(line);
            // Add the matching line and surrounding lines
            for (let i = Math.max(0, index - surrounding); i <= Math.min(lines.length - 1, index + surrounding); i++) {
              matchedLines.add(i);
            }
          }
        });

        // Build result from matched lines
        const sortedLines = Array.from(matchedLines).sort((a, b) => a - b);
        resultContent = sortedLines.map(i => lines[i]).join('\n');
        
        // Apply line range on top of regex results if provided
        if (input.lineStart !== undefined || input.lineEnd !== undefined) {
          const resultLines = resultContent.split('\n');
          const start = Math.max(0, (input.lineStart || 1) - 1);
          const end = input.lineEnd !== undefined ? Math.min(resultLines.length, input.lineEnd) : resultLines.length;
          resultContent = resultLines.slice(start, end).join('\n');
        }
      } 
      // Apply line range if provided and no regex
      else if (input.lineStart !== undefined || input.lineEnd !== undefined) {
        const start = Math.max(0, (input.lineStart || 1) - 1);
        const end = input.lineEnd !== undefined ? Math.min(lines.length, input.lineEnd) : lines.length;
        resultContent = lines.slice(start, end).join('\n');
      }

      return {
        url: input.url,
        totalLines,
        content: resultContent,
        matches,
      };
    } finally {
      await browser.close();
    }
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `WebGetPage("${abbreviate(op.input.url, 30)}", ${op.input.type})`,
    (op) => {
      if (op.output) {
        const parts: string[] = [`${op.output.totalLines} lines`];
        if (op.output.matches) {
          parts.push(`${op.output.matches.length} matches`);
        }
        return parts.join(', ');
      }
      return null;
    },
    showInput, showOutput
  ),
});

// ============================================================================
// Web API Call
// ============================================================================

export const web_api_call = operationOf<
  { 
    url: string; 
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'; 
    headers?: Record<string, string>; 
    body?: string;
    requestType?: 'json' | 'text' | 'binary';
    responseType?: 'json' | 'text' | 'binary';
  },
  { status: number; statusText: string; headers: Record<string, string>; body: string }
>({
  mode: 'read',
  signature: 'web_api_call(url: string, method: string, headers?, body?, requestType?, responseType?)',
  status: (input) => `API ${input.method}: ${abbreviate(input.url, 35)}`,
  analyze: async ({ input }) => {
    // Validate URL
    try {
      new URL(input.url);
    } catch {
      return {
        analysis: `This would fail - "${input.url}" is not a valid URL.`,
        doable: false,
      };
    }

    const parts: string[] = [`This will make a ${input.method} request to "${input.url}"`];
    
    if (input.headers && Object.keys(input.headers).length > 0) {
      parts.push(`with ${Object.keys(input.headers).length} header(s)`);
    }
    
    if (input.body) {
      const reqType = input.requestType || 'text';
      parts.push(`and ${reqType} request body`);
    }

    if (input.responseType) {
      parts.push(`expecting ${input.responseType} response`);
    }

    return {
      analysis: parts.join(' ') + '.',
      doable: true,
    };
  },
  do: async ({ input }, { signal }) => {
    const headers: Record<string, string> = { ...(input.headers || {}) };

    // Set appropriate Content-Type header based on requestType
    if (input.body && ['POST', 'PUT', 'PATCH'].includes(input.method)) {
      const requestType = input.requestType || 'text';
      if (requestType === 'json' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      } else if (requestType === 'binary' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/octet-stream';
      } else if (requestType === 'text' && !headers['Content-Type']) {
        headers['Content-Type'] = 'text/plain';
      }
    }

    const options: RequestInit = {
      method: input.method,
      headers,
      signal,
    };

    if (input.body && ['POST', 'PUT', 'PATCH'].includes(input.method)) {
      options.body = input.body;
    }

    const response = await fetch(input.url, options);
    
    // Parse response based on responseType
    const responseType = input.responseType || 'text';
    let responseBody: string;
    
    if (responseType === 'json') {
      try {
        const json = await response.json();
        responseBody = JSON.stringify(json, null, 2);
      } catch {
        // Fall back to text if JSON parsing fails
        responseBody = await response.text();
      }
    } else if (responseType === 'binary') {
      const arrayBuffer = await response.arrayBuffer();
      responseBody = Buffer.from(arrayBuffer).toString('base64');
    } else {
      responseBody = await response.text();
    }

    // Convert Headers object to plain object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
    };
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `WebApiCall(${op.input.method} "${abbreviate(op.input.url, 60)}")`,
    (op) => {
      if (op.output) {
        return `${op.output.status} ${op.output.statusText} (${op.output.body.length} bytes)`;
      }
      return null;
    },
    showInput, showOutput
  ),
});

// ============================================================================
// Web Download
// ============================================================================

export const web_download = operationOf<
  { url: string; target: string },
  { path: string; size: number; extension: string }
>({
  mode: 'create',
  signature: 'web_download(url: string, target: string)',
  status: (input) => `Downloading: ${abbreviate(input.url, 35)}`,
  analyze: async ({ input }) => {
    // Validate URL
    try {
      new URL(input.url);
    } catch {
      return {
        analysis: `This would fail - "${input.url}" is not a valid URL.`,
        doable: false,
      };
    }

    // Validate target path
    if (!input.target || input.target.trim() === '') {
      return {
        analysis: 'This would fail - target path cannot be empty.',
        doable: false,
      };
    }

    // Check if target path is absolute or relative
    const targetPath = path.isAbsolute(input.target) ? input.target : path.resolve(input.target);
    
    // Check if parent directory exists
    const parentDir = path.dirname(targetPath);
    try {
      await fs.promises.access(parentDir, fs.constants.W_OK);
    } catch {
      return {
        analysis: `This would fail - parent directory "${parentDir}" does not exist or is not writable.`,
        doable: false,
      };
    }

    // Check if file already exists at the target path
    try {
      await fs.promises.access(targetPath, fs.constants.F_OK);
      return {
        analysis: `This would fail - file already exists at "${targetPath}". Please specify a different target path.`,
        doable: false,
      };
    } catch {
      // File doesn't exist, which is what we want
    }

    return {
      analysis: `This will download the file from "${input.url}" and save it to "${targetPath}"${!path.extname(targetPath) ? ' (extension will be auto-detected if needed)' : ''}.`,
      doable: true,
    };
  },
  do: async ({ input }, { signal }) => {
    // Check if operation was cancelled
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // Resolve target path
    const targetPath = path.isAbsolute(input.target) ? input.target : path.resolve(input.target);

    // Download the file
    const response = await fetch(input.url, { signal });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    // Check signal after fetch
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // Get the response body as array buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check signal before writing
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // Write to a temporary file first
    const tempPath = `${targetPath}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, buffer);

      // Parse URL once for reuse
      const parsedUrl = new URL(input.url);
      
      // Detect extension from the downloaded content
      let extension = '';
      try {
        // Use the URL's pathname as the filename hint for extension detection
        const urlFilename = path.basename(parsedUrl.pathname);
        extension = await detectExtension(tempPath, urlFilename);
      } catch (error) {
        // If detection fails, try to get extension from URL or target path
        const urlExt = path.extname(parsedUrl.pathname).slice(1).toLowerCase();
        const targetExt = path.extname(targetPath).slice(1).toLowerCase();
        extension = urlExt || targetExt || 'bin';
      }

      // If the target path doesn't have an extension, add the detected one
      let finalPath = targetPath;
      if (!path.extname(targetPath) && extension) {
        finalPath = `${targetPath}.${extension}`;
        
        // Check if the file with extension already exists
        try {
          await fs.promises.access(finalPath, fs.constants.F_OK);
          // File exists, throw error
          throw new Error(`File already exists at "${finalPath}". Please specify a different target path or include the extension.`);
        } catch (error: any) {
          // If error is ENOENT, file doesn't exist (what we want)
          if (error.code === 'ENOENT') {
            // File doesn't exist, continue
          } else {
            // Re-throw any other error (including our custom error)
            throw error;
          }
        }
      }

      // Move temp file to final location
      await fs.promises.rename(tempPath, finalPath);

      // Get file size
      const stats = await fs.promises.stat(finalPath);

      return {
        path: finalPath,
        size: stats.size,
        extension,
      };
    } catch (error) {
      // Clean up temporary file on error
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  },
  render: (op, ai, showInput, showOutput) => renderOperation(
    op,
    `WebDownload("${abbreviate(op.input.url, 30)}")`,
    (op) => {
      if (op.output) {
        const sizeKB = (op.output.size / 1024).toFixed(2);
        return `${sizeKB} KB saved to ${path.basename(op.output.path)}`;
      }
      return null;
    },
    showInput, showOutput
  ),
});
