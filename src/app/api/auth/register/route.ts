import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { prisma } from '@/lib/db';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/helpers';
import { success, error } from '@/shared/utils/api-response';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid input', 400, {
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { name, email, password } = parsed.data;

    // Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return error('WEAK_PASSWORD', 'Password does not meet requirements', 400, {
        errors: strength.errors,
      });
    }

    // Check for existing user
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return error('EMAIL_EXISTS', 'An account with this email already exists', 409);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user with hashed password stored in preferences
    const user = await prisma.user.create({
      data: {
        name,
        email,
        preferences: {
          hashedPassword,
          defaultTone: 'WARM',
          attentionBudget: 10,
          focusHours: [],
          vipContacts: [],
          meetingFreedays: [],
          autonomyLevel: 'SUGGEST',
        },
        timezone: 'America/Chicago',
      },
    });

    // Create default Personal entity
    await prisma.entity.create({
      data: {
        userId: user.id,
        name: 'Personal',
        type: 'Personal',
      },
    });

    return success({ userId: user.id }, 201);
  } catch (err) {
    console.error('Registration error:', err);
    return error('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
}
