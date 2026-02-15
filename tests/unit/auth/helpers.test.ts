// Mock modules that helpers.ts transitively imports
jest.mock('@/lib/db', () => ({
  prisma: {},
}));
jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockResolvedValue(null),
}));

import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  validateEmail,
  generateToken,
} from '@/lib/auth/helpers';

describe('hashPassword / verifyPassword', () => {
  it('should hash a password and verify it correctly', async () => {
    const password = 'SecurePass1';
    const hash = await hashPassword(password);
    const result = await verifyPassword(password, hash);
    expect(result).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const hash = await hashPassword('SecurePass1');
    const result = await verifyPassword('WrongPass1', hash);
    expect(result).toBe(false);
  });

  it('should produce different hashes for same password (salt)', async () => {
    const password = 'SecurePass1';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);
  });
});

describe('validatePasswordStrength', () => {
  it('should reject passwords shorter than 8 chars', () => {
    const result = validatePasswordStrength('Ab1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters long');
  });

  it('should reject passwords without uppercase', () => {
    const result = validatePasswordStrength('lowercase1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('should reject passwords without lowercase', () => {
    const result = validatePasswordStrength('UPPERCASE1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('should reject passwords without numbers', () => {
    const result = validatePasswordStrength('NoNumbersHere');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('should accept valid passwords', () => {
    const result = validatePasswordStrength('ValidPass1');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateEmail', () => {
  it('should accept valid email addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('test.name@domain.co')).toBe(true);
    expect(validateEmail('user+tag@mail.org')).toBe(true);
  });

  it('should reject invalid email addresses', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('missing@')).toBe(false);
    expect(validateEmail('@nodomain.com')).toBe(false);
    expect(validateEmail('spaces in@email.com')).toBe(false);
  });
});

describe('generateToken', () => {
  it('should generate token of specified length', () => {
    const token16 = generateToken(16);
    // hex encoding doubles the byte length
    expect(token16).toHaveLength(32);

    const token32 = generateToken(32);
    expect(token32).toHaveLength(64);
  });

  it('should generate unique tokens', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toBe(token2);
  });
});
