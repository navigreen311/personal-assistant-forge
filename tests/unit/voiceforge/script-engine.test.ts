import {
  validateScript,
  startExecution,
  advanceNode,
  evaluateBranch,
  generateScriptWithAI,
  optimizeScript,
} from '@/modules/voiceforge/services/script-engine';
import type { CallScript, ScriptNode, ScriptBranch } from '@/modules/voiceforge/types';

// Mock Prisma (needed for module-level imports)
jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
  generateText: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

describe('Script Engine', () => {
  describe('validateScript', () => {
    it('should pass for a valid script', () => {
      const script: CallScript = {
        id: 'script-1',
        entityId: 'entity-1',
        name: 'Test Script',
        description: 'Test',
        startNodeId: 'node-1',
        version: 1,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        nodes: [
          { id: 'node-1', type: 'SPEAK', content: 'Hello', branches: [], nextNodeId: 'node-2' },
          { id: 'node-2', type: 'END', content: 'Goodbye', branches: [] },
        ],
      };
      const result = validateScript(script);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when startNodeId is missing', () => {
      const script: CallScript = {
        id: 'script-1',
        entityId: 'entity-1',
        name: 'Test',
        description: '',
        startNodeId: '',
        version: 1,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        nodes: [{ id: 'node-1', type: 'SPEAK', content: 'Hello', branches: [] }],
      };
      const result = validateScript(script);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Missing startNodeId'))).toBe(true);
    });

    it('should fail when startNodeId references non-existent node', () => {
      const script: CallScript = {
        id: 'script-1',
        entityId: 'entity-1',
        name: 'Test',
        description: '',
        startNodeId: 'nonexistent',
        version: 1,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        nodes: [{ id: 'node-1', type: 'SPEAK', content: 'Hello', branches: [] }],
      };
      const result = validateScript(script);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should detect unreachable nodes', () => {
      const script: CallScript = {
        id: 'script-1',
        entityId: 'entity-1',
        name: 'Test',
        description: '',
        startNodeId: 'node-1',
        version: 1,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        nodes: [
          { id: 'node-1', type: 'SPEAK', content: 'Hello', branches: [] },
          { id: 'node-2', type: 'END', content: 'Unreachable', branches: [] },
        ],
      };
      const result = validateScript(script);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unreachable'))).toBe(true);
    });

    it('should detect branch targets to non-existent nodes', () => {
      const script: CallScript = {
        id: 'script-1',
        entityId: 'entity-1',
        name: 'Test',
        description: '',
        startNodeId: 'node-1',
        version: 1,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        nodes: [
          {
            id: 'node-1',
            type: 'BRANCH',
            content: 'Check',
            branches: [{ condition: 'keyword=yes', targetNodeId: 'nonexistent', label: 'Yes' }],
          },
        ],
      };
      const result = validateScript(script);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non-existent'))).toBe(true);
    });

    it('should fail for empty nodes', () => {
      const script: CallScript = {
        id: 'script-1',
        entityId: 'entity-1',
        name: 'Test',
        description: '',
        startNodeId: 'node-1',
        version: 1,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        nodes: [],
      };
      const result = validateScript(script);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('no nodes'))).toBe(true);
    });
  });

  describe('startExecution', () => {
    it('should initialize at the start node', () => {
      const execution = startExecution('script-1', 'call-1', 'node-start');
      expect(execution.scriptId).toBe('script-1');
      expect(execution.callId).toBe('call-1');
      expect(execution.currentNodeId).toBe('node-start');
      expect(execution.visitedNodes).toEqual(['node-start']);
      expect(execution.collectedData).toEqual({});
    });
  });

  describe('advanceNode', () => {
    const nodes: ScriptNode[] = [
      {
        id: 'node-1',
        type: 'SPEAK',
        content: 'Hello',
        branches: [
          { condition: 'keyword=interested', targetNodeId: 'node-2', label: 'Interested' },
          { condition: 'keyword=cancel', targetNodeId: 'node-3', label: 'Cancel' },
        ],
        nextNodeId: 'node-4',
      },
      { id: 'node-2', type: 'SPEAK', content: 'Great!', branches: [], nextNodeId: 'node-4' },
      { id: 'node-3', type: 'END', content: 'Bye', branches: [] },
      {
        id: 'node-4',
        type: 'COLLECT_INFO',
        content: 'What is your email?',
        collectField: 'email',
        branches: [],
        nextNodeId: 'node-3',
      },
    ];

    it('should advance via branch when condition matches', () => {
      const execution = startExecution('s1', 'c1', 'node-1');
      const result = advanceNode(execution, 'I am interested in your offer', nodes);
      expect(result.currentNodeId).toBe('node-2');
      expect(result.visitedNodes).toContain('node-2');
    });

    it('should advance via cancel branch', () => {
      const execution = startExecution('s1', 'c1', 'node-1');
      const result = advanceNode(execution, 'I want to cancel', nodes);
      expect(result.currentNodeId).toBe('node-3');
    });

    it('should fall through to nextNodeId when no branch matches', () => {
      const execution = startExecution('s1', 'c1', 'node-1');
      const result = advanceNode(execution, 'tell me more', nodes);
      expect(result.currentNodeId).toBe('node-4');
    });

    it('should collect data on COLLECT_INFO node', () => {
      const execution = startExecution('s1', 'c1', 'node-4');
      const result = advanceNode(execution, 'john@example.com', nodes);
      expect(result.collectedData['email']).toBe('john@example.com');
      expect(result.currentNodeId).toBe('node-3');
    });

    it('should not advance if node not found', () => {
      const execution = { ...startExecution('s1', 'c1', 'nonexistent') };
      const result = advanceNode(execution, 'hello', nodes);
      expect(result.currentNodeId).toBe('nonexistent');
    });
  });

  describe('evaluateBranch', () => {
    it('should match keyword conditions', () => {
      const branch: ScriptBranch = { condition: 'keyword=yes', targetNodeId: 'n2', label: 'Yes' };
      expect(evaluateBranch(branch, 'yes I agree', {})).toBe(true);
      expect(evaluateBranch(branch, 'no thanks', {})).toBe(false);
    });

    it('should match intent conditions', () => {
      const branch: ScriptBranch = { condition: 'intent=support', targetNodeId: 'n2', label: 'Support' };
      expect(evaluateBranch(branch, 'I need support please', {})).toBe(true);
      expect(evaluateBranch(branch, 'I want to buy', {})).toBe(false);
    });

    it('should be case-insensitive', () => {
      const branch: ScriptBranch = { condition: 'keyword=help', targetNodeId: 'n2', label: 'Help' };
      expect(evaluateBranch(branch, 'HELP me please', {})).toBe(true);
    });

    it('should evaluate context-based conditions', () => {
      const branch: ScriptBranch = { condition: 'department=sales', targetNodeId: 'n2', label: 'Sales' };
      expect(evaluateBranch(branch, '', { department: 'sales' })).toBe(true);
      expect(evaluateBranch(branch, '', { department: 'support' })).toBe(false);
    });
  });

  describe('generateScriptWithAI', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    beforeEach(() => {
      generateJSON.mockReset();
    });

    it('should call generateJSON with script parameters', async () => {
      generateJSON.mockResolvedValueOnce({
        name: 'Sales Follow-up',
        description: 'A follow-up call script',
        nodes: [
          { id: 'greeting', type: 'GREETING', content: 'Hello!', branches: [] },
          { id: 'closing', type: 'CLOSING', content: 'Thank you', branches: [] },
        ],
        startNodeId: 'greeting',
      });

      const result = await generateScriptWithAI('entity-1', {
        purpose: 'sales follow-up',
        targetAudience: 'existing customers',
        tone: 'friendly',
        maxDuration: 5,
        keyPoints: ['check satisfaction', 'upsell'],
      });

      expect(generateJSON).toHaveBeenCalled();
      expect(result.name).toBe('Sales Follow-up');
      expect(result.entityId).toBe('entity-1');
      expect(result.status).toBe('DRAFT');
    });

    it('should return a valid CallScript structure', async () => {
      generateJSON.mockResolvedValueOnce({
        name: 'Test Script',
        description: 'Test',
        nodes: [
          { id: 'n1', type: 'GREETING', content: 'Hi', branches: [{ condition: 'keyword=yes', targetNodeId: 'n2' }] },
          { id: 'n2', type: 'CLOSING', content: 'Bye', branches: [] },
        ],
        startNodeId: 'n1',
      });

      const result = await generateScriptWithAI('entity-1', {
        purpose: 'test',
        targetAudience: 'test',
        tone: 'professional',
        maxDuration: 3,
        keyPoints: ['test'],
      });

      expect(result.nodes.length).toBe(2);
      expect(result.startNodeId).toBe('n1');
      expect(result.nodes[0].branches.length).toBe(1);
    });

    it('should include branching nodes in generated script', async () => {
      generateJSON.mockResolvedValueOnce({
        name: 'Branching Script',
        description: 'Script with branches',
        nodes: [
          { id: 'start', type: 'GREETING', content: 'Welcome', branches: [
            { condition: 'interested', targetNodeId: 'pitch' },
            { condition: 'not interested', targetNodeId: 'end' },
          ] },
          { id: 'pitch', type: 'STATEMENT', content: 'Our offer...', branches: [] },
          { id: 'end', type: 'CLOSING', content: 'Thank you', branches: [] },
        ],
        startNodeId: 'start',
      });

      const result = await generateScriptWithAI('entity-1', {
        purpose: 'sales',
        targetAudience: 'prospects',
        tone: 'professional',
        maxDuration: 5,
        keyPoints: ['pitch product'],
      });

      expect(result.nodes[0].branches.length).toBe(2);
    });

    it('should respect compliance requirements in prompts', async () => {
      generateJSON.mockResolvedValueOnce({
        name: 'HIPAA Script',
        description: 'HIPAA compliant',
        nodes: [{ id: 'n1', type: 'GREETING', content: 'Hello', branches: [] }],
        startNodeId: 'n1',
      });

      await generateScriptWithAI('entity-1', {
        purpose: 'healthcare follow-up',
        targetAudience: 'patients',
        tone: 'empathetic',
        maxDuration: 5,
        keyPoints: ['follow-up'],
        complianceRequirements: ['HIPAA', 'patient consent'],
      });

      const callArgs = generateJSON.mock.calls[0][0] as string;
      expect(callArgs).toContain('HIPAA');
      expect(callArgs).toContain('patient consent');
    });
  });
});
