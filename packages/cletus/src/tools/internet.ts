import { z } from 'zod';
import { globalToolProperties, type CletusAI } from '../ai';
import { getOperationInput } from '../operations/types';

/**
 * Create internet tools for web operations
 */
export function createInternetTools(ai: CletusAI) {
  const webSearch = ai.tool({
    name: 'web_search',
    description: 'Search the web using Tavily API',
    instructions: `Use this to search the web for information. Returns search results with titles, URLs, and content snippets.
Requires Tavily API key to be configured in settings.

Example: Search for recent AI developments:
{ "query": "recent developments in large language models", "maxResults": 5 }
 
{{modeInstructions}}`,
    schema: z.object({
      query: z.string().describe('Search query'),
      maxResults: z.number().optional().default(5).describe('Maximum number of results to return (default: 5)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('web_search'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'web_search', input }, ctx),
  });

  const webGetPage = ai.tool({
    name: 'web_get_page',
    description: 'Get content from a web page using puppeteer',
    instructions: `Use this to fetch and extract content from a web page. Can return HTML or plain text, optionally filtered by regex, with line range selection.

Example 1: Get plain text from a page:
{ "url": "https://example.com", "type": "text" }

Example 2: Get HTML within specific lines:
{ "url": "https://example.com/docs", "type": "html", "lineStart": 50, "lineEnd": 100 }

Example 3: Search for specific content with regex:
{ "url": "https://example.com", "type": "text", "regex": "price.*\\$[0-9]+", "surrounding": 2 }
 
{{modeInstructions}}`,
    schema: z.object({
      url: z.string().describe('URL of the page to fetch'),
      type: z.enum(['html', 'text']).describe('Content type to return: "html" for raw HTML, "text" for plain text'),
      regex: z.string().optional().describe('Optional regex pattern to search for in content'),
      surrounding: z.number().optional().describe('Number of surrounding lines to include when using regex (default: 0)'),
      lineStart: z.number().optional().describe('Starting line number (1-indexed)'),
      lineEnd: z.number().optional().describe('Ending line number (1-indexed)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('web_get_page'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'web_get_page', input }, ctx),
  });

  const webApiCall = ai.tool({
    name: 'web_api_call',
    description: 'Make REST API calls to external services',
    instructions: `Use this to make HTTP requests to REST APIs. Supports all common HTTP methods, custom headers, and different content types.

Example 1: GET request:
{ "url": "https://api.example.com/data", "method": "GET" }

Example 2: POST request with JSON body:
{ "url": "https://api.example.com/items", "method": "POST", "requestType": "json", "body": "{\\"name\\": \\"Test\\"}" }

Example 3: Request with authentication expecting JSON response:
{ "url": "https://api.example.com/protected", "method": "GET", "headers": {"Authorization": "Bearer ..."}, "responseType": "json" }

Request/Response Types:
- json: Automatically sets/parses JSON content
- text: Plain text (default)
- binary: Base64-encoded binary data
 
{{modeInstructions}}`,
    schema: z.object({
      url: z.string().describe('API endpoint URL'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).describe('HTTP method'),
      headers: z.record(z.string(), z.string()).optional().describe('Request headers as key-value pairs'),
      body: z.string().optional().describe('Request body (for POST, PUT, PATCH)'),
      requestType: z.enum(['json', 'text', 'binary']).optional().describe('Request body type (default: text)'),
      responseType: z.enum(['json', 'text', 'binary']).optional().describe('Expected response type (default: text)'),
      ...globalToolProperties,
    }),
    input: getOperationInput('web_api_call'),
    call: async (input, _, ctx) => ctx.ops.handle({ type: 'web_api_call', input }, ctx),
  });

  return [
    webSearch,
    webGetPage,
    webApiCall,
  ] as [
    typeof webSearch,
    typeof webGetPage,
    typeof webApiCall,
  ];
}
