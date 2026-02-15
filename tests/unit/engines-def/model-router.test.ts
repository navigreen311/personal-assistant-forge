import { routeRequest, estimateCost, getModelForTier } from '@/engines/cost/model-router';

describe('routeRequest', () => {
  it('should route short simple queries to FAST tier', () => {
    const result = routeRequest('What is the status?');
    expect(result.inputComplexity).toBe('SIMPLE');
    expect(result.recommendedTier).toBe('FAST');
  });

  it('should route moderate queries to BALANCED tier', () => {
    const result = routeRequest(
      'Can you help me organize my inbox and set up some basic filters for common email types?'
    );
    expect(result.recommendedTier).toBe('BALANCED');
  });

  it('should route complex queries to POWERFUL tier', () => {
    const longInput = 'Analyze and compare the following quarterly financial reports, evaluate trends across all departments, and design a comprehensive strategy for reducing operational costs while maintaining service quality. ' +
      'Consider the impact on customer satisfaction metrics, employee retention, and long-term growth projections. ' +
      'This analysis should include specific recommendations for each department head, along with a timeline and risk assessment. '.repeat(3);
    const result = routeRequest(longInput);
    expect(result.inputComplexity).toBe('COMPLEX');
    expect(result.recommendedTier).toBe('POWERFUL');
  });

  it('should route draft tasks to BALANCED tier', () => {
    const result = routeRequest('Write a quick thank you note', 'draft');
    expect(result.recommendedTier).toBe('BALANCED');
    expect(result.inputComplexity).toBe('MODERATE');
  });

  it('should include estimated cost', () => {
    const result = routeRequest('Hello');
    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
    expect(typeof result.estimatedCost).toBe('number');
  });

  it('should include recommended model', () => {
    const result = routeRequest('Hi');
    expect(result.recommendedModel).toBeDefined();
    expect(result.recommendedModel.length).toBeGreaterThan(0);
  });
});

describe('estimateCost', () => {
  it('should calculate FAST tier cost correctly', () => {
    // 1000 input tokens, 1000 output tokens
    // FAST: $0.25/1M input + $1.25/1M output
    // = (1000/1M) * 0.25 + (1000/1M) * 1.25
    // = 0.00025 + 0.00125 = 0.0015
    const cost = estimateCost('FAST', 1000, 1000);
    expect(cost).toBeCloseTo(0.0015, 4);
  });

  it('should calculate BALANCED tier cost correctly', () => {
    // 1000 input, 1000 output
    // BALANCED: $3/1M input + $15/1M output
    // = 0.003 + 0.015 = 0.018
    const cost = estimateCost('BALANCED', 1000, 1000);
    expect(cost).toBeCloseTo(0.018, 4);
  });

  it('should calculate POWERFUL tier cost correctly', () => {
    // 1000 input, 1000 output
    // POWERFUL: $15/1M input + $75/1M output
    // = 0.015 + 0.075 = 0.09
    const cost = estimateCost('POWERFUL', 1000, 1000);
    expect(cost).toBeCloseTo(0.09, 4);
  });
});

describe('getModelForTier', () => {
  it('should return haiku model for FAST tier', () => {
    expect(getModelForTier('FAST')).toContain('haiku');
  });

  it('should return sonnet model for BALANCED tier', () => {
    expect(getModelForTier('BALANCED')).toContain('sonnet');
  });

  it('should return opus model for POWERFUL tier', () => {
    expect(getModelForTier('POWERFUL')).toContain('opus');
  });
});
