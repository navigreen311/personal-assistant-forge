# Worker 01: App Shell, Root Layout, Providers

## Branch

`ai-feature/p2-w01-app-shell`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/not-found.tsx` (create)
- `src/app/global-error.tsx` (create)
- `src/app/globals.css`

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `src/components/providers/index.tsx` (already exists, read only)
- Any files in `src/lib/`, `src/shared/`, `prisma/`, or `src/app/(dashboard)/`

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/components/providers/index.tsx`** -- The existing Providers component that wraps children with `SessionProvider` from next-auth. You must import and use this.
2. **`src/app/layout.tsx`** -- The current root layout with default Geist fonts and metadata. You will replace this entirely.
3. **`src/app/page.tsx`** -- The current default Next.js landing page. You will replace this entirely.
4. **`src/app/globals.css`** -- The current global styles with Tailwind directives and Geist font theme. You will clean this up.
5. **`tsconfig.json`** -- Path aliases use `@/*` mapping to `./src/*`.
6. **`package.json`** -- Note the dependencies: `next@16.1.6`, `react@19.2.3`, `next-auth@^4.24.13`, `tailwindcss@^4`.

## Requirements

### 1. Update Root Layout (`src/app/layout.tsx`)

Replace the entire file with:

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'PersonalAssistantForge',
    template: '%s | PersonalAssistantForge',
  },
  description: 'AI-powered executive operations platform',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Key requirements:
- Import `Providers` from `@/components/providers` (the existing SessionProvider wrapper).
- Use `Inter` font from `next/font/google` (not Geist). Set CSS variable `--font-inter`.
- Metadata title uses the `template` pattern so child pages can set `title: 'Inbox'` and get "Inbox | PersonalAssistantForge".
- Description must be exactly: `"AI-powered executive operations platform"`.
- Add `suppressHydrationWarning` on `<html>` to prevent hydration mismatches from browser extensions.
- Apply `font-sans antialiased` to the body.

### 2. Replace Landing Page (`src/app/page.tsx`)

Replace the entire file. The root page should redirect authenticated users to `/inbox` (the main dashboard landing):

```typescript
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/inbox');
}
```

This is a server component. It uses Next.js `redirect()` which throws a `NEXT_REDIRECT` error internally -- this is expected behavior. Every visitor to `/` will be redirected to `/inbox`, where the dashboard layout's auth check will further redirect unauthenticated users to `/login`.

### 3. Create 404 Page (`src/app/not-found.tsx`)

Create a styled 404 page:

```typescript
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900">404</h1>
        <p className="mt-4 text-xl text-gray-600">Page not found</p>
        <p className="mt-2 text-gray-500">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/inbox"
          className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
```

Requirements:
- Server component (no `'use client'`).
- Clean, centered layout with clear 404 messaging.
- Link goes to `/inbox` (the dashboard home).
- Uses Tailwind utility classes. No custom CSS.
- Accessible: proper heading hierarchy, focus-visible styles on the link.

### 4. Create Global Error Boundary (`src/app/global-error.tsx`)

Create a global error boundary that catches unhandled errors at the root level:

```typescript
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-gray-50 font-sans antialiased">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            Something went wrong
          </h1>
          <p className="mt-4 text-gray-600">
            An unexpected error occurred. Please try again.
          </p>
          {process.env.NODE_ENV === 'development' && error.message && (
            <pre className="mt-4 max-w-lg overflow-auto rounded bg-red-50 p-4 text-left text-sm text-red-800">
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            className="mt-8 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
```

Requirements:
- Must be a `'use client'` component (Next.js requirement for error boundaries).
- Must include its own `<html>` and `<body>` tags (Next.js requirement for `global-error.tsx` -- it replaces the entire root layout on error).
- Show error message only in development (`process.env.NODE_ENV === 'development'`).
- Provide a `reset` button that calls the `reset()` function to attempt re-rendering.
- No external imports -- this must be self-contained since the root layout may have failed.

### 5. Clean Up Global Styles (`src/app/globals.css`)

Replace the entire file. Remove all default Next.js boilerplate styles. Keep only Tailwind directives and essential custom properties:

```css
@import "tailwindcss";

:root {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter);
}

:root {
  --background: #ffffff;
  --foreground: #111827;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0f172a;
    --foreground: #f1f5f9;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
}

/* Remove default focus outline, use Tailwind's focus-visible */
*:focus {
  outline: none;
}

*:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}
```

Requirements:
- Use `@import "tailwindcss"` (Tailwind v4 syntax).
- Reference `--font-inter` CSS variable (set by the Inter font loader in layout.tsx).
- Dark mode support via `prefers-color-scheme`.
- Clean focus styles using `focus-visible`.
- No leftover Geist font references.
- No decorative or layout styles -- leave those to Tailwind utility classes.

## Acceptance Criteria

1. **App boots without errors**: `npm run dev` starts and the page loads.
2. **Providers wrap all pages**: Inspecting the React tree shows `SessionProvider` wrapping the entire app. Verify by checking that `useSession()` works in any child component.
3. **Redirect works**: Navigating to `http://localhost:3000/` redirects to `/inbox`.
4. **404 page renders**: Navigating to `http://localhost:3000/nonexistent-route` shows the styled 404 page with a "Back to Dashboard" link.
5. **Metadata is correct**: The page title is "PersonalAssistantForge". The description meta tag reads "AI-powered executive operations platform".
6. **Inter font loads**: The page uses Inter font (check the network tab or computed styles for `--font-inter`).
7. **Global error boundary exists**: `src/app/global-error.tsx` is a valid error boundary with reset functionality.
8. **No TypeScript errors**: `npx tsc --noEmit` succeeds with no errors in the owned files.
9. **No Geist font references remain**: The old Geist and Geist_Mono imports are fully removed.

## Implementation Steps

1. **Read context files**: Read `src/components/providers/index.tsx`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `tsconfig.json`, `package.json`.
2. **Create branch**: `git checkout -b ai-feature/p2-w01-app-shell`
3. **Update `src/app/globals.css`**: Replace with the cleaned-up Tailwind styles.
4. **Update `src/app/layout.tsx`**: Replace with the new root layout using Inter font and Providers wrapper.
5. **Replace `src/app/page.tsx`**: Replace with the redirect to `/inbox`.
6. **Create `src/app/not-found.tsx`**: Create the styled 404 page.
7. **Create `src/app/global-error.tsx`**: Create the global error boundary.
8. **Verify**: Run `npm run dev` and test all acceptance criteria.
9. **Type-check**: Run `npx tsc --noEmit` to verify no TypeScript errors.
10. **Commit**: Use conventional commits.

## Tests Required

No unit tests required for this worker -- these are purely presentational/configuration files. Verification is done through:

- `npx tsc --noEmit` -- TypeScript compilation check
- `npm run build` -- Next.js build succeeds
- Manual verification of redirect, 404 page, and metadata

## Commit Strategy

Make atomic commits in this order:

1. `feat(app): update root layout with Inter font and Providers wrapper`
   - Files: `src/app/layout.tsx`, `src/app/globals.css`
2. `feat(app): replace landing page with redirect to /inbox`
   - Files: `src/app/page.tsx`
3. `feat(app): add 404 not-found page and global error boundary`
   - Files: `src/app/not-found.tsx`, `src/app/global-error.tsx`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
