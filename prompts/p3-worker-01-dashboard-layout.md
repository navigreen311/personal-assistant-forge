# Worker 01: Dashboard Layout + Home Page

## Branch

`ai-feature/p3-w01-dashboard-layout`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/app/(dashboard)/layout.tsx` (create)
- `src/app/(dashboard)/page.tsx` (replace)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any file in `src/components/navigation/`
- Any file in `src/lib/`, `src/shared/`, or `prisma/`

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/components/navigation/Sidebar.tsx`** -- Collapsible sidebar with 28-module navigation. It is a `'use client'` component. Exports a named `Sidebar` component.
2. **`src/components/navigation/Header.tsx`** -- Top header with search, notifications, quick actions. It is a `'use client'` component. Exports a named `Header` component that accepts `{ onMenuToggle: () => void }`.
3. **`src/components/navigation/Breadcrumbs.tsx`** -- Auto-generating breadcrumbs based on pathname. It is a `'use client'` component. Exports a named `Breadcrumbs` component.
4. **`src/components/navigation/index.ts`** -- Barrel export: `export { Sidebar } from './Sidebar'; export { Header } from './Header'; export { Breadcrumbs } from './Breadcrumbs';`
5. **`tsconfig.json`** -- Path aliases use `@/*` mapping to `./src/*`.
6. **`src/app/layout.tsx`** -- Root layout that wraps everything in `<Providers>` (which includes `SessionProvider`).

**Important observations:**
- `src/app/(dashboard)/layout.tsx` does NOT currently exist. All 28 dashboard routes render without a shared sidebar/header.
- `src/app/(dashboard)/page.tsx` does NOT currently exist (there is no home/dashboard page yet).
- The `Header` component requires an `onMenuToggle` callback prop to toggle the sidebar on mobile.

## Requirements

### 1. Create Dashboard Layout (`src/app/(dashboard)/layout.tsx`)

Create as a `'use client'` component with the following behavior:

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { Sidebar, Header, Breadcrumbs } from '@/components/navigation';
```

**Authentication guard:**
- Use `useSession()` from `next-auth/react` to check session status.
- If `status === 'unauthenticated'`, redirect to `/login` using `router.push('/login')`.
- While `status === 'loading'`, render a minimal loading skeleton (centered spinner or pulsing placeholder).

**Layout structure:**
- Sidebar on the left (full height, fixed or sticky).
- Main content area on the right, flex column:
  - `<Header onMenuToggle={toggleSidebar} />` at the top.
  - `<Breadcrumbs />` below the header.
  - `<main>` element wrapping `{children}` with proper padding (`p-6`), `overflow-y-auto`, and `flex-1`.
- Use a `useState<boolean>` for `sidebarOpen` state, default `true` on desktop.
- The `toggleSidebar` callback should toggle `sidebarOpen`.
- On mobile (`md:` breakpoint), sidebar should start collapsed and overlay when opened.
- The overall container should be `flex h-screen overflow-hidden`.

### 2. Replace Dashboard Home Page (`src/app/(dashboard)/page.tsx`)

Replace the file entirely with a `'use client'` component:

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
```

**Welcome section:**
- Display "Welcome back, {session.user.name}" greeting.
- Show current date formatted nicely (e.g., "Sunday, February 16, 2026").

**Quick stats cards (4 cards in a responsive grid):**
- Tasks due today -- fetch from `/api/tasks?dueToday=true` and show count.
- Unread messages -- fetch from `/api/inbox?unread=true` and show count.
- Upcoming events -- fetch from `/api/calendar/events?upcoming=true` and show count.
- Pending approvals -- fetch from `/api/workflows?status=pending_approval` and show count.
- Each card should have: an icon (SVG or text), the count (large number), the label, and a subtle background color.
- Handle loading states with skeleton placeholders. Handle fetch errors gracefully (show "--" for count).

**Quick action buttons (horizontal row):**
- "New Task" -- links to `/tasks/new` or opens a modal.
- "Compose" -- links to `/inbox/compose`.
- "Schedule" -- links to `/calendar/new`.
- "Quick Capture" -- links to `/capture`.
- Style as prominent buttons with icons.

**Recent activity feed:**
- Fetch from `/api/execution/timeline?limit=10`.
- Display as a vertical timeline list with: timestamp, action description, module badge.
- Handle empty state: "No recent activity."
- Handle loading with skeleton lines.

## Acceptance Criteria

- [ ] `src/app/(dashboard)/layout.tsx` exists as a `'use client'` component.
- [ ] Layout renders Sidebar, Header, and Breadcrumbs from `@/components/navigation`.
- [ ] Unauthenticated users are redirected to `/login`.
- [ ] Loading state shows a skeleton/spinner while session loads.
- [ ] Sidebar toggles open/closed via the Header's menu button.
- [ ] `src/app/(dashboard)/page.tsx` shows personalized welcome with user name.
- [ ] Quick stats fetch from 4 different API endpoints.
- [ ] Quick action buttons link to correct routes.
- [ ] Recent activity feed fetches from `/api/execution/timeline`.
- [ ] All fetch calls handle loading and error states gracefully.
- [ ] No imports from `@/lib/db` or `@/lib/ai` (this is a pure UI layer).
- [ ] No modifications to any file outside Owned Paths.

## Implementation Steps

1. Read all Context files listed above to understand existing component APIs.
2. Create `src/app/(dashboard)/layout.tsx`:
   a. Add `'use client'` directive.
   b. Import `useSession` from `next-auth/react`, `useRouter` from `next/navigation`, `useState`, `useEffect`, `useCallback` from `react`.
   c. Import `Sidebar`, `Header`, `Breadcrumbs` from `@/components/navigation`.
   d. Implement auth guard with redirect.
   e. Implement sidebar toggle state.
   f. Build the flex layout: sidebar + (header + breadcrumbs + main).
   g. Export as default function `DashboardLayout`.
3. Create `src/app/(dashboard)/page.tsx`:
   a. Add `'use client'` directive.
   b. Import `useSession` from `next-auth/react`, `useState`, `useEffect` from `react`.
   c. Build the welcome section.
   d. Build quick stats cards with fetch logic.
   e. Build quick action buttons.
   f. Build recent activity feed with fetch logic.
   g. Export as default function `DashboardHome`.

## Tests Required

No unit tests are required for this worker (UI-only components). Manual verification:

- Verify layout renders with sidebar, header, and breadcrumbs.
- Verify redirect to `/login` when not authenticated.
- Verify sidebar toggle works.
- Verify dashboard home page renders with welcome message.
- Verify API calls are made on mount (check Network tab).

## Commit Strategy

**Commit 1:** `feat: add dashboard layout with sidebar, header, and auth guard`
- Files: `src/app/(dashboard)/layout.tsx`

**Commit 2:** `feat: add dashboard home page with stats, quick actions, and activity feed`
- Files: `src/app/(dashboard)/page.tsx`
