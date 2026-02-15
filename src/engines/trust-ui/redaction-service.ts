import type { Sensitivity } from '@/shared/types';
import type { SensitiveDataPreview } from './types';

interface DetectedPattern {
  start: number;
  end: number;
  type: string;
  replacement: string;
  sensitivity: Sensitivity;
}

const PATTERNS: {
  regex: RegExp;
  type: string;
  replacement: string;
  sensitivity: Sensitivity;
}[] = [
  {
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    type: 'SSN',
    replacement: '[SSN REDACTED]',
    sensitivity: 'RESTRICTED',
  },
  {
    regex: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    type: 'CREDIT_CARD',
    replacement: '[CARD REDACTED]',
    sensitivity: 'RESTRICTED',
  },
  {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    type: 'EMAIL',
    replacement: '[EMAIL REDACTED]',
    sensitivity: 'CONFIDENTIAL',
  },
  {
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    type: 'PHONE',
    replacement: '[PHONE REDACTED]',
    sensitivity: 'CONFIDENTIAL',
  },
  {
    regex: /\b(?:patient|diagnosis|treatment|prescription|medical record|HIPAA|PHI)\b/gi,
    type: 'HIPAA_TERM',
    replacement: '[HIPAA REDACTED]',
    sensitivity: 'RESTRICTED',
  },
  {
    regex: /\$[\d,]+(?:\.\d{2})?\b/g,
    type: 'FINANCIAL',
    replacement: '[AMOUNT REDACTED]',
    sensitivity: 'CONFIDENTIAL',
  },
];

export function previewRedaction(
  text: string,
  sensitivityThreshold?: Sensitivity
): SensitiveDataPreview {
  const thresholdLevel = sensitivityThreshold
    ? SENSITIVITY_ORDER[sensitivityThreshold]
    : 0;

  const detected: DetectedPattern[] = [];

  for (const pattern of PATTERNS) {
    if (SENSITIVITY_ORDER[pattern.sensitivity] < thresholdLevel) continue;

    let match: RegExpExecArray | null;
    // Reset regex lastIndex
    pattern.regex.lastIndex = 0;
    while ((match = pattern.regex.exec(text)) !== null) {
      detected.push({
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        replacement: pattern.replacement,
        sensitivity: pattern.sensitivity,
      });
    }
  }

  // Sort by start position descending to apply replacements from end
  detected.sort((a, b) => a.start - b.start);

  // Remove overlapping detections (keep the one with higher sensitivity)
  const filtered = removeOverlaps(detected);

  // Build redacted text
  let redactedText = text;
  // Apply from end to preserve positions
  const reversed = [...filtered].reverse();
  for (const d of reversed) {
    redactedText =
      redactedText.slice(0, d.start) + d.replacement + redactedText.slice(d.end);
  }

  const highestSensitivity = getHighestSensitivity(filtered);

  return {
    originalText: text,
    redactedText,
    redactions: filtered.map((d) => ({
      start: d.start,
      end: d.end,
      type: d.type,
      replacement: d.replacement,
    })),
    sensitivityLevel: mapSensitivityToPreviewLevel(highestSensitivity),
  };
}

export function applyRedaction(preview: SensitiveDataPreview): string {
  return preview.redactedText;
}

export function calculateSensitivity(text: string): Sensitivity {
  let highest: Sensitivity = 'PUBLIC';

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      if (SENSITIVITY_ORDER[pattern.sensitivity] > SENSITIVITY_ORDER[highest]) {
        highest = pattern.sensitivity;
      }
    }
  }

  return highest;
}

const SENSITIVITY_ORDER: Record<Sensitivity, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  REGULATED: 4,
};

function getHighestSensitivity(patterns: DetectedPattern[]): Sensitivity {
  if (patterns.length === 0) return 'PUBLIC';

  let highest: Sensitivity = 'PUBLIC';
  for (const p of patterns) {
    if (SENSITIVITY_ORDER[p.sensitivity] > SENSITIVITY_ORDER[highest]) {
      highest = p.sensitivity;
    }
  }
  return highest;
}

function mapSensitivityToPreviewLevel(
  s: Sensitivity
): SensitiveDataPreview['sensitivityLevel'] {
  switch (s) {
    case 'PUBLIC':
    case 'INTERNAL':
      return 'LOW';
    case 'CONFIDENTIAL':
      return 'MEDIUM';
    case 'RESTRICTED':
      return 'HIGH';
    case 'REGULATED':
      return 'CRITICAL';
    default:
      return 'LOW';
  }
}

function removeOverlaps(patterns: DetectedPattern[]): DetectedPattern[] {
  if (patterns.length <= 1) return patterns;

  const result: DetectedPattern[] = [patterns[0]];

  for (let i = 1; i < patterns.length; i++) {
    const prev = result[result.length - 1];
    const curr = patterns[i];

    if (curr.start < prev.end) {
      // Overlapping: keep the one with higher sensitivity
      if (
        SENSITIVITY_ORDER[curr.sensitivity] >
        SENSITIVITY_ORDER[prev.sensitivity]
      ) {
        result[result.length - 1] = curr;
      }
    } else {
      result.push(curr);
    }
  }

  return result;
}
