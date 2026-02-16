import { v4 as uuidv4 } from 'uuid';
import type { CustomToolDefinition } from '../types';

const toolStore = new Map<string, CustomToolDefinition>();

export async function createTool(
  tool: Omit<CustomToolDefinition, 'id'>
): Promise<CustomToolDefinition> {
  const newTool: CustomToolDefinition = { ...tool, id: uuidv4() };
  toolStore.set(newTool.id, newTool);
  return newTool;
}

export async function getTools(entityId: string): Promise<CustomToolDefinition[]> {
  const results: CustomToolDefinition[] = [];
  for (const tool of toolStore.values()) {
    if (tool.entityId === entityId) results.push(tool);
  }
  return results;
}

export async function executeTool(
  toolId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = toolStore.get(toolId);
  if (!tool) throw new Error(`Tool ${toolId} not found`);
  if (!tool.isActive) throw new Error(`Tool ${toolId} is not active`);

  // Placeholder execution
  return {
    toolId: tool.id,
    toolName: tool.name,
    executedAt: new Date().toISOString(),
    input,
    output: { success: true, message: `Tool ${tool.name} executed successfully` },
  };
}

export async function validateToolInput(
  toolId: string,
  input: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const tool = toolStore.get(toolId);
  if (!tool) throw new Error(`Tool ${toolId} not found`);

  const errors: string[] = [];
  const schema = tool.inputSchema;

  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required as string[]) {
      if (!(field in input) || input[field] === undefined || input[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, def] of Object.entries(schema.properties as Record<string, { type?: string }>)) {
      if (key in input && def.type) {
        const value = input[key];
        if (def.type === 'string' && typeof value !== 'string') {
          errors.push(`Field ${key} must be a string`);
        } else if (def.type === 'number' && typeof value !== 'number') {
          errors.push(`Field ${key} must be a number`);
        } else if (def.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field ${key} must be a boolean`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export { toolStore };
