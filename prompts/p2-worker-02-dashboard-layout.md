# Worker 02: Dashboard Layout, Sidebar Navigation, Dashboard Home

## Branch

`ai-feature/p2-w02-dashboard-layout`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/app/(dashboard)/layout.tsx` (create)
- `src/app/(dashboard)/page.tsx` (create)
- `src/components/navigation/Sidebar.tsx` (create)
- `src/components/navigation/Header.tsx` (create)
- `src/components/navigation/Breadcrumbs.tsx` (create)
- `src/components/navigation/index.ts` (create -- barrel export)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `src/app/layout.tsx` (root layout is Worker 01's responsibility)
- `src/components/providers/index.tsx`
- Any `page.tsx` files inside module route directories (e.g., `src/app/(dashboard)/inbox/page.tsx`)
- Any files in `src/lib/`, `src/shared/`, `prisma/`

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/components/providers/index.tsx`** -- The Providers component wrapping with `SessionProvider`. The dashboard layout will use `useSession()` from next-auth to check auth state.
2. **`src/lib/auth/config.ts`** -- Auth configuration showing pages: `{ signIn: '/login' }`. Understand the session shape: `session.user.id`, `session.user.name`, `session.user.email`, `session.user.role`, `session.user.activeEntityId`.
3. **`src/lib/auth/types.ts`** -- Session type augmentation: `UserRole = 'owner' | 'admin' | 'member' | 'viewer'`, extended session with `activeEntityId`.
4. **`src/shared/types/index.ts`** -- All 28 module type definitions. Review the `Entity` type to understand entity switching.
5. **`tsconfig.json`** -- Path aliases: `@/*` maps to `./src/*`.
6. **`package.json`** -- Dependencies include `next-auth@^4.24.13`, `react@19.2.3`, `next@16.1.6`.
7. **`src/app/(dashboard)/`** -- List the existing route directories to understand all 28 module paths.

## Requirements

### 1. Sidebar Navigation (`src/components/navigation/Sidebar.tsx`)

Create a full-featured collapsible sidebar component:

```typescript
'use client';

// Import useSession from next-auth/react for user info
// Import usePathname from next/navigation for active state
// Import Link from next/link for navigation
```

**Navigation structure -- ALL 28 modules grouped by category:**

```
CORE
  /inbox          -- Inbox (envelope icon)
  /calendar       -- Calendar (calendar icon)
  /tasks          -- Tasks (check-square icon)
  /projects       -- Projects (folder icon)
  /contacts       -- Contacts (users icon)
  /decisions      -- Decisions (scale icon)
  /documents      -- Documents (file-text icon)

VOICE
  /voiceforge     -- VoiceForge (phone icon)
  /capture        -- Voice Capture (mic icon)
  /communication  -- Communication (message-circle icon)

OPERATIONS
  /workflows      -- Workflows (git-branch icon)
  /execution      -- Execution (play icon)
  /delegation     -- Delegation (share icon)
  /finance        -- Finance (dollar-sign icon)

ANALYTICS
  /analytics      -- Analytics (bar-chart icon)
  /ai-quality     -- AI Quality (shield icon)
  /attention      -- Attention (eye icon)

LIFE
  /health         -- Health (heart icon)
  /household      -- Household (home icon)
  /travel         -- Travel (map icon)
  /crisis         -- Crisis (alert-triangle icon)

PLATFORM
  /entities       -- Entities (building icon)
  /knowledge      -- Knowledge (book icon)
  /trust          -- Trust & Safety (lock icon)
  /security       -- Security (key icon -- note: no route exists yet, link to /trust for now)
  /adoption       -- Adoption (rocket icon)
  /onboarding     -- Onboarding (compass icon)
  /admin          -- Admin (settings icon -- note: no route exists yet, link to /settings for now)

ENGINES (collapsed by default)
  /developer      -- Developer Tools (code icon)
  /settings       -- Settings (sliders icon)
```

**Sidebar features:**
- **Collapsible**: Toggles between 256px (expanded) and 64px (collapsed). Store collapse state in localStorage key `sidebar-collapsed`.
- **Active state**: Highlight the current route using `usePathname()`. A link is active if the pathname starts with the link's href (e.g., pathname `/inbox/abc123` activates the `/inbox` link).
- **Category headers**: Show category name when expanded, hide when collapsed.
- **Icons**: Use simple inline SVG icons (16x16 or 20x20). Keep them minimal -- simple paths only. Alternatively use emoji as fallback if SVG is too verbose, but SVG is preferred.
- **User section at bottom**: Show user avatar (initials circle), name, and email when expanded. Show only initials when collapsed. Use `useSession()` data.
- **Entity switcher**: A dropdown below the user section showing "Active: [entity name]". For now, show `session.user.activeEntityId` as a label. Full entity switching logic will be built later -- just render the UI.
- **Logout button**: At the very bottom. Calls `signOut()` from `next-auth/react`.
- **Responsive**: On screens < 1024px, sidebar starts collapsed. Add a hamburger button to toggle.

**Styling:**
- Background: `bg-gray-900` (dark sidebar).
- Text: `text-gray-300` for inactive links, `text-white` for active.
- Active indicator: `bg-gray-800` background and a left border accent `border-l-2 border-blue-500`.
- Hover: `hover:bg-gray-800 hover:text-white` transition.
- Category headers: `text-xs font-semibold uppercase tracking-wider text-gray-500`.
- Smooth width transition: `transition-all duration-200`.

### 2. Header Bar (`src/components/navigation/Header.tsx`)

Create a top header bar:

```typescript
'use client';
```

**Header features:**
- **Search input**: Text input with search icon, placeholder "Search across all modules...". For now, just render the input -- search functionality will be wired later. On focus, expand width.
- **Notification bell**: Icon button with a badge showing unread count (hardcode to `0` for now -- will be wired to real data later). Show a small red dot when count > 0.
- **Quick actions dropdown**: A "+" button that opens a dropdown with options:
  - New Task
  - New Event
  - New Contact
  - New Document
  - New Workflow
  Each links to the respective module's creation page (e.g., `/tasks?action=new`). For now, just use `#` as href placeholders.
- **User avatar**: Small initials circle (duplicated from sidebar for the header). Clicking opens a dropdown with: Profile, Settings, Logout.

**Styling:**
- Height: `h-16`.
- Background: `bg-white border-b border-gray-200`.
- Sticky: `sticky top-0 z-30`.
- Shadow: subtle `shadow-sm`.
- Flex layout: search on the left, actions on the right.

### 3. Breadcrumbs (`src/components/navigation/Breadcrumbs.tsx`)

Create auto-generated breadcrumbs from the current pathname:

```typescript
'use client';

// Import usePathname from next/navigation
// Import Link from next/link
```

**Breadcrumb logic:**
- Parse `usePathname()` into segments: e.g., `/inbox/abc123/reply` becomes `['inbox', 'abc123', 'reply']`.
- Capitalize segment names and replace hyphens with spaces: `ai-quality` becomes `AI Quality`.
- First breadcrumb is always "Dashboard" linking to `/`.
- Each segment links to its cumulative path: `inbox` links to `/inbox`, `abc123` links to `/inbox/abc123`.
- The last segment is not a link (current page).
- Skip segments that look like dynamic IDs (UUID pattern or purely alphanumeric 20+ chars) -- show "Details" instead.

**Styling:**
- Text: `text-sm text-gray-500`.
- Separator: `/` or `>` between segments.
- Current page: `text-gray-900 font-medium`.
- Links: `hover:text-blue-600 transition-colors`.

### 4. Dashboard Layout (`src/app/(dashboard)/layout.tsx`)

Create the dashboard shell that wraps all 28 module pages:

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { Sidebar, Header, Breadcrumbs } from '@/components/navigation';
```

**Layout structure:**
```
+------------------+------------------------------------------+
|                  |  Header (sticky top, full width of main) |
|    Sidebar       +------------------------------------------+
|    (fixed left)  |  Breadcrumbs                             |
|    256px / 64px  +------------------------------------------+
|                  |  {children} (main content area)          |
|                  |  scrollable, padded                      |
+------------------+------------------------------------------+
```

**Requirements:**
- **Auth check**: Use `useSession()`. If `status === 'unauthenticated'`, call `redirect('/login')`. If `status === 'loading'`, show a full-page loading spinner.
- **Grid layout**: CSS Grid with `grid-template-columns: auto 1fr`. Sidebar controls its own width.
- **Main content area**: `overflow-y-auto`, `min-h-screen`, padding `p-6`.
- **Responsive**: On mobile (< 768px), sidebar is an overlay triggered by a hamburger menu in the Header.
- Pass sidebar collapse state between Sidebar and Header if needed (e.g., via React state in the layout, or via localStorage polling).

### 5. Dashboard Home (`src/app/(dashboard)/page.tsx`)

Create the dashboard home page that shows at `/` when the user is inside the dashboard layout:

```typescript
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
};
```

**Dashboard home sections:**

**A. Summary Cards (top row, 4 cards):**
- "Recent Tasks" -- count of tasks due today (hardcode: 5) with a mini bar chart placeholder
- "Upcoming Events" -- next event today (hardcode: "Team Standup at 10:00 AM") or "No events today"
- "Unread Inbox" -- count of unread messages (hardcode: 12) with trend indicator
- "Active Workflows" -- count of running workflows (hardcode: 3)

Each card:
- White background, rounded, shadow-sm, padding p-6
- Icon, label, value, and optional trend/subtitle
- Clicking links to the respective module page

**B. Quick Actions Grid (second row):**
A grid of 6 quick action buttons:
- Compose Email -> `/inbox?action=compose`
- Schedule Meeting -> `/calendar?action=new`
- Create Task -> `/tasks?action=new`
- Record Voice Note -> `/capture`
- Run Workflow -> `/workflows`
- Generate Report -> `/analytics`

Each button: icon + label, hover effect, outlined style.

**C. Activity Feed (bottom section):**
A placeholder section titled "Recent Activity" with 5 hardcoded entries:
- "AI drafted reply to Dr. Martinez" -- 5 min ago
- "Calendar event 'Board Meeting' confirmed" -- 1 hour ago
- "Task 'Review HIPAA compliance docs' completed" -- 2 hours ago
- "New message from Bobby Castellano" -- 3 hours ago
- "Workflow 'Morning Briefing' executed successfully" -- 6 hours ago

Each entry: icon (based on type), description, relative timestamp, link to relevant module.

**Styling:**
- Grid layout: summary cards in a 4-column grid (responsive: 2 columns on tablet, 1 on mobile).
- Quick actions: 3x2 grid (responsive: 2 columns on mobile).
- Activity feed: vertical list with dividers.
- Overall spacing: `space-y-8`.

## Acceptance Criteria

1. **Dashboard loads**: Navigating to any dashboard route shows the sidebar + header + content layout.
2. **Auth protection**: Unauthenticated users are redirected to `/login`. Loading state shows a spinner.
3. **Sidebar shows all 28 modules**: Every module listed in the navigation structure above is present and clickable.
4. **Sidebar collapses**: Clicking the collapse toggle shrinks the sidebar to 64px (icons only). State persists across page navigation (localStorage).
5. **Active state works**: The current route's sidebar link is highlighted.
6. **Header renders**: Search input, notification bell, and quick actions are visible.
7. **Breadcrumbs auto-generate**: Navigating to `/inbox/abc123` shows "Dashboard > Inbox > Details".
8. **Dashboard home renders**: The `/` path within the dashboard layout shows summary cards, quick actions, and activity feed.
9. **Responsive**: On mobile viewports (< 768px), the sidebar is hidden by default with a hamburger toggle. Cards stack vertically.
10. **No TypeScript errors**: `npx tsc --noEmit` succeeds with no errors in the owned files.
11. **No modifications to existing page.tsx files**: Only `src/app/(dashboard)/page.tsx` and `src/app/(dashboard)/layout.tsx` are created. No existing module page.tsx files are touched.

## Implementation Steps

1. **Read context files**: Read `src/lib/auth/config.ts`, `src/lib/auth/types.ts`, `src/components/providers/index.tsx`, `src/shared/types/index.ts`, `tsconfig.json`. List the contents of `src/app/(dashboard)/` to see all 28 module directories.
2. **Create branch**: `git checkout -b ai-feature/p2-w02-dashboard-layout`
3. **Create `src/components/navigation/Sidebar.tsx`**: Build the full sidebar with all 28 module links, collapse toggle, user section, entity switcher, and logout.
4. **Create `src/components/navigation/Header.tsx`**: Build the header with search, notifications, quick actions.
5. **Create `src/components/navigation/Breadcrumbs.tsx`**: Build the auto-generating breadcrumbs.
6. **Create `src/components/navigation/index.ts`**: Barrel export all navigation components.
7. **Create `src/app/(dashboard)/layout.tsx`**: Build the dashboard shell with auth check, grid layout, sidebar, header, breadcrumbs, and content area.
8. **Create `src/app/(dashboard)/page.tsx`**: Build the dashboard home with summary cards, quick actions, and activity feed.
9. **Verify**: Run `npm run dev` and test all acceptance criteria.
10. **Type-check**: Run `npx tsc --noEmit`.
11. **Commit**: Use conventional commits.

## Tests Required

No unit tests required for this worker -- these are UI layout components. Verification is done through:

- `npx tsc --noEmit` -- TypeScript compilation check
- `npm run build` -- Next.js build succeeds
- Manual verification of layout, navigation, auth redirect, and responsive behavior

If you want to add optional tests, create them in `tests/unit/navigation/` testing:
- Breadcrumb segment parsing logic (pure function extraction)
- Sidebar navigation link grouping

## Commit Strategy

Make atomic commits in this order:

1. `feat(nav): add Sidebar component with 28-module navigation and collapse toggle`
   - Files: `src/components/navigation/Sidebar.tsx`
2. `feat(nav): add Header component with search, notifications, and quick actions`
   - Files: `src/components/navigation/Header.tsx`
3. `feat(nav): add auto-generating Breadcrumbs component`
   - Files: `src/components/navigation/Breadcrumbs.tsx`, `src/components/navigation/index.ts`
4. `feat(dashboard): add dashboard layout with auth check, sidebar, and header`
   - Files: `src/app/(dashboard)/layout.tsx`
5. `feat(dashboard): add dashboard home page with summary cards and activity feed`
   - Files: `src/app/(dashboard)/page.tsx`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
