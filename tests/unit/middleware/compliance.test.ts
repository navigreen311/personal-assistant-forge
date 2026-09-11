// P-00/T-003: identity no longer comes from request headers in production.
// These middlewares now ask the auth layer, which reads the verified JWT and
// checks entity ownership against the database.
//
// In THESE TESTS ONLY, the mock below resolves identity from the x-user-id /
// x-entity-id headers, so each case can inject "a verified session for this
// user and entity" in one line and every existing assertion keeps its meaning.
// The header is the test's injection point; it is not a trusted input in the
// code under test. See resolveActor / resolveVerifiedEntityId in
// src/shared/middleware/auth.ts.
jest.mock('@/shared/middleware/auth', () => ({
  resolveActor: jest.fn(async (req: { headers: { get: (k: string) => string | null } }) => {
    const id = req.headers.get('x-user-id');
    return id ? { actor: id, actorId: id } : null;
  }),
  resolveVerifiedEntityId: jest.fn(
    async (req: { headers: { get: (k: string) => string | null } }) =>
      req.headers.get('x-entity-id')
  ),
}));

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
import type { ClassificationResult, DataClassification } from '@/modules/security/types';
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
  const init: NextRequestInit = {
    method: options?.method || 'GET',
    headers: options?.headers || {},
  };
  if (options?.body) {
    init.body = options.body;
  }
  return new NextRequest(url, init);
}

/**
 * P-35: these calls carried `init as any`. The real incompatibility is one
 * field -- the DOM `RequestInit` types `signal` as `AbortSignal | null |
 * undefined` and Next narrows it to `AbortSignal | undefined` -- so `any` was
 * discarding every other field's type to paper over `signal`. Naming Next's
 * own init type checks `method`, `headers` and `body` again.
 */
type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

/**
 * A `ClassificationResult` from `classifyContent`.
 *
 * P-35: the two call sites said `{ classification: 'RESTRICTED' } as any`.
 * `ClassificationResult` has five fields and the middleware under test reads
 * only `classification`, so the other four are stated here once instead of
 * being deleted from the type ten lines further down.
 */
function classifiedAs(classification: DataClassification): ClassificationResult {
  return {
    classification,
    confidence: 1,
    reasons: [],
    regulatoryFlags: [],
    autoApplied: false,
  };
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

      mockClassify.mockResolvedValue(classifiedAs('RESTRICTED'));
      mockRedact.mockReturnValue({
        originalLength: 30,
        redactedText: '{"secret":"[REDACTED]"}',
        matches: [],
        matchCount: 1,
        categories: [],
      });

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

      mockClassify.mockResolvedValue(classifiedAs('PUBLIC'));

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
    // P-00/T-003. This test previously asserted the OPPOSITE: that a request
    // with no entity header passed straight through to the handler. That made
    // omitting a header the way to switch PHI protection off, and a passing test
    // was defending it. The assertion is inverted deliberately, and the new one
    // is stricter than the old one, not looser.
    it('should FAIL CLOSED when the entity cannot be verified', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ data: 'test' }, { status: 200 })
      );

      const middleware = withHIPAAGuard(handler);
      const req = createMockRequest(); // no verifiable entity in scope
      const response = await middleware(req);

      // The handler must never run: a guard over regulated data that cannot
      // identify the tenant has to refuse, not wave the request on.
      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error.code).toBe('ENTITY_UNVERIFIED');
    });
  });
});
