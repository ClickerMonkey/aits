declare module '@tavily/core' {
  export interface TavilySearchOptions {
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    includeImages?: boolean;
    includeAnswer?: boolean;
    includeRawContent?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
  }

  export interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score?: number;
  }

  export interface TavilySearchResponse {
    query: string;
    results: TavilySearchResult[];
    answer?: string;
    images?: string[];
  }

  export interface TavilyClient {
    search(query: string, options?: TavilySearchOptions): Promise<TavilySearchResponse>;
  }

  export function tavily(config: { apiKey: string }): TavilyClient;
}
