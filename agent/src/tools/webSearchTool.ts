import * as vscode from 'vscode';
import { Tool, ToolParameterSchema } from './types';

/**
 * Tool implementation for querying external web search engines to retrieve up-to-date API references.
 * Supports Tavily API, Brave Search API, or DuckDuckGo HTML parsing fallback.
 */
export class WebSearchTool implements Tool {
  public readonly name = 'web_search';
  public readonly description = 'Search external web sources and API documentation for up-to-date syntax references.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Concise technical documentation search query (e.g. "Next.js 15 App Router caching syntax").',
      },
      maxResults: {
        type: 'number',
        description: 'Number of top search results to retrieve (default 5).',
      },
    },
    required: ['query'],
  };

  private async searchTavily(query: string, apiKey: string, maxResults: number): Promise<string> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API responded with status ${response.status}`);
    }

    const data = (await response.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    const output: string[] = [];
    if (data.answer) {
      output.push(`[Summary Answer]\n${data.answer}\n`);
    }

    if (data.results) {
      data.results.forEach((res, index) => {
        output.push(`${index + 1}. [${res.title || 'Untitled'}](${res.url || ''})\n${res.content || ''}\n`);
      });
    }

    return output.join('\n');
  }

  private async searchDuckDuckGoFallback(query: string, maxResults: number): Promise<string> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LoganAgent/0.1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo fallback responded with status ${response.status}`);
    }

    const html = await response.text();
    const results: string[] = [];

    // Simple robust regex extraction for search snippets from DuckDuckGo HTML output
    const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
    const titleRegex = /<a class="result__url[^>]*>([\s\S]*?)<\/a>/g;

    const titles: string[] = [];
    let titleMatch: RegExpExecArray | null;
    while ((titleMatch = titleRegex.exec(html)) !== null && titles.length < maxResults) {
      titles.push(titleMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    const snippets: string[] = [];
    let snippetMatch: RegExpExecArray | null;
    while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
      snippets.push(snippetMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    for (let i = 0; i < Math.min(titles.length, snippets.length); i++) {
      results.push(`${i + 1}. ${titles[i]}\n   Excerpt: ${snippets[i]}\n`);
    }

    if (results.length === 0) {
      return `No direct search excerpts could be parsed for query "${query}".`;
    }

    return `Search Excerpts for "${query}":\n\n${results.join('\n')}`;
  }

  public async execute(args: Record<string, unknown>): Promise<string> {
    const query = typeof args.query === 'string' ? args.query : undefined;
    if (!query) {
      throw new Error('[web_search] Missing required parameter "query".');
    }

    const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 5;
    const config = vscode.workspace.getConfiguration('logan');
    const searchApiKey = config.get<string>('searchApiKey', '') || process.env.TAVILY_API_KEY || '';

    if (searchApiKey.startsWith('tvly-')) {
      try {
        return await this.searchTavily(query, searchApiKey, maxResults);
      } catch {
        // Fall back to DuckDuckGo if Tavily fails
      }
    }

    try {
      return await this.searchDuckDuckGoFallback(query, maxResults);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[web_search] Search request failed for "${query}": ${msg}`);
    }
  }
}
