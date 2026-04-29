/**
 * @jest-environment jsdom
 */

/**
 * Unit tests: resolveElementWithFallback.
 *
 * Verifies the three discriminated-union branches plus the gating
 * behaviour: vision must NOT run unless `screenVisionFallback` is true.
 */

// Mock the underlying vision-fallback module so we can assert on call
// counts and shape return values without spinning up html2canvas / VAF.
jest.mock('../page-map-vision-fallback', () => ({
  findElementWithVisionFallback: jest.fn(),
}));

import { resolveElementWithFallback } from '../element-resolver';
import { findElementWithVisionFallback } from '../page-map-vision-fallback';

const mockedVisionFallback = findElementWithVisionFallback as jest.MockedFunction<
  typeof findElementWithVisionFallback
>;

describe('resolveElementWithFallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockedVisionFallback.mockReset();
  });

  it('returns method:"css" with the live element when the selector resolves', async () => {
    document.body.innerHTML = '<button data-testid="save">Save</button>';

    const result = await resolveElementWithFallback(
      '[data-testid="save"]',
      'Save',
      { screenVisionFallback: true },
    );

    expect(result.found).toBe(true);
    expect(result.method).toBe('css');
    if (result.found && result.method === 'css') {
      expect(result.element).toBeInstanceOf(Element);
      expect((result.element as HTMLElement).getAttribute('data-testid')).toBe('save');
    }
    // CSS hit: vision must not be consulted at all.
    expect(mockedVisionFallback).not.toHaveBeenCalled();
  });

  it('falls back to vision when CSS misses and gating is on', async () => {
    document.body.innerHTML = '<div>no match here</div>';
    mockedVisionFallback.mockResolvedValue({
      found: true,
      method: 'vision',
      selector: '[data-testid="Submit Application"]',
      matched: {
        type: 'button',
        label: 'Submit Application',
        position: { x: 0, y: 0, width: 0, height: 0 },
      },
    });

    const result = await resolveElementWithFallback(
      '[data-testid="missing"]',
      'submit',
      { screenVisionFallback: true },
    );

    expect(mockedVisionFallback).toHaveBeenCalledTimes(1);
    expect(mockedVisionFallback).toHaveBeenCalledWith('[data-testid="missing"]', 'submit');
    expect(result.found).toBe(true);
    expect(result.method).toBe('vision');
    if (result.found && result.method === 'vision') {
      expect(result.selector).toBe('[data-testid="Submit Application"]');
    }
  });

  it('returns method:"none" when both CSS and vision miss', async () => {
    document.body.innerHTML = '<div>nope</div>';
    mockedVisionFallback.mockResolvedValue({ found: false, method: 'none' });

    const result = await resolveElementWithFallback(
      '[data-testid="missing"]',
      'whatever',
      { screenVisionFallback: true },
    );

    expect(result).toEqual({ found: false, method: 'none' });
    expect(mockedVisionFallback).toHaveBeenCalledTimes(1);
  });

  it('does NOT consult vision when screenVisionFallback is false (default)', async () => {
    document.body.innerHTML = '<div>nope</div>';

    const result = await resolveElementWithFallback(
      '[data-testid="missing"]',
      'whatever',
    );

    expect(result).toEqual({ found: false, method: 'none' });
    expect(mockedVisionFallback).not.toHaveBeenCalled();
  });

  it('does NOT consult vision when screenVisionFallback is explicitly false', async () => {
    document.body.innerHTML = '<div>nope</div>';

    const result = await resolveElementWithFallback(
      '[data-testid="missing"]',
      'whatever',
      { screenVisionFallback: false },
    );

    expect(result).toEqual({ found: false, method: 'none' });
    expect(mockedVisionFallback).not.toHaveBeenCalled();
  });

  it('treats invalid CSS selectors as a miss without throwing', async () => {
    document.body.innerHTML = '<div>nope</div>';

    // ":::not-a-selector" makes querySelector throw a SyntaxError; the
    // resolver must swallow it and either fall through to vision or
    // return method:"none". Vision is off, so we expect "none".
    const result = await resolveElementWithFallback(
      ':::not-a-selector',
      'whatever',
    );

    expect(result).toEqual({ found: false, method: 'none' });
  });
});
