import { Tool, ToolParameterSchema } from './types';
import { ReadFileTool, CreateFileTool, ListDirTool, SearchFilesTool } from './fileTools';
import { EditFileTool } from './editTool';
import { ApplyDiffTool } from './applyDiffTool';
import { RunTerminalCommandTool } from './terminalTool';
import { WebSearchTool } from './webSearchTool';
import { SearchCodebaseTool } from './searchCodebaseTool';
import { GenerateAudioTool } from './mediaTools';
import { GenerateImageTool } from './imageTool';
import { ReadDiagnosticsTool } from './diagnosticsTool';
import { GitStatusTool, GitDiffTool, GitCommitTool, GitLogTool } from './gitTools';
import { TodoListTool } from './todoTool';

export interface NormalizedToolSchema {
  name: string;
  description: string;
  inputSchema: ToolParameterSchema;
}

export type ToolCategory = 'File Ops' | 'Terminal' | 'Search & RAG' | 'Git' | 'Task Planning' | 'Media';

export interface ToolMetadataItem {
  name: string;
  description: string;
  category: ToolCategory;
  enabled: boolean;
}

/**
 * Central registry managing all native VS Code sandboxed tools available to Logan Agent.
 */
export class ToolRegistry {
  private static instance: ToolRegistry | undefined;
  private readonly tools: Map<string, Tool> = new Map();
  private readonly enabledStates: Map<string, boolean> = new Map();

  private constructor() {
    this.registerDefaultTools();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  private registerDefaultTools(): void {
    this.registerTool(new ReadFileTool());
    this.registerTool(new CreateFileTool());
    this.registerTool(new ListDirTool());
    this.registerTool(new EditFileTool());
    this.registerTool(new ApplyDiffTool());
    this.registerTool(new RunTerminalCommandTool());
    this.registerTool(new SearchFilesTool());
    this.registerTool(new WebSearchTool());
    this.registerTool(new SearchCodebaseTool());
    this.registerTool(new ReadDiagnosticsTool());
    this.registerTool(new GitStatusTool());
    this.registerTool(new GitDiffTool());
    this.registerTool(new GitCommitTool());
    this.registerTool(new GitLogTool());
    this.registerTool(new TodoListTool());
    this.registerTool(new GenerateAudioTool());
    this.registerTool(new GenerateImageTool());
  }

  public registerTool(tool: Tool, enabled: boolean = true): void {
    this.tools.set(tool.name, tool);
    if (!this.enabledStates.has(tool.name)) {
      this.enabledStates.set(tool.name, enabled);
    }
  }

  public getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  public setToolState(name: string, enabled: boolean): void {
    if (this.tools.has(name)) {
      this.enabledStates.set(name, enabled);
    }
  }

  public loadSavedSelections(selections: Record<string, boolean>): void {
    for (const [name, enabled] of Object.entries(selections)) {
      if (this.tools.has(name)) {
        this.enabledStates.set(name, enabled);
      }
    }
  }

  public getSavedSelections(): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    for (const [name, enabled] of this.enabledStates.entries()) {
      map[name] = enabled;
    }
    return map;
  }

  private resolveCategory(name: string): ToolCategory {
    switch (name) {
      case 'read_file':
      case 'create_file':
      case 'list_dir':
      case 'edit_file':
      case 'apply_diff':
      case 'generate_image':
        return 'File Ops';
      case 'run_terminal_command':
        return 'Terminal';
      case 'search_files':
      case 'web_search':
      case 'search_codebase':
      case 'read_diagnostics':
        return 'Search & RAG';
      case 'git_status':
      case 'git_diff':
      case 'git_commit':
      case 'git_log':
        return 'Git';
      case 'todo_list':
        return 'Task Planning';
      case 'generate_audio':
        return 'Media';
      default:
        return 'File Ops';
    }
  }

  public getAllToolsMetadata(): ToolMetadataItem[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: this.resolveCategory(tool.name),
      enabled: this.enabledStates.get(tool.name) !== false,
    }));
  }

  public getToolDefinitions(): NormalizedToolSchema[] {
    return Array.from(this.tools.values())
      .filter((tool) => this.enabledStates.get(tool.name) !== false)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
      }));
  }

  public async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`[ToolRegistry] Tool "${name}" is not registered in the runtime environment.`);
    }
    if (this.enabledStates.get(name) === false) {
      throw new Error(`[ToolRegistry] Tool "${name}" is currently disabled in user tool selections.`);
    }

    return await tool.execute(args);
  }
}
