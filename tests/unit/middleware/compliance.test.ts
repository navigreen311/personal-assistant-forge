jest.mock('@/modules/security/services/compliance-service', () => ({
  complianceService: {
    getComplianceProfile: jest.fn().mockResolvedValue([]),
    isHIPAAEntity: jest.fn().mockResolvedValue(false),
    enforceHIPAA: jest.fn().mockResolvedValue({ compliant: true, violations: [], autoRedacted: '' }),
  },
}));

jest.mock('@/modules/security/services/consent-service', () => ({
  consentService: {
    checkConsent: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/modules/security/services/classification-service', () => ({
  classificationService: {
    classifyContent: jest.fn().mockResolvedValue({ classification: 'PUBLIC' }),
  },
}));

jest.mock('@/modules/security/services/redaction-service', () => ({
  redactionService: {
    redactContent: jest.fn().mockReturnValue({
      redactedText: '{"data":"[REDACTED]"}',
      matchCount: 1,
    }),
  },
}));

jest.mock('@/modules/security/services/audit-service', () => ({
  auditService: {
    logAuditEntry: jest.fn().mockResolvedValue(undefined),
  },
}));

import { NextRequest, NextResponse } from 'next/server';
import {
  withClassificationEnforcement,
  withConsentCheck,
  withHIPAAGuard,
  classificationExceeds,
  CLASSIFICATION_LEVELS,
} from '@/shared/middleware/compliance';
import { classificationService } from '@/modules/security/services/classification-service';
import { redactionService } from '@/modules/security/services/redaction-service';
import { consentService } from '@/modules/security/services/consent-service';

const mockClassify = classificationService.classifyContent as jest.MockedFunction<
  typeof classificationService.classifyContent
>;
const mockRedact = redactionService.redactContent as jest.MockedFunction<
  typeof redactionService.redactContent
>;
const mockCheckConsent = consentService.checkConsent as jest.MockedFunction<
  typeof consentService.checkConsent
>;

function createMockRequest(
  url = 'http://localhost/api/test',
  options?: { method?: string; headers?: Record<string, string>; body?: string }
): NextRequest {
  const init: RequestInit = {
    method: options?.method || 'GET',
    headers: options?.headers || {},
  };
  if (options?.body) {
    init.body = options.body;
  }
  return new NextRequest(url, init);
}

describe('compliance middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('classificationExceeds', () => {
    it('should return true when actual classification level is higher than allowed', () => {
      expect(classificationExceeds('RESTRICTED', 'INTERNAL')).toBe(true);
      expect(classificationExceeds('REGULATED', 'CONFIDENTIAL')).toBe(true);
      expect(classificationExceeds('CONFIDENTIAL', 'PUBLIC')).toBe(true);
    });

    it('should return false when actual is equal to or lower than allowed', () => {
      expect(classificationExceeds('PUBLIC', 'PUBLIC')).toBe(false);
      expect(classificationExceeds('INTERNAL', 'CONFIDENTIAL')).toBe(false);
      expect(classificationExceeds('INTERNAL', 'INTERNAL')).toBe(false);
      expect(classificationExceeds('PUBLIC', 'REGULATED')).toBe(false);
    });
  });

  describe('withClassificationEnforcement', () => {
    it('should pass through non-JSON responses unmodified', async () => {
      const handler = jest.fn().mockResolvedValue(
        new NextResponse('plain text', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      );

      const middleware = withClassificationEnforcement(handler, {
        requiredClassification: 'INTERNAL',
      });
      const req = createMockRequest();
      const response = await middleware(req);

      expect(response.status).toBe(200);
      // classifyContent should not be called for non-JSON
      expect(mockClassify).not.toHaveBeenCalled();
    });

    it('should auto-redact response when classification exceeds allowed level', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ secret: 'sensitive-data' }, { status: 200 })
      );

      mockClassify.mockResolvedValue({ classification: 'RESTRICTED' } as any);
      mockRedact.mockReturnValue({
        redactedText: '{"secret":"[REDACTED]"}',
        matchCount: 1,
      } as any);

      const middleware = withClassificationEnforcement(handler, {
        requiredClassification: 'INTERNAL',
      });
      const req = createMockRequest();
      const response = await middleware(req);

      const body = await response.json();
      expect(body.secret).toBe('[REDACTED]');
      expect(mockRedact).toHaveBeenCalled();
    });

    it('should pass through response when classification is within allowed level', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ data: 'public-info' }, { status: 200 })
      );

      mockClassify.mockResolvedValue({ classification: 'PUBLIC' } as any);

      const middleware = withClassificationEnforcement(handler, {
        requiredClassification: 'INTERNAL',
      });
      const req = createMockRequest();
      const response = await middleware(req);

      const body = await response.json();
      expect(body.data).toBe('public-info');
      expect(mockRedact).not.toHaveBeenCalled();
    });
  });

  describe('withConsentCheck', () => {
    it('should return 400 when x-entity-id header is missing', async () => {
      const handler = jest.fn();
      const middleware = withConsentCheck(handler, {
        consentType: 'DATA_PROCESSING',
        contactIdParam: 'contactId',
      });

      const req = createMockRequest('http://localhost/api/test?contactId=contact-1');
      const response = await middleware(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('MISSING_ENTITY');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 400 when contactId param is missing', async () => {
      const handler = jest.fn();
      const middleware = withConsentCheck(handler, {
        consentType: 'DATA_PROCESSING',
        contactIdParam: 'contactId',
      });

      const req = createMockRequest('http://localhost/api/test', {
        headers: { 'x-entity-id': 'entity-1' },
      });
      const response = await middleware(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('MISSING_CONTACT_ID');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 403 when consent is not granted', async () => {
      mockCheckConsent.mockResolvedValue(false);

      const handler = jest.fn();
      const middleware = withConsentCheck(handler, {
        consentType: 'DATA_PROCESSING',
        contactIdParam: 'contactId',
      });

      const req = createMockRequest('http://localhost/api/test?contactId=contact-1', {
        headers: { 'x-entity-id': 'entity-1' },
      });
      const response = await middleware(req);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('CONSENT_REQUIRED');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass through to handler when consent is granted', async () => {
      mockCheckConsent.mockResolvedValue(true);

      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ ok: true }, { status: 200 })
      );
      const middleware = withConsentCheck(handler, {
        consentType: 'DATA_PROCESSING',
        contactIdParam: 'contactId',
      });

      const req = createMockRequest('http://localhost/api/test?contactId=contact-1', {
        headers: { 'x-entity-id': 'entity-1' },
      });
      const response = await middleware(req);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('withHIPAAGuard', () => {
    it('should pass through when no entity ID is provided', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ data: 'test' }, { status: 200 })
      );

      const middleware = withHIPAAGuard(handler);
      const req = createMockRequest();
      const response = await middleware(req);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
    });
  });
});
