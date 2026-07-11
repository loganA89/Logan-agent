import * as vscode from 'vscode';
import { validateAndResolveSandboxPath } from './fileTools';

export interface CheckpointRecord {
  id: string;
  filePath: string;
  originalContent: string;
  timestamp: number;
}

/**
 * Time-Travel Checkpoint Engine responsible for recording atomic pre-edit backups
 * and executing sub-second restorations upon user rollback commands.
 */
export class CheckpointEngine {
  private static instance: CheckpointEngine | undefined;
  private readonly snapshots: Map<string, CheckpointRecord> = new Map();
  private latestSnapshotId: string | undefined;

  private constructor() {}

  public static getInstance(): CheckpointEngine {
    if (!CheckpointEngine.instance) {
      CheckpointEngine.instance = new CheckpointEngine();
    }
    return CheckpointEngine.instance;
  }

  private async getCheckpointsDir(): Promise<vscode.Uri> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('[CheckpointEngine] Cannot access checkpoints directory without an active workspace folder.');
    }
    const rootUri = workspaceFolders[0].uri;
    const dirUri = vscode.Uri.joinPath(rootUri, '.vscode', '.logan', 'checkpoints');
    await vscode.workspace.fs.createDirectory(dirUri);
    return dirUri;
  }

  /**
   * Records an immutable snapshot of a file's state prior to structural modification.
   *
   * @param filePath Relative or absolute path to the workspace file.
   * @param content Exact pre-edit string content of the file.
   * @returns Unique Checkpoint ID string representing the stored backup state.
   */
  public async createSnapshot(filePath: string, content: string): Promise<string> {
    const stepId = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: CheckpointRecord = {
      id: stepId,
      filePath,
      originalContent: content,
      timestamp: Date.now(),
    };

    this.snapshots.set(stepId, record);
    this.latestSnapshotId = stepId;

    try {
      const dirUri = await this.getCheckpointsDir();
      const snapshotUri = vscode.Uri.joinPath(dirUri, `${stepId}.json`);
      const payload = JSON.stringify(record, null, 2);
      await vscode.workspace.fs.writeFile(snapshotUri, new TextEncoder().encode(payload));
    } catch {
      // If filesystem writing fails due to permissions, preserve in-memory snapshot state
    }

    return stepId;
  }

  /**
   * Restores a workspace file back to its exact pre-edit checkpoint state.
   *
   * @param stepIdOrPath The target Checkpoint ID string or relative file path to roll back.
   * @returns True if restoration succeeded, false if snapshot record was not found.
   */
  public async rollbackSnapshot(stepIdOrPath: string): Promise<boolean> {
    let targetRecord = this.snapshots.get(stepIdOrPath);

    if (!targetRecord && stepIdOrPath === 'latest' && this.latestSnapshotId) {
      targetRecord = this.snapshots.get(this.latestSnapshotId);
    }

    if (!targetRecord) {
      // Attempt to match by file path against the most recent snapshot for that path
      const sorted = Array.from(this.snapshots.values())
        .filter((rec) => rec.filePath === stepIdOrPath)
        .sort((a, b) => b.timestamp - a.timestamp);

      if (sorted.length > 0) {
        targetRecord = sorted[0];
      }
    }

    if (!targetRecord) {
      return false;
    }

    try {
      const targetUri = validateAndResolveSandboxPath(targetRecord.filePath);
      const uint8Content = new TextEncoder().encode(targetRecord.originalContent);
      await vscode.workspace.fs.writeFile(targetUri, uint8Content);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[CheckpointEngine] Restoration failed for checkpoint "${targetRecord.id}": ${msg}`);
    }
  }

  /**
   * Retrieves all recorded checkpoints for auditing or UI display.
   */
  public listCheckpoints(): CheckpointRecord[] {
    return Array.from(this.snapshots.values()).sort((a, b) => b.timestamp - a.timestamp);
  }
}
