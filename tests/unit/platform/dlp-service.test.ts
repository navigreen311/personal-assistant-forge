import { createDLPRule, getDLPRules, checkContent, deleteDLPRule, dlpStore } from '@/modules/admin/services/dlp-service';

beforeEach(() => {
  dlpStore.clear();
});

describe('checkContent', () => {
  it('should detect regex pattern matches', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'SSN Detector',
      pattern: '\\d{3}-\\d{2}-\\d{4}',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'My SSN is 123-45-6789', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].matchedText).toBe('123-45-6789');
  });

  it('should detect keyword matches', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Confidential Detector',
      pattern: 'CONFIDENTIAL',
      action: 'WARN',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'This document is CONFIDENTIAL', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
  });

  it('should return all violated rules', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Rule 1',
      pattern: 'secret',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Rule 2',
      pattern: 'password',
      action: 'WARN',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'The secret password is here', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(2);
  });

  it('should pass clean content', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'SSN Rule',
      pattern: '\\d{3}-\\d{2}-\\d{4}',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'This is a normal document with no sensitive data', 'ALL');
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should respect scope filtering', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Documents Only',
      pattern: 'restricted',
      action: 'BLOCK',
      scope: 'DOCUMENTS',
      isActive: true,
    });

    const resultDocs = await checkContent('entity-1', 'This is restricted', 'DOCUMENTS');
    expect(resultDocs.passed).toBe(false);

    const resultMessages = await checkContent('entity-1', 'This is restricted', 'OUTBOUND_MESSAGES');
    expect(resultMessages.passed).toBe(true);
  });

  it('should only check active rules', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Inactive Rule',
      pattern: 'blocked',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: false,
    });

    const result = await checkContent('entity-1', 'This is blocked content', 'ALL');
    expect(result.passed).toBe(true);
  });
});
