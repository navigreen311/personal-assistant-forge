import {
  createTestSuite,
  addTestCase,
  runTestSuite,
  compareOutputs,
  _getSuiteStore,
} from '@/modules/ai-quality/services/golden-test-service';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn()
    .mockReturnValueOnce('suite-1')
    .mockReturnValueOnce('case-1')
    .mockReturnValueOnce('case-2')
    .mockReturnValueOnce('case-3'),
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    priority: 'HIGH',
    category: 'URGENT',
    confidence: 0.95,
  }),
  generateText: jest.fn().mockResolvedValue('AI-generated insight'),
}));

const { generateJSON } = require('@/lib/ai');

describe('runTestSuite (AI-powered)', () => {
  beforeEach(() => {
    _getSuiteStore().clear();
    jest.clearAllMocks();
    // Reset uuid mock counter
    const uuid = require('uuid');
    uuid.v4
      .mockReturnValueOnce('suite-1')
      .mockReturnValueOnce('case-1')
      .mockReturnValueOnce('case-2');
  });

  it('should call generateJSON for each test case', async () => {
    const suite = await createTestSuite('Test Suite', 'A test suite');
    await addTestCase(suite.id, {
      category: 'TRIAGE',
      input: { message: 'Urgent request from CEO' },
      expectedOutput: { priority: 'HIGH', category: 'URGENT' },
      tags: ['priority'],
    });

    generateJSON.mockResolvedValueOnce({
      priority: 'HIGH',
      category: 'URGENT',
    });

    const { results } = await runTestSuite(suite.id, 'claude-sonnet-4-5-20250929');
    expect(generateJSON).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
  });

  it('should compare AI output against expectedOutput', async () => {
    const suite = await createTestSuite('Comparison Suite', 'Test comparison');
    await addTestCase(suite.id, {
      category: 'CLASSIFICATION',
      input: { text: 'Hello world' },
      expectedOutput: { label: 'greeting', confidence: 0.9 },
      tolerance: 0.15,
      tags: ['classification'],
    });

    generateJSON.mockResolvedValueOnce({
      label: 'greeting',
      confidence: 0.88,
    });

    const { results } = await runTestSuite(suite.id, 'claude-sonnet-4-5-20250929');
    expect(results[0].passed).toBe(true);
    expect(results[0].actualOutput).toEqual({ label: 'greeting', confidence: 0.88 });
  });

  it('should apply tolerance for numeric comparisons', async () => {
    const result1 = compareOutputs(
      { score: 0.9 },
      { score: 0.85 },
      0.1
    );
    expect(result1.passed).toBe(true);

    const result2 = compareOutputs(
      { score: 0.9 },
      { score: 0.7 },
      0.1
    );
    expect(result2.passed).toBe(false);
  });

  it('should record pass/fail for each test case', async () => {
    const suite = await createTestSuite('Pass/Fail Suite', 'Test pass/fail');
    await addTestCase(suite.id, {
      category: 'TRIAGE',
      input: { message: 'Test' },
      expectedOutput: { priority: 'HIGH' },
      tags: [],
    });

    generateJSON.mockResolvedValueOnce({ priority: 'LOW' });

    const { results, passRate } = await runTestSuite(suite.id, 'claude-sonnet-4-5-20250929');
    expect(results[0].passed).toBe(false);
    expect(passRate).toBe(0);
  });

  it('should handle AI errors without crashing the suite', async () => {
    const suite = await createTestSuite('Error Suite', 'Test error handling');
    await addTestCase(suite.id, {
      category: 'EXTRACTION',
      input: { document: 'test doc' },
      expectedOutput: { entities: ['test'] },
      tags: [],
    });

    generateJSON.mockRejectedValueOnce(new Error('AI service unavailable'));

    const { results, passRate } = await runTestSuite(suite.id, 'claude-sonnet-4-5-20250929');
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(passRate).toBe(0);
  });
});

describe('compareOutputs', () => {
  it('should pass when outputs match exactly', () => {
    const result = compareOutputs(
      { key: 'value', num: 42 },
      { key: 'value', num: 42 }
    );
    expect(result.passed).toBe(true);
  });

  it('should fail when string values differ', () => {
    const result = compareOutputs(
      { key: 'expected' },
      { key: 'actual' }
    );
    expect(result.passed).toBe(false);
  });

  it('should track maximum deviation', () => {
    const result = compareOutputs(
      { a: 1.0, b: 2.0 },
      { a: 1.1, b: 2.5 },
      1.0
    );
    expect(result.passed).toBe(true);
    expect(result.deviation).toBeCloseTo(0.5);
  });
});
