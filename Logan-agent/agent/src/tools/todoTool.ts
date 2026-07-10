import * as vscode from 'vscode';
import { Tool, ToolParameterSchema } from './types';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
}

class TodoManager {
  private static instance: TodoManager | undefined;
  private todos: TodoItem[] = [];
  private loaded = false;

  private constructor() {}

  public static getInstance(): TodoManager {
    if (!TodoManager.instance) TodoManager.instance = new TodoManager();
    return TodoManager.instance;
  }

  private async getStoreUri(): Promise<vscode.Uri> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) throw new Error('[todo] No workspace open');
    const dir = vscode.Uri.joinPath(folders[0].uri, '.vscode', '.logan');
    await vscode.workspace.fs.createDirectory(dir);
    return vscode.Uri.joinPath(dir, 'todos.json');
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const uri = await this.getStoreUri();
      const bytes = await vscode.workspace.fs.readFile(uri);
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (Array.isArray(data)) this.todos = data;
    } catch { /* ignore, start empty */ }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    try {
      const uri = await this.getStoreUri();
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(this.todos, null, 2)));
    } catch {}
  }

  public async getAll(): Promise<TodoItem[]> {
    await this.load();
    return [...this.todos];
  }

  public async setAll(items: Array<Partial<TodoItem> & { content: string }>): Promise<TodoItem[]> {
    await this.load();
    const now = Date.now();
    this.todos = items.map((t, i) => ({
      id: t.id || `todo_${now}_${i}`,
      content: t.content,
      status: (t.status as any) || 'pending',
      priority: t.priority as any || 'medium',
      createdAt: t.createdAt || now,
      updatedAt: now,
    }));
    await this.save();
    return this.getAll();
  }

  public async clear(): Promise<void> {
    this.todos = [];
    await this.save();
  }
}

/**
 * Task Planner / Todo List tool – allows the agent to break down complex multi-step tasks,
 * track progress, and maintain focus. Essential for autonomous long-running workflows.
 */
export class TodoListTool implements Tool {
  public readonly name = 'todo_list';
  public readonly description = 'Manage a persistent task todo list. Use this to break down complex multi-step tasks, track progress, and stay organized. Mark tasks as in_progress when starting, completed when finished. Always create a todo list for tasks with 3+ steps.';
  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['read', 'write', 'clear'],
        description: 'read = get current todos, write = replace entire todo list, clear = empty list',
      },
      todos: {
        type: 'array',
        description: 'Array of todo items (required for operation=write). Each item: {content: string, status: "pending"|"in_progress"|"completed", priority?: "low"|"medium"|"high"}',
        items: { type: 'object' }
      }
    },
    required: ['operation']
  };

  public async execute(args: Record<string, unknown>): Promise<string> {
    const operation = typeof args.operation === 'string' ? args.operation : 'read';
    const mgr = TodoManager.getInstance();

    if (operation === 'clear') {
      await mgr.clear();
      return 'Todo list cleared.';
    }

    if (operation === 'read') {
      const todos = await mgr.getAll();
      if (todos.length === 0) return 'Todo list is empty. Use operation="write" with a todos array to create a task plan.';
      const lines = todos.map((t, i) => {
        const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜';
        const pri = t.priority === 'high' ? ' 🔥' : t.priority === 'low' ? ' ↓' : '';
        return `${i + 1}. ${icon} ${t.content}${pri} [${t.status}]`;
      });
      const done = todos.filter(t => t.status === 'completed').length;
      return `Todo List (${done}/${todos.length} completed):\n\n${lines.join('\n')}`;
    }

    if (operation === 'write') {
      const todos = args.todos;
      if (!Array.isArray(todos)) {
        throw new Error('[todo_list] operation="write" requires a "todos" array parameter');
      }
      const valid = todos.filter((t: any) => t && typeof t.content === 'string' && t.content.trim()).map((t: any) => ({
        content: String(t.content).trim(),
        status: ['pending', 'in_progress', 'completed'].includes(t.status) ? t.status : 'pending',
        priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
        id: t.id,
      }));
      if (valid.length === 0) throw new Error('[todo_list] No valid todo items provided (need at least {content: string})');
      
      const saved = await mgr.setAll(valid);
      const summary = saved.map((t, i) => `${i + 1}. ${t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜'} ${t.content}`).join('\n');
      return `Todo list updated – ${saved.length} tasks:\n\n${summary}\n\nTip: Mark tasks as in_progress when starting, completed when finished. Only ONE task should be in_progress at a time.`;
    }

    throw new Error(`[todo_list] Unknown operation "${operation}". Use "read", "write", or "clear".`);
  }
}
