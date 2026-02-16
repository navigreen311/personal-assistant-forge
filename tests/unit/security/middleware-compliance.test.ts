// ============================================================================
// Compliance Middleware — Unit Tests
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  withConsentCheck,
  withHIPAAGuard,
  withClassificationEnforcement,
} from '@/shared/middleware/compliance';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/modules/security/services/compliance-service', () => ({
  complianceService: {
    isHIPAAEntity: jest.fn().mockResolvedValue(false),
    getComplianceProfile: jest.fn().mockResolvedValue([]),
    enforceHIPAA: jest.fn().mockResolvedValue({
      compliant: true,
      violations: [],
      autoRedacted: '',
      recommendations: [],
    }),
  },
}));

jest.mock('@/modules/security/services/consent-service', () => ({
  consentService: {
    checkConsent: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('@/modules/security/services/classification-service', () => ({
  classificationService: {
    classifyContent: jest.fn().mockResolvedValue({
      classification: 'PUBLIC',
      confidence: 0.5,
      reasons: [],
      regulatoryFlags: [],
      autoApplied: true,
    }),
  },
}));

jest.mock('@/modules/security/services/redaction-service', () => ({
  redactionService: {
    redactContent: jest.fn().mockReturnValue({
      redactedText: '{}',
      matches: [],
      matchCount: 0,
      categories: [],
    }),
  },
}));

jest.mock('@/modules/security/services/audit-service', () => ({
  auditService: {
    logAuditEntry: jest.fn().mockResolvedValue({ id: 'test' }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { complianceService } = require('@/modules/security/services/compliance-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { consentService } = require('@/modules/security/services/consent-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classificationService } = require('@/modules/security/services/classification-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redactionService } = require('@/modules/security/services/redaction-service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}): NextRequest {
  const url = options.url || 'http://localhost/api/test';
  const headers = new Headers(options.headers || {});
  if (options.body) {
    headers.set('content-type', 'application/json');
  }
  return new NextRequest(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  } as any);
}

/** Default mock handler that returns a JSON response */
const handler = jest.fn().mockImplementation(() =>
  NextResponse.json({ data: 'test' }, { status: 200 }),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Compliance Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handler.mockImplementation(() =>
      NextResponse.json({ data: 'test' }, { status: 200 }),
    );
  });

  // -----------------------------------------------------------------------
  // withConsentCheck
  // -----------------------------------------------------------------------
  describe('withConsentCheck', () => {
    const consentOptions = {
      consentType: 'DATA_PROCESSING' as const,
      contactIdParam: 'contactId',
    };

    it('should allow request when consent is granted', async () => {
      consentService.checkConsent.mockResolvedValueOnce(true);

      const wrapped = withConsentCheck(handler, consentOptions);
      const req = createMockRequest({
        url: 'http://localhost/api/test?contactId=c1',
        headers: { 'x-entity-id': 'entity-1' },
      });

      const response = await wrapped(req);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should block request (403) when consent is not granted', async () => {
      consentService.checkConsent.mockResolvedValueOnce(false);

      const wrapped = withConsentCheck(handler, consentOptions);
      const req = createMockRequest({
        url: 'http://localhost/api/test?contactId=c1',
        headers: { 'x-entity-id': 'entity-1' },
      });

      const response = await wrapped(req);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('CONSENT_REQUIRED');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should require entity ID header', async () => {
      const wrapped = withConsentCheck(handler, consentOptions);
      const req = createMockRequest({
        url: 'http://localhost/api/test?contactId=c1',
        // No x-entity-id header
      });

      const response = await wrapped(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('MISSING_ENTITY');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // withHIPAAGuard
  // -----------------------------------------------------------------------
  describe('withHIPAAGuard', () => {
    it('should activate for HIPAA entities with violations', async () => {
      complianceService.isHIPAAEntity.mockResolvedValueOnce(true);
      complianceService.enforceHIPAA.mockResolvedValueOnce({
        compliant: false,
        violations: ['PHI detected: patient name'],
        autoRedacted: JSON.stringify({ data: '[REDACTED]' }),
        recommendations: ['Remove PHI before responding'],
      });

      const wrapped = withHIPAAGuard(handler);
      const req = createMockRequest({
        headers: {
          'x-entity-id': 'hipaa-entity-1',
          'x-user-id': 'doctor-1',
        },
      });

      const response = await wrapped(req);

      expect(complianceService.isHIPAAEntity).toHaveBeenCalledWith('hipaa-entity-1');
      expect(complianceService.enforceHIPAA).toHaveBeenCalled();

      const body = await response.json();
      expect(body.data).toBe('[REDACTED]');
    });

    it('should pass through for non-HIPAA entities', async () => {
      complianceService.isHIPAAEntity.mockResolvedValueOnce(false);

      const wrapped = withHIPAAGuard(handler);
      const req = createMockRequest({
        headers: { 'x-entity-id': 'regular-entity-1' },
      });

      const response = await wrapped(req);

      expect(response.status).toBe(200);
      expect(complianceService.enforceHIPAA).not.toHaveBeenCalled();
    });

    it('should redact PHI in responses for non-compliant HIPAA entities', async () => {
      complianceService.isHIPAAEntity.mockResolvedValueOnce(true);
      complianceService.enforceHIPAA.mockResolvedValueOnce({
        compliant: false,
        violations: ['PHI: SSN detected'],
        autoRedacted: JSON.stringify({ data: '***-**-****' }),
        recommendations: [],
      });

      const wrapped = withHIPAAGuard(handler);
      const req = createMockRequest({
        headers: {
          'x-entity-id': 'hipaa-entity-2',
          'x-user-id': 'nurse-1',
        },
      });

      const response = await wrapped(req);

      const body = await response.json();
      expect(body.data).toBe('***-**-****');
    });

    it('should add X-HIPAA-Enforced header', async () => {
      complianceService.isHIPAAEntity.mockResolvedValueOnce(true);
      complianceService.enforceHIPAA.mockResolvedValueOnce({
        compliant: true,
        violations: [],
        autoRedacted: '',
        recommendations: [],
      });

      const wrapped = withHIPAAGuard(handler);
      const req = createMockRequest({
        headers: {
          'x-entity-id': 'hipaa-entity-3',
          'x-user-id': 'admin-1',
        },
      });

      const response = await wrapped(req);

      expect(response.headers.get('X-HIPAA-Enforced')).toBe('true');
    });
  });

  // -----------------------------------------------------------------------
  // withClassificationEnforcement
  // -----------------------------------------------------------------------
  describe('withClassificationEnforcement', () => {
    it('should block response data exceeding classification level', async () => {
      // Mock: response content classified as RESTRICTED, but endpoint requires PUBLIC
      classificationService.classifyContent.mockResolvedValueOnce({
        classification: 'RESTRICTED',
        confidence: 0.9,
        reasons: ['Contains PII'],
        regulatoryFlags: [],
        autoApplied: true,
      });

      redactionService.redactContent.mockReturnValueOnce({
        redactedText: JSON.stringify({ data: '[REDACTED]' }),
        matches: [{ type: 'SSN' }],
        matchCount: 1,
        categories: ['PII'],
      });

      const wrapped = withClassificationEnforcement(handler, {
        requiredClassification: 'PUBLIC',
      });

      const req = createMockRequest({
        headers: { 'x-entity-id': 'entity-1' },
      });

      const response = await wrapped(req);
      const body = await response.json();

      // Response should be redacted since RESTRICTED > PUBLIC
      expect(body.data).toBe('[REDACTED]');
      expect(redactionService.redactContent).toHaveBeenCalled();
    });

    it('should pass through when classification is within limits', async () => {
      // Mock: response classified as INTERNAL, endpoint allows INTERNAL
      classificationService.classifyContent.mockResolvedValueOnce({
        classification: 'INTERNAL',
        confidence: 0.8,
        reasons: ['Business content'],
        regulatoryFlags: [],
        autoApplied: true,
      });

      const wrapped = withClassificationEnforcement(handler, {
        requiredClassification: 'INTERNAL',
      });

      const req = createMockRequest({
        headers: { 'x-entity-id': 'entity-1' },
      });

      const response = await wrapped(req);
      const body = await response.json();

      expect(body.data).toBe('test');
      expect(redactionService.redactContent).not.toHaveBeenCalled();
    });
  });
});
