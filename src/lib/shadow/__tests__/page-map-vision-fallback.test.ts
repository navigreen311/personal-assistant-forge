/**
 * @jest-environment jsdom
 */

import { findElementWithVisionFallback } from '../page-map-vision-fallback';
import { VAFVision } from '@/lib/vaf/vision-client';

// Mock html2canvas via the dynamic-import path. We expose a callable
// default so the SUT's `await import('html2canvas')` resolves to a
// function that returns a fake canvas with toBlob().
const html2canvasMock = jest.fn();

jest.mock(
  'html2canvas',
  () => ({
    __esModule: true,
    default: (el: HTMLElement) => html2canvasMock(el),
  }),
  { virtual: true }
);

function makeFakeCanvas(): HTMLCanvasElement {
  return {
    toBlob: (cb: (blob: Blob | null) => void) => {
      // jsdom's Blob doesn't always implement arrayBuffer(), so build a
      // minimal Blob-like object that satisfies the SUT.
      const bytes = new Uint8Array([1, 2, 3]);
      const blobLike = {
        size: bytes.length,
        type: 'image/png',
        arrayBuffer: async () => bytes.buffer,
      } as unknown as Blob;
      cb(blobLike);
    },
  } as unknown as HTMLCanvasElement;
}

describe('findElementWithVisionFallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    html2canvasMock.mockReset();
  });

  it('returns the css-selector path when the element exists', async () => {
    document.body.innerHTML = '<button data-testid="save">Save</button>';
    const visionStub = {
      analyzeScreen: jest.fn(),
    } as unknown as VAFVision;

    const result = await findElementWithVisionFallback(
      '[data-testid="save"]',
      'Save',
      visionStub
    );

    expect(result).toEqual({
      found: true,
      method: 'css_selector',
      selector: '[data-testid="save"]',
    });
    expect(visionStub.analyzeScreen).not.toHaveBeenCalled();
    expect(html2canvasMock).not.toHaveBeenCalled();
  });

  it('falls back to vision and returns method:"vision" when CSS misses', async () => {
    document.body.innerHTML = '<div>only this</div>';
    html2canvasMock.mockResolvedValue(makeFakeCanvas());

    const visionStub = {
      analyzeScreen: jest.fn().mockResolvedValue({
        elements: [
          {
            type: 'button',
            label: 'Submit Application',
            position: { x: 0, y: 0, width: 0, height: 0 },
          },
        ],
        currentPage: '/test',
        errors: [],
        suggestions: [],
      }),
    } as unknown as VAFVision;

    const result = await findElementWithVisionFallback(
      '[data-testid="missing"]',
      'submit',
      visionStub
    );

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(visionStub.analyzeScreen).toHaveBeenCalledTimes(1);
    expect(result.found).toBe(true);
    expect(result.method).toBe('vision');
    expect(result.selector).toBe('[data-testid="Submit Application"]');
    expect(result.matched?.label).toBe('Submit Application');
  });

  it('returns method:"none" when both CSS and vision fail', async () => {
    document.body.innerHTML = '<div>only this</div>';
    html2canvasMock.mockResolvedValue(makeFakeCanvas());

    const visionStub = {
      analyzeScreen: jest.fn().mockResolvedValue({
        elements: [],
        currentPage: '/test',
        errors: [],
        suggestions: [],
      }),
    } as unknown as VAFVision;

    const result = await findElementWithVisionFallback(
      '[data-testid="missing"]',
      'nonexistent',
      visionStub
    );

    expect(result).toEqual({ found: false, method: 'none' });
  });

  it('swallows html2canvas errors and returns method:"none"', async () => {
    document.body.innerHTML = '<div>only this</div>';
    html2canvasMock.mockRejectedValue(new Error('canvas blew up'));

    const visionStub = {
      analyzeScreen: jest.fn(),
    } as unknown as VAFVision;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await findElementWithVisionFallback(
      '[data-testid="missing"]',
      'whatever',
      visionStub
    );

    expect(result).toEqual({ found: false, method: 'none' });
    expect(visionStub.analyzeScreen).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
