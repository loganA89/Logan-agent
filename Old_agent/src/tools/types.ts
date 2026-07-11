/**
 * Standard JSON Schema definition representing tool input parameters.
 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    default?: unknown;
  }>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Interface representing a native tool executable within the Logan Agent sandboxed runtime.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameterSchema;

  /**
   * Execute the tool with the provided input arguments.
   *
   * @param args Dictionary of input parameters matching the tool parameter schema.
   * @returns A serialized string observation output or diagnostic report.
   */
  execute(args: Record<string, unknown>): Promise<string>;
}
