# Worker 03: Error Boundaries & Loading States

## Branch

`ai-feature/p2-w03-error-loading`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

**Shared components (create):**
- `src/app/(dashboard)/_components/ErrorFallback.tsx`
- `src/app/(dashboard)/_components/LoadingSpinner.tsx`

**Error boundaries (create `error.tsx` in EVERY route directory below):**
- `src/app/(dashboard)/inbox/error.tsx`
- `src/app/(dashboard)/calendar/error.tsx`
- `src/app/(dashboard)/tasks/error.tsx`
- `src/app/(dashboard)/projects/error.tsx`
- `src/app/(dashboard)/decisions/error.tsx`
- `src/app/(dashboard)/finance/error.tsx`
- `src/app/(dashboard)/knowledge/error.tsx`
- `src/app/(dashboard)/communication/error.tsx`
- `src/app/(dashboard)/contacts/error.tsx`
- `src/app/(dashboard)/entities/error.tsx`
- `src/app/(dashboard)/voiceforge/error.tsx`
- `src/app/(dashboard)/capture/error.tsx`
- `src/app/(dashboard)/workflows/error.tsx`
- `src/app/(dashboard)/execution/error.tsx`
- `src/app/(dashboard)/trust/error.tsx`
- `src/app/(dashboard)/analytics/error.tsx`
- `src/app/(dashboard)/ai-quality/error.tsx`
- `src/app/(dashboard)/crisis/error.tsx`
- `src/app/(dashboard)/health/error.tsx`
- `src/app/(dashboard)/household/error.tsx`
- `src/app/(dashboard)/travel/error.tsx`
- `src/app/(dashboard)/adoption/error.tsx`
- `src/app/(dashboard)/onboarding/error.tsx`
- `src/app/(dashboard)/documents/error.tsx`
- `src/app/(dashboard)/delegation/error.tsx`
- `src/app/(dashboard)/attention/error.tsx`
- `src/app/(dashboard)/developer/error.tsx`
- `src/app/(dashboard)/settings/error.tsx`

**Loading states (create `loading.tsx` in EVERY route directory below):**
- `src/app/(dashboard)/inbox/loading.tsx`
- `src/app/(dashboard)/calendar/loading.tsx`
- `src/app/(dashboard)/tasks/loading.tsx`
- `src/app/(dashboard)/projects/loading.tsx`
- `src/app/(dashboard)/decisions/loading.tsx`
- `src/app/(dashboard)/finance/loading.tsx`
- `src/app/(dashboard)/knowledge/loading.tsx`
- `src/app/(dashboard)/communication/loading.tsx`
- `src/app/(dashboard)/contacts/loading.tsx`
- `src/app/(dashboard)/entities/loading.tsx`
- `src/app/(dashboard)/voiceforge/loading.tsx`
- `src/app/(dashboard)/capture/loading.tsx`
- `src/app/(dashboard)/workflows/loading.tsx`
- `src/app/(dashboard)/execution/loading.tsx`
- `src/app/(dashboard)/trust/loading.tsx`
- `src/app/(dashboard)/analytics/loading.tsx`
- `src/app/(dashboard)/ai-quality/loading.tsx`
- `src/app/(dashboard)/crisis/loading.tsx`
- `src/app/(dashboard)/health/loading.tsx`
- `src/app/(dashboard)/household/loading.tsx`
- `src/app/(dashboard)/travel/loading.tsx`
- `src/app/(dashboard)/adoption/loading.tsx`
- `src/app/(dashboard)/onboarding/loading.tsx`
- `src/app/(dashboard)/documents/loading.tsx`
- `src/app/(dashboard)/delegation/loading.tsx`
- `src/app/(dashboard)/attention/loading.tsx`
- `src/app/(dashboard)/developer/loading.tsx`
- `src/app/(dashboard)/settings/loading.tsx`

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- Any existing `page.tsx` files
- Any existing `layout.tsx` files
- `src/app/layout.tsx`, `src/app/global-error.tsx` (Worker 01's responsibility)
- Any files in `src/lib/`, `src/shared/`, `prisma/`, `src/components/`

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/app/(dashboard)/`** -- List all directories to confirm the 28 route groups exist. Your error.tsx and loading.tsx files go inside these existing directories.
2. **`tsconfig.json`** -- Path aliases: `@/*` maps to `./src/*`.
3. **`package.json`** -- Dependencies include `next@16.1.6`, `react@19.2.3`.

Note: The `_components` directory inside `(dashboard)` uses Next.js convention for private folders (prefixed with `_`). These are not routes -- they hold shared components used only by dashboard routes.

## Requirements

### 1. Shared Error Fallback Component (`src/app/(dashboard)/_components/ErrorFallback.tsx`)

Create a reusable error display component:

```typescript
'use client';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  moduleName?: string;
}

export function ErrorFallback({ error, reset, moduleName }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        {/* Error icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Module name */}
        {moduleName && (
          <p className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
            {moduleName}
          </p>
        )}

        {/* Error heading */}
        <h2 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h2>

        {/* Error message */}
        <p className="mt-2 text-sm text-gray-600">
          An error occurred while loading this page. Please try again.
        </p>

        {/* Dev-only error details */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Error Details
            </summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-gray-100 p-4 text-xs text-red-800">
              {error.message}
              {error.stack && (
                <>
                  {'\n\n'}
                  {error.stack}
                </>
              )}
            </pre>
            {error.digest && (
              <p className="mt-2 text-xs text-gray-500">
                Digest: {error.digest}
              </p>
            )}
          </details>
        )}

        {/* Retry button */}
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  );
}
```

Requirements:
- Must be a `'use client'` component.
- Accepts `error`, `reset`, and optional `moduleName` props.
- Shows a warning icon, error heading, and descriptive text.
- In development mode, shows expandable error details (message + stack trace) inside a `<details>` element.
- Shows the `error.digest` (Next.js error digest for server errors) in development.
- Retry button calls `reset()` to attempt re-rendering the errored segment.
- Clean, centered layout that fits within the dashboard content area.

### 2. Shared Loading Spinner Component (`src/app/(dashboard)/_components/LoadingSpinner.tsx`)

Create a reusable loading state component with skeleton elements:

```typescript
interface LoadingSpinnerProps {
  moduleName?: string;
  variant?: 'spinner' | 'skeleton' | 'dots';
}

export function LoadingSpinner({ moduleName, variant = 'skeleton' }: LoadingSpinnerProps) {
  // ... render based on variant
}
```

**Variants:**

**`skeleton` (default):** Shows a skeleton layout mimicking a typical dashboard page:
- A title bar skeleton (h-8 w-48 rounded)
- A row of 3-4 stat card skeletons (h-24 rounded-lg)
- A table/list skeleton with 5 rows (h-12 each)
- Use `animate-pulse` on all skeleton elements
- Background: `bg-gray-200` on light

**`spinner`:** Shows a centered spinning circle:
- Use CSS animation (`animate-spin`)
- SVG circle with a gap (standard spinner pattern)
- Size: 48px
- Color: `text-blue-600`

**`dots`:** Shows three bouncing dots:
- Three circles with staggered `animation-delay`
- Use `@keyframes bounce`

All variants:
- Optionally show `moduleName` as a label below the animation: "Loading {moduleName}..."
- Centered within `min-h-[50vh]`
- No `'use client'` directive needed (this is a server component -- no interactivity)

### 3. Error Boundary Files (`error.tsx` in every route)

Create `error.tsx` in each of the 28 dashboard route directories. Each file follows this exact pattern:

```typescript
'use client';

import { ErrorFallback } from '../_components/ErrorFallback';

export default function ModuleNameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} moduleName="Module Name" />;
}
```

**Module names for each route:**

| Route Directory | moduleName | Function Name |
|----------------|------------|---------------|
| `inbox` | `"Inbox"` | `InboxError` |
| `calendar` | `"Calendar"` | `CalendarError` |
| `tasks` | `"Tasks"` | `TasksError` |
| `projects` | `"Projects"` | `ProjectsError` |
| `decisions` | `"Decisions"` | `DecisionsError` |
| `finance` | `"Finance"` | `FinanceError` |
| `knowledge` | `"Knowledge Base"` | `KnowledgeError` |
| `communication` | `"Communication"` | `CommunicationError` |
| `contacts` | `"Contacts"` | `ContactsError` |
| `entities` | `"Entities"` | `EntitiesError` |
| `voiceforge` | `"VoiceForge"` | `VoiceForgeError` |
| `capture` | `"Voice Capture"` | `CaptureError` |
| `workflows` | `"Workflows"` | `WorkflowsError` |
| `execution` | `"Execution"` | `ExecutionError` |
| `trust` | `"Trust & Safety"` | `TrustError` |
| `analytics` | `"Analytics"` | `AnalyticsError` |
| `ai-quality` | `"AI Quality"` | `AIQualityError` |
| `crisis` | `"Crisis Management"` | `CrisisError` |
| `health` | `"Health"` | `HealthError` |
| `household` | `"Household"` | `HouseholdError` |
| `travel` | `"Travel"` | `TravelError` |
| `adoption` | `"Adoption"` | `AdoptionError` |
| `onboarding` | `"Onboarding"` | `OnboardingError` |
| `documents` | `"Documents"` | `DocumentsError` |
| `delegation` | `"Delegation"` | `DelegationError` |
| `attention` | `"Attention"` | `AttentionError` |
| `developer` | `"Developer Tools"` | `DeveloperError` |
| `settings` | `"Settings"` | `SettingsError` |

Each `error.tsx`:
- Must have `'use client'` directive (Next.js requirement for error boundaries).
- Must import `ErrorFallback` from `../_components/ErrorFallback` (relative path from the route directory to the `_components` directory).
- Must export a default function with the correct signature `{ error, reset }`.
- Must pass the correct `moduleName` string.

### 4. Loading State Files (`loading.tsx` in every route)

Create `loading.tsx` in each of the 28 dashboard route directories. Each file follows this exact pattern:

```typescript
import { LoadingSpinner } from '../_components/LoadingSpinner';

export default function ModuleNameLoading() {
  return <LoadingSpinner moduleName="Module Name" />;
}
```

**Module names:** Same mapping as the error.tsx table above.

**Function naming:** Same pattern -- `InboxLoading`, `CalendarLoading`, etc.

Each `loading.tsx`:
- No `'use client'` directive (server component is fine for loading states).
- Import `LoadingSpinner` from `../_components/LoadingSpinner`.
- Export a default function.
- Pass the correct `moduleName` string.

### 5. Automation Script (optional but recommended)

Since this worker creates 58+ files (2 shared components + 28 error files + 28 loading files), consider writing a helper script or using a systematic approach:

- Create the `_components` directory and shared components first.
- Then iterate through each route directory creating the `error.tsx` and `loading.tsx` files.
- Use a consistent template for each file, only changing the module name and function name.
- Verify file count at the end: `find src/app/\(dashboard\) -name "error.tsx" | wc -l` should be 28. `find src/app/\(dashboard\) -name "loading.tsx" | wc -l` should be 28.

## Acceptance Criteria

1. **Shared components exist**: `ErrorFallback.tsx` and `LoadingSpinner.tsx` exist in `src/app/(dashboard)/_components/`.
2. **Error boundary count**: Exactly 28 `error.tsx` files exist across all dashboard route directories.
3. **Loading state count**: Exactly 28 `loading.tsx` files exist across all dashboard route directories.
4. **Error boundaries work**: Each `error.tsx` is a valid `'use client'` component that renders the `ErrorFallback` with the correct module name.
5. **Loading states work**: Each `loading.tsx` renders the `LoadingSpinner` with the correct module name.
6. **ErrorFallback features**: Shows error icon, heading, description, retry button. Shows stack trace in development mode only.
7. **LoadingSpinner features**: Shows skeleton layout by default with `animate-pulse` animation.
8. **No existing files modified**: No `page.tsx` or `layout.tsx` files were changed.
9. **No TypeScript errors**: `npx tsc --noEmit` succeeds.
10. **Build succeeds**: `npm run build` completes without errors.

## Implementation Steps

1. **Read context**: List `src/app/(dashboard)/` to confirm all 28 route directories exist.
2. **Create branch**: `git checkout -b ai-feature/p2-w03-error-loading`
3. **Create `_components` directory**: `mkdir -p src/app/(dashboard)/_components`
4. **Create `ErrorFallback.tsx`**: Build the shared error display component.
5. **Create `LoadingSpinner.tsx`**: Build the shared loading state component.
6. **Create all 28 `error.tsx` files**: One in each route directory, each importing ErrorFallback with the correct module name.
7. **Create all 28 `loading.tsx` files**: One in each route directory, each importing LoadingSpinner with the correct module name.
8. **Verify file counts**: Count error.tsx and loading.tsx files to ensure 28 each.
9. **Type-check**: Run `npx tsc --noEmit`.
10. **Build**: Run `npm run build` to verify everything compiles.
11. **Commit**: Use conventional commits.

## Tests Required

No unit tests required for this worker -- these are simple wrapper components. Verification is done through:

- `npx tsc --noEmit` -- TypeScript compilation check
- `npm run build` -- Next.js build succeeds
- File count verification: 28 error.tsx + 28 loading.tsx + 2 shared components = 58 files total

## Commit Strategy

Make atomic commits in this order:

1. `feat(dashboard): add shared ErrorFallback and LoadingSpinner components`
   - Files: `src/app/(dashboard)/_components/ErrorFallback.tsx`, `src/app/(dashboard)/_components/LoadingSpinner.tsx`
2. `feat(dashboard): add error boundaries to all 28 dashboard routes`
   - Files: all 28 `error.tsx` files
3. `feat(dashboard): add loading states to all 28 dashboard routes`
   - Files: all 28 `loading.tsx` files

After all commits, verify with `git log --oneline` that the history is clean and descriptive. Also verify file counts:
```bash
find src/app/\(dashboard\) -name "error.tsx" | wc -l   # expect 28
find src/app/\(dashboard\) -name "loading.tsx" | wc -l  # expect 28
```
