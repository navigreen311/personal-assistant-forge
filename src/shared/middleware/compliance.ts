// ============================================================================
// Compliance Middleware — Data classification enforcement, consent checks, HIPAA guard
// Worker 15: Security, Privacy & Compliance
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import type { DataClassification } from '@/modules/security/types';
import type { ConsentRecord } from '@/modules/security/types';
import { complianceService } from '@/modules/security/services/compliance-service';
import { consentService } from '@/modules/security/services/consent-service';
import { classificationService } from '@/modules/security/services/classification-service';
import { redactionService } from '@/modules/security/services/redaction-service';
import { auditService } from '@/modules/security/services/audit-service';

// --- Types for Next.js App Router handlers ---

type NextApiHandler = (
  req: NextRequest,
  context?: Record<string, unknown>
) => Promise<NextResponse> | NextResponse;

// --- Classification Level Ordering ---

const CLASSIFICATION_LEVELS: Record<DataClassification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  REGULATED: 4,
};

function classificationExceeds(
  actual: DataClassification,
  allowed: DataClassification
): boolean {
  return CLASSIFICATION_LEVELS[actual] > CLASSIFICATION_LEVELS[allowed];
}

// --- Middleware Functions ---

/**
 * Data classification enforcement middleware.
 * Checks if request/response data meets classification requirements.
 * Auto-redacts sensitive data in responses if classification exceeds allowed level.
 */
export function withClassificationEnforcement(
  handler: NextApiHandler,
  options: {
    requiredClassification?: DataClassification;
    entityAware?: boolean;
  }
): NextApiHandler {
  return async (req: NextRequest, context?: Record<string, unknown>) => {
    const response = await handler(req, context);

    // Only check JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return response;
    }

    try {
      const body = await response.json();
      const responseText = JSON.stringify(body);

      // Determine allowed classification level
      let allowedClassification: DataClassification = options.requiredClassification || 'INTERNAL';

      if (options.entityAware) {
        const entityId = req.headers.get('x-entity-id');
        if (entityId) {
          const profile = await complianceService.getComplianceProfile(entityId);
          if (profile.includes('HIPAA') || profile.includes('SOX') || profile.includes('SEC')) {
            allowedClassification = 'RESTRICTED';
          }
        }
      }

      // Classify the response content
      const classification = await classificationService.classifyContent(responseText);

      if (classificationExceeds(classification.classification, allowedClassification)) {
        // Auto-redact sensitive data in the response
        const redacted = redactionService.redactContent(responseText);

        await auditService.logAuditEntry({
          actor: 'SYSTEM',
          action: 'CLASSIFICATION_ENFORCEMENT',
          resource: new URL(req.url).pathname,
          resourceId: 'response',
          entityId: req.headers.get('x-entity-id') || 'unknown',
          requestMethod: req.method,
          requestPath: new URL(req.url).pathname,
          statusCode: response.status,
          sensitivityLevel: classification.classification,
          details: {
            originalClassification: classification.classification,
            allowedClassification,
            redactedMatches: redacted.matchCount,
          },
        }).catch(() => {
          // Non-blocking audit
        });

        try {
          const redactedBody = JSON.parse(redacted.redactedText);
          return NextResponse.json(redactedBody, { status: response.status });
        } catch {
          // If redacted text isn't valid JSON, return the original with a warning
          return NextResponse.json(
            {
              ...body,
              _classificationWarning: `Response contained ${classification.classification} data exceeding ${allowedClassification} threshold`,
            },
            { status: response.status }
          );
        }
      }

      // Re-create the response since we consumed the body
      return NextResponse.json(body, {
        status: response.status,
        headers: response.headers,
      });
    } catch {
      // If we can't parse the response, pass it through
      return response;
    }
  };
}

/**
 * Consent verification middleware.
 * Checks if the contact has granted required consent before processing.
 */
export function withConsentCheck(
  handler: NextApiHandler,
  options: {
    consentType: ConsentRecord['consentType'];
    contactIdParam: string;
  }
): NextApiHandler {
  return async (req: NextRequest, context?: Record<string, unknown>) => {
    const entityId = req.headers.get('x-entity-id');
    if (!entityId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_ENTITY',
            message: 'Entity ID is required for consent verification',
          },
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // Extract contactId from query params or request body
    let contactId: string | null = null;
    const url = new URL(req.url);
    contactId = url.searchParams.get(options.contactIdParam);

    if (!contactId && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try {
        const clonedReq = req.clone();
        const body = await clonedReq.json();
        if (body && typeof body === 'object' && options.contactIdParam in body) {
          contactId = String(body[options.contactIdParam]);
        }
      } catch {
        // Body not JSON
      }
    }

    if (!contactId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_CONTACT_ID',
            message: `Contact ID parameter '${options.contactIdParam}' is required`,
          },
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // Check consent
    const hasConsent = await consentService.checkConsent(contactId, entityId, options.consentType);

    // Log consent check in audit trail
    auditService.logAuditEntry({
      actor: 'SYSTEM',
      action: 'CONSENT_CHECK',
      resource: 'consent',
      resourceId: contactId,
      entityId,
      requestMethod: req.method,
      requestPath: url.pathname,
      statusCode: hasConsent ? 200 : 403,
      sensitivityLevel: 'CONFIDENTIAL',
      details: {
        consentType: options.consentType,
        contactId,
        granted: hasConsent,
      },
    }).catch(() => {
      // Non-blocking audit
    });

    if (!hasConsent) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONSENT_REQUIRED',
            message: `Contact has not granted '${options.consentType}' consent. Processing is blocked under GDPR/CCPA.`,
            details: {
              consentType: options.consentType,
              contactId,
            },
          },
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 403 }
      );
    }

    return handler(req, context);
  };
}

/**
 * HIPAA guard middleware.
 * Auto-detects HIPAA-regulated entities and enforces PHI protection.
 */
export function withHIPAAGuard(handler: NextApiHandler): NextApiHandler {
  return async (req: NextRequest, context?: Record<string, unknown>) => {
    const entityId = req.headers.get('x-entity-id');

    // If no entity ID, pass through
    if (!entityId) {
      return handler(req, context);
    }

    // Check if entity is HIPAA-regulated
    const isHIPAA = await complianceService.isHIPAAEntity(entityId);

    if (!isHIPAA) {
      return handler(req, context);
    }

    // Entity is HIPAA-regulated — enforce protections
    const response = await handler(req, context);

    // Ensure audit logging for HIPAA access
    const url = new URL(req.url);
    auditService.logAuditEntry({
      actor: req.headers.get('x-user-id') || 'anonymous',
      actorId: req.headers.get('x-user-id') || undefined,
      action: `HIPAA_ACCESS: ${req.method} ${url.pathname}`,
      resource: url.pathname,
      resourceId: url.searchParams.get('id') || 'N/A',
      entityId,
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
      requestMethod: req.method,
      requestPath: url.pathname,
      statusCode: response.status,
      sensitivityLevel: 'REGULATED',
      details: {
        hipaaEnforced: true,
        query: Object.fromEntries(url.searchParams.entries()),
      },
    }).catch(() => {
      // Non-blocking audit
    });

    // Check response for PHI and redact if found
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        const body = await response.json();
        const responseText = JSON.stringify(body);

        const hipaaResult = await complianceService.enforceHIPAA(responseText, entityId);

        if (!hipaaResult.compliant) {
          // Parse the auto-redacted content back
          try {
            const redactedBody = JSON.parse(hipaaResult.autoRedacted);
            const newResponse = NextResponse.json(redactedBody, {
              status: response.status,
            });
            newResponse.headers.set('X-HIPAA-Enforced', 'true');
            newResponse.headers.set('X-HIPAA-Redactions', String(hipaaResult.violations.length));
            return newResponse;
          } catch {
            // If redacted text isn't valid JSON, return with warning header
            const newResponse = NextResponse.json(body, {
              status: response.status,
            });
            newResponse.headers.set('X-HIPAA-Enforced', 'true');
            newResponse.headers.set('X-HIPAA-Warning', 'PHI detected but could not auto-redact');
            return newResponse;
          }
        }

        // Compliant — return response with HIPAA header
        const newResponse = NextResponse.json(body, {
          status: response.status,
        });
        newResponse.headers.set('X-HIPAA-Enforced', 'true');
        return newResponse;
      } catch {
        // If we can't parse the response, pass through with header
        return response;
      }
    }

    return response;
  };
}

// Export helpers for testing
export { classificationExceeds, CLASSIFICATION_LEVELS };
