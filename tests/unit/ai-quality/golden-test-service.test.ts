import {
  createTestSuite,
  addTestCase,
  runTestSuite,
  getTestSuites,
  getRegressionReport,
  compareOutputs,
  _getSuiteStore,
} from '@/modules/ai-quality/services/golden-test-service';

// Mock uuid with a counter for predictable IDs
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `uuid-${++uuidCounter}`),
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    priority: 'HIGH',
    category: 'URGENT',
  }),
}));

const { generateJSON } = require('@/lib/ai');

describe('GoldenTestService', () => {
  beforeEach(() => {
    _getSuiteStore().clear();
    jest.clearAllMocks();
    uuidCounter = 0;
  });

  describe('createTestSuite', () => {
    it('should create a test suite with the given name and description', async () => {
      const suite = await createTestSuite('My Suite', 'A test suite for triage');

      expect(suite.id).toBeDefined();
      expect(suite.name).toBe('My Suite');
      expect(suite.description).toBe('A test suite for triage');
      expect(suite.testCases).toEqual([]);
      expect(suite.passRate).toBe(0);
      expect(suite.totalRuns).toBe(0);
    });

    it('should store the suite in the suite store', async () => {
      const suite = await createTestSuite('Stored Suite', 'Testing storage');

      expect(_getSuiteStore().has(suite.id)).toBe(true);
      expect(_getSuiteStore().get(suite.id)).toEqual(suite);
    });

    it('should create multiple suites with unique IDs', async () => {
      const suite1 = await createTestSuite('Suite 1', 'First');
      const suite2 = await createTestSuite('Suite 2', 'Second');

      expect(suite1.id).not.toBe(suite2.id);
      expect(_getSuiteStore().size).toBe(2);
    });
  });

  describe('addTestCase', () => {
    it('should add a test case to an existing suite', async () => {
      const suite = await createTestSuite('Suite', 'Description');

      const testCase = await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: { message: 'Urgent request' },
        expectedOutput: { priority: 'HIGH' },
        tags: ['priority'],
      });

      expect(testCase.id).toBeDefined();
      expect(testCase.category).toBe('TRIAGE');
      expect(testCase.input).toEqual({ message: 'Urgent request' });
      expect(testCase.expectedOutput).toEqual({ priority: 'HIGH' });
      expect(testCase.tags).toEqual(['priority']);
      expect(testCase.createdAt).toBeInstanceOf(Date);
    });

    it('should throw an error when suite does not exist', async () => {
      await expect(
        addTestCase('nonexistent-suite', {
          category: 'TRIAGE',
          input: {},
          expectedOutput: {},
          tags: [],
        })
      ).rejects.toThrow('Test suite not found: nonexistent-suite');
    });

    it('should add multiple test cases to the same suite', async () => {
      const suite = await createTestSuite('Multi Case', 'Multiple cases');

      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: { msg: 'A' },
        expectedOutput: { priority: 'HIGH' },
        tags: [],
      });
      await addTestCase(suite.id, {
        category: 'CLASSIFICATION',
        input: { msg: 'B' },
        expectedOutput: { label: 'greeting' },
        tags: [],
      });

      const stored = _getSuiteStore().get(suite.id);
      expect(stored!.testCases).toHaveLength(2);
    });
  });

  describe('runTestSuite', () => {
    it('should throw an error when suite does not exist', async () => {
      await expect(
        runTestSuite('nonexistent', 'v1')
      ).rejects.toThrow('Test suite not found: nonexistent');
    });

    it('should run all test cases and return results', async () => {
      const suite = await createTestSuite('Run Suite', 'Test running');
      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: { message: 'Urgent' },
        expectedOutput: { priority: 'HIGH', category: 'URGENT' },
        tags: [],
      });

      generateJSON.mockResolvedValueOnce({ priority: 'HIGH', category: 'URGENT' });

      const { passRate, results } = await runTestSuite(suite.id, 'model-v1');

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].modelVersion).toBe('model-v1');
      expect(results[0].timestamp).toBeInstanceOf(Date);
      expect(results[0].runDuration).toBeGreaterThanOrEqual(0);
      expect(passRate).toBe(100);
    });

    it('should calculate pass rate correctly with mixed results', async () => {
      const suite = await createTestSuite('Mixed Suite', 'Mixed results');
      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: { msg: 'A' },
        expectedOutput: { priority: 'HIGH' },
        tags: [],
      });
      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: { msg: 'B' },
        expectedOutput: { priority: 'LOW' },
        tags: [],
      });

      generateJSON
        .mockResolvedValueOnce({ priority: 'HIGH' }) // passes
        .mockResolvedValueOnce({ priority: 'HIGH' }); // fails (expected LOW)

      const { passRate, results } = await runTestSuite(suite.id, 'model-v1');

      expect(results).toHaveLength(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
      expect(passRate).toBe(50);
    });

    it('should handle AI errors gracefully with empty fallback output', async () => {
      const suite = await createTestSuite('Error Suite', 'Error handling');
      await addTestCase(suite.id, {
        category: 'EXTRACTION',
        input: { doc: 'test' },
        expectedOutput: { entities: ['person'] },
        tags: [],
      });

      generateJSON.mockRejectedValueOnce(new Error('AI service down'));

      const { results, passRate } = await runTestSuite(suite.id, 'model-v1');

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].actualOutput).toEqual({});
      expect(passRate).toBe(0);
    });

    it('should increment totalRuns and update suite state', async () => {
      const suite = await createTestSuite('Counter Suite', 'Counting runs');
      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: {},
        expectedOutput: { result: 'ok' },
        tags: [],
      });

      generateJSON.mockResolvedValue({ result: 'ok' });

      await runTestSuite(suite.id, 'v1');
      await runTestSuite(suite.id, 'v2');

      const stored = _getSuiteStore().get(suite.id);
      expect(stored!.totalRuns).toBe(2);
      expect(stored!.lastRunDate).toBeInstanceOf(Date);
    });

    it('should update test case lastRun and lastResult after execution', async () => {
      const suite = await createTestSuite('Update Suite', 'Updating test cases');
      const testCase = await addTestCase(suite.id, {
        category: 'CLASSIFICATION',
        input: { text: 'hello' },
        expectedOutput: { label: 'greeting' },
        tags: [],
      });

      generateJSON.mockResolvedValueOnce({ label: 'greeting' });

      await runTestSuite(suite.id, 'v1');

      const stored = _getSuiteStore().get(suite.id);
      const updatedCase = stored!.testCases[0];
      expect(updatedCase.lastRun).toBeInstanceOf(Date);
      expect(updatedCase.lastResult).toBe('PASS');
    });
  });

  describe('getTestSuites', () => {
    it('should return empty array when no suites exist', async () => {
      const suites = await getTestSuites();
      expect(suites).toEqual([]);
    });

    it('should return all created suites', async () => {
      await createTestSuite('Suite A', 'First');
      await createTestSuite('Suite B', 'Second');

      const suites = await getTestSuites();
      expect(suites).toHaveLength(2);
    });
  });

  describe('getRegressionReport', () => {
    it('should throw when suite does not exist', async () => {
      await expect(
        getRegressionReport('nonexistent')
      ).rejects.toThrow('Test suite not found: nonexistent');
    });

    it('should return regression report with failed test cases', async () => {
      const suite = await createTestSuite('Regression Suite', 'Testing regressions');
      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: { msg: 'A' },
        expectedOutput: { priority: 'HIGH' },
        tags: [],
      });
      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: { msg: 'B' },
        expectedOutput: { priority: 'LOW' },
        tags: [],
      });

      generateJSON
        .mockResolvedValueOnce({ priority: 'HIGH' })
        .mockResolvedValueOnce({ priority: 'HIGH' }); // Wrong - expected LOW

      await runTestSuite(suite.id, 'v1');

      const report = await getRegressionReport(suite.id);

      expect(report.currentPassRate).toBe(50);
      expect(report.regressions).toHaveLength(1);
      expect(report.regressions[0].passed).toBe(false);
    });

    it('should assume 100% previous pass rate on first run', async () => {
      const suite = await createTestSuite('First Run', 'First run test');
      await addTestCase(suite.id, {
        category: 'TRIAGE',
        input: {},
        expectedOutput: { result: 'ok' },
        tags: [],
      });

      generateJSON.mockResolvedValueOnce({ result: 'ok' });
      await runTestSuite(suite.id, 'v1');

      const report = await getRegressionReport(suite.id);

      // totalRuns is 1, so previousPassRate = 100
      expect(report.previousPassRate).toBe(100);
    });
  });

  describe('compareOutputs', () => {
    it('should pass when outputs match exactly', () => {
      const result = compareOutputs(
        { key: 'value', num: 42 },
        { key: 'value', num: 42 }
      );
      expect(result.passed).toBe(true);
      expect(result.deviation).toBeUndefined();
    });

    it('should fail when string values differ', () => {
      const result = compareOutputs(
        { label: 'expected' },
        { label: 'actual' }
      );
      expect(result.passed).toBe(false);
    });

    it('should pass numeric values within tolerance', () => {
      const result = compareOutputs(
        { score: 0.9 },
        { score: 0.85 },
        0.1
      );
      expect(result.passed).toBe(true);
      expect(result.deviation).toBeCloseTo(0.05);
    });

    it('should fail numeric values outside tolerance', () => {
      const result = compareOutputs(
        { score: 0.9 },
        { score: 0.7 },
        0.1
      );
      expect(result.passed).toBe(false);
      expect(result.deviation).toBeCloseTo(0.2);
    });

    it('should use default tolerance of 0.001 when none is specified', () => {
      const passResult = compareOutputs(
        { score: 1.0 },
        { score: 1.0005 }
      );
      expect(passResult.passed).toBe(true);

      const failResult = compareOutputs(
        { score: 1.0 },
        { score: 1.002 }
      );
      expect(failResult.passed).toBe(false);
    });

    it('should track maximum deviation across multiple numeric keys', () => {
      const result = compareOutputs(
        { a: 1.0, b: 2.0, c: 3.0 },
        { a: 1.1, b: 2.5, c: 3.2 },
        1.0
      );
      expect(result.passed).toBe(true);
      expect(result.deviation).toBeCloseTo(0.5); // max(0.1, 0.5, 0.2) = 0.5
    });

    it('should fail when expected key is missing from actual output', () => {
      const result = compareOutputs(
        { key: 'value' },
        {}
      );
      expect(result.passed).toBe(false);
    });

    it('should handle nested objects via JSON comparison', () => {
      const passResult = compareOutputs(
        { data: { nested: true } },
        { data: { nested: true } }
      );
      expect(passResult.passed).toBe(true);

      const failResult = compareOutputs(
        { data: { nested: true } },
        { data: { nested: false } }
      );
      expect(failResult.passed).toBe(false);
    });

    it('should return no deviation when there are no numeric comparisons', () => {
      const result = compareOutputs(
        { label: 'hello' },
        { label: 'hello' }
      );
      expect(result.passed).toBe(true);
      expect(result.deviation).toBeUndefined();
    });
  });
});
