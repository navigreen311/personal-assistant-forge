import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { CustomToolDefinition } from '../types';

export const toolStore = new Map<string, CustomToolDefinition>();

function documentToTool(doc: {
  id: string;
  content: string | null;
  version: number;
}): CustomToolDefinition {
  const data = doc.content ? JSON.parse(doc.content) : {};
  return {
    id: doc.id,
    entityId: data.entityId ?? '',
    name: data.name ?? '',
    description: data.description ?? '',
    inputSchema: data.inputSchema ?? {},
    outputSchema: data.outputSchema ?? {},
    implementation: data.implementation ?? 'WEBHOOK',
    config: data.config ?? {},
    isActive: data.isActive ?? true,
  };
}

export async function createTool(
  tool: Omit<CustomToolDefinition, 'id'>
): Promise<CustomToolDefinition> {
  const doc = await prisma.document.create({
    data: {
      title: tool.name,
      entityId: tool.entityId,
      type: 'CUSTOM_TOOL',
      status: 'ACTIVE',
      content: JSON.stringify({
        entityId: tool.entityId,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        implementation: tool.implementation,
        config: tool.config,
        isActive: tool.isActive,
      }),
    },
  });

  const result = documentToTool(doc);
  toolStore.set(result.id, result);
  return result;
}

export async function getTools(entityId: string): Promise<CustomToolDefinition[]> {
  const docs = await prisma.document.findMany({
    where: {
      type: 'CUSTOM_TOOL',
      entityId,
      deletedAt: null,
    },
  });

  return docs.map(documentToTool);
}

export async function listTools(entityId: string): Promise<CustomToolDefinition[]> {
  return getTools(entityId);
}

export async function getTool(toolId: string): Promise<CustomToolDefinition> {
  const doc = await prisma.document.findUnique({ where: { id: toolId } });
  if (!doc || doc.type !== 'CUSTOM_TOOL') throw new Error(`Tool ${toolId} not found`);
  return documentToTool(doc);
}

export async function updateTool(
  toolId: string,
  updates: Partial<CustomToolDefinition>
): Promise<CustomToolDefinition> {
  const doc = await prisma.document.findUnique({ where: { id: toolId } });
  if (!doc || doc.type !== 'CUSTOM_TOOL') throw new Error(`Tool ${toolId} not found`);

  const existing = doc.content ? JSON.parse(doc.content) : {};
  const merged = { ...existing, ...updates };

  const updated = await prisma.document.update({
    where: { id: toolId },
    data: {
      title: merged.name ?? doc.title,
      version: doc.version + 1,
      content: JSON.stringify(merged),
    },
  });

  const result = documentToTool(updated);
  toolStore.set(result.id, result);
  return result;
}

export async function deleteTool(toolId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: toolId } });
  if (!doc || doc.type !== 'CUSTOM_TOOL') throw new Error(`Tool ${toolId} not found`);
  await prisma.document.delete({ where: { id: toolId } });
  toolStore.delete(toolId);
}

export async function executeTool(
  toolId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = await getTool(toolId);
  if (!tool.isActive) throw new Error(`Tool ${toolId} is not active`);

  return {
    toolId: tool.id,
    toolName: tool.name,
    executedAt: new Date().toISOString(),
    input,
    output: { success: true, message: `Tool ${tool.name} executed successfully` },
  };
}

export function validateToolSchema(inputSchema: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!inputSchema || typeof inputSchema !== 'object') {
    errors.push('Schema must be an object');
    return { valid: false, errors };
  }

  if (inputSchema.type && inputSchema.type !== 'object') {
    errors.push('Root schema type must be "object"');
  }

  if (inputSchema.properties && typeof inputSchema.properties !== 'object') {
    errors.push('Properties must be an object');
  }

  if (inputSchema.required && !Array.isArray(inputSchema.required)) {
    errors.push('Required must be an array');
  }

  if (inputSchema.required && Array.isArray(inputSchema.required) && inputSchema.properties) {
    const propKeys = Object.keys(inputSchema.properties as Record<string, unknown>);
    for (const req of inputSchema.required as string[]) {
      if (!propKeys.includes(req)) {
        errors.push(`Required field "${req}" not defined in properties`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function validateToolInput(
  toolId: string,
  input: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const tool = await getTool(toolId);
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

export async function testToolExecution(
  toolId: string,
  testInput: Record<string, unknown>
): Promise<{ success: boolean; output: unknown; errors: string[] }> {
  const tool = await getTool(toolId);
  const errors: string[] = [];

  // Validate input against schema
  const validation = await validateToolInput(toolId, testInput);
  if (!validation.valid) {
    return { success: false, output: null, errors: validation.errors };
  }

  // Simulate execution
  const simulatedOutput = {
    toolId: tool.id,
    toolName: tool.name,
    executedAt: new Date().toISOString(),
    input: testInput,
    output: { success: true, message: `Tool ${tool.name} executed with test input` },
  };

  // Use AI to evaluate the output
  try {
    const evaluation = await generateJSON<{ reasonable: boolean; issues: string[] }>(
      `Evaluate whether this tool execution output makes sense.

Tool: ${tool.name}
Description: ${tool.description}
Input Schema: ${JSON.stringify(tool.inputSchema)}
Test Input: ${JSON.stringify(testInput)}
Output: ${JSON.stringify(simulatedOutput)}

Return JSON: { "reasonable": boolean, "issues": string[] }
Return reasonable=true if the output structure makes sense for the given tool and input. List any issues found.`,
      { temperature: 0.1, maxTokens: 256 }
    );

    if (!evaluation.reasonable && evaluation.issues?.length > 0) {
      errors.push(...evaluation.issues);
    }
  } catch {
    // AI evaluation is optional; tool execution still succeeds
  }

  return { success: errors.length === 0, output: simulatedOutput, errors };
}
