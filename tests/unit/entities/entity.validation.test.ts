import {
  createEntitySchema,
  updateEntitySchema,
  listEntitiesSchema,
} from '@/modules/entities/entity.validation';

describe('createEntitySchema', () => {
  it('should accept valid entity input', () => {
    const result = createEntitySchema.safeParse({
      name: 'My Business LLC',
      type: 'LLC',
      complianceProfile: ['HIPAA', 'GDPR'],
      brandKit: {
        primaryColor: '#6366f1',
        secondaryColor: '#818cf8',
        logoUrl: 'https://example.com/logo.png',
        fontFamily: 'Inter',
        toneGuide: 'Professional',
      },
      voicePersonaId: 'voice-1',
      phoneNumbers: ['+15551234567'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = createEntitySchema.safeParse({
      name: '',
      type: 'LLC',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name over 100 chars', () => {
    const result = createEntitySchema.safeParse({
      name: 'A'.repeat(101),
      type: 'LLC',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid compliance profile values', () => {
    const result = createEntitySchema.safeParse({
      name: 'Test',
      type: 'LLC',
      complianceProfile: ['INVALID_PROFILE'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid brandKit color format', () => {
    const result = createEntitySchema.safeParse({
      name: 'Test',
      type: 'LLC',
      brandKit: {
        primaryColor: 'not-a-color',
        secondaryColor: '#818cf8',
      },
    });
    expect(result.success).toBe(false);
  });

  it('should accept entity without optional fields', () => {
    const result = createEntitySchema.safeParse({
      name: 'Simple Entity',
      type: 'Personal',
    });
    expect(result.success).toBe(true);
  });
});

describe('updateEntitySchema', () => {
  it('should accept partial updates', () => {
    const result = updateEntitySchema.safeParse({
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateEntitySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('listEntitiesSchema', () => {
  it('should accept valid list params', () => {
    const result = listEntitiesSchema.safeParse({
      page: '1',
      pageSize: '20',
      search: 'test',
      type: 'LLC',
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
  });

  it('should reject pageSize over 100', () => {
    const result = listEntitiesSchema.safeParse({
      pageSize: '101',
    });
    expect(result.success).toBe(false);
  });

  it('should coerce string numbers to integers', () => {
    const result = listEntitiesSchema.safeParse({
      page: '3',
      pageSize: '25',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(25);
    }
  });
});
