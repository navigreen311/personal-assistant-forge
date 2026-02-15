import 'next-auth';
import 'next-auth/jwt';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      activeEntityId?: string;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role?: UserRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    role: UserRole;
    activeEntityId?: string;
  }
}

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  activeEntityId?: string;
}
