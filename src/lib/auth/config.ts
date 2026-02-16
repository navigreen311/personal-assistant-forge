import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@/lib/db';
import { verifyPassword } from './helpers';
import type { UserRole } from './types';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        // Password is stored in preferences.hashedPassword
        const prefs = user.preferences as Record<string, unknown>;
        const hashedPassword = prefs?.hashedPassword as string | undefined;

        if (!hashedPassword) return null;

        const isValid = await verifyPassword(credentials.password, hashedPassword);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        // Auto-create user on first Google sign-in
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (!existingUser) {
          const newUser = await prisma.user.create({
            data: {
              name: user.name ?? 'User',
              email: user.email!,
              preferences: {
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
              userId: newUser.id,
              name: 'Personal',
              type: 'Personal',
            },
          });
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in: attach user data to token
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
          include: { entities: { take: 1, orderBy: { createdAt: 'asc' } } },
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = 'owner' as UserRole;
          token.activeEntityId = dbUser.entities[0]?.id;
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.activeEntityId = token.activeEntityId;
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
};
