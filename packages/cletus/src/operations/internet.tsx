import puppeteer from 'puppeteer';
import { abbreviate } from '../common';
import { operationOf } from './types';
import { renderOperation } from '../helpers/render';

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
  analyze: async (input, { config }) => {
    const tavilyConfig = config.getData().providers.tavily;
    
    if (!tavilyConfig?.apiKey) {
      return {
        analysis: 'This would fail - Tavily API key not configured. Please add it in Settings > Manage Providers.',
        doable: false,
      };
    }

    return {
      analysis: `This will search the web for "${input.query}" and return up to ${input.maxResults || 5} results.`,
      doable: true,
    };
  },
  do: async (input, { config }) => {
    const tavilyConfig = config.getData().providers.tavily;
    
    if (!tavilyConfig?.apiKey) {
      throw new Error('Tavily API key not configured');
    }

    // Dynamically import tavily to avoid issues if not installed
    const { tavily } = await import('@tavily/core');
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
  render: (op) => renderOperation(
    op,
    `WebSearch("${abbreviate(op.input.query, 30)}")`,
    (op) => {
      if (op.output) {
        return `Found ${op.output.results.length} result${op.output.results.length !== 1 ? 's' : ''}`;
      }
      return null;
    }
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
  analyze: async (input) => {
    const parts: string[] = [`This will fetch the ${input.type} content from "${input.url}"`];
    
    if (input.regex) {
      parts.push(`and search for pattern "${input.regex}" with ${input.surrounding || 0} surrounding lines`);
    } else if (input.lineStart || input.lineEnd) {
      const start = input.lineStart || 1;
      const end = input.lineEnd ? ` to ${input.lineEnd}` : '+';
      parts.push(`from line ${start}${end}`);
    }

    return {
      analysis: parts.join(' ') + '.',
      doable: true,
    };
  },
  do: async (input) => {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.goto(input.url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      let content: string;
      if (input.type === 'html') {
        content = await page.content();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content = await page.evaluate(() => (globalThis as any).document.body.textContent || '');
      }

      const lines = content.split('\n');
      const totalLines = lines.length;
      let resultContent = content;
      let matches: string[] | undefined;

      // Apply regex filtering if provided
      if (input.regex) {
        const regex = new RegExp(input.regex, 'g');
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
      } 
      // Apply line range if provided
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
  render: (op) => renderOperation(
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
    }
  ),
});

// ============================================================================
// Web API Call
// ============================================================================

export const web_api_call = operationOf<
  { url: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'; headers?: Record<string, string>; body?: string },
  { url: string; method: string; status: number; statusText: string; headers: Record<string, string>; body: string }
>({
  mode: 'read',
  signature: 'web_api_call(url: string, method: string, headers?, body?)',
  status: (input) => `API ${input.method}: ${abbreviate(input.url, 35)}`,
  analyze: async (input) => {
    const parts: string[] = [`This will make a ${input.method} request to "${input.url}"`];
    
    if (input.headers && Object.keys(input.headers).length > 0) {
      parts.push(`with ${Object.keys(input.headers).length} header(s)`);
    }
    
    if (input.body) {
      parts.push(`and request body`);
    }

    return {
      analysis: parts.join(' ') + '.',
      doable: true,
    };
  },
  do: async (input) => {
    const options: RequestInit = {
      method: input.method,
      headers: input.headers || {},
    };

    if (input.body && ['POST', 'PUT', 'PATCH'].includes(input.method)) {
      options.body = input.body;
    }

    const response = await fetch(input.url, options);
    const responseBody = await response.text();

    // Convert Headers object to plain object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      url: input.url,
      method: input.method,
      status: response.status,
      statusText: response.statusText,
      headers,
      body: responseBody,
    };
  },
  render: (op) => renderOperation(
    op,
    `WebApiCall(${op.input.method} "${abbreviate(op.input.url, 25)}")`,
    (op) => {
      if (op.output) {
        return `${op.output.status} ${op.output.statusText} (${op.output.body.length} bytes)`;
      }
      return null;
    }
  ),
});
