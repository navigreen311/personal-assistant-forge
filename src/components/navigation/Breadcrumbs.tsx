'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

/**
 * Parse a pathname segment into a display label.
 * - Replaces hyphens with spaces
 * - Special-cases known acronyms (AI)
 * - Detects dynamic IDs (UUIDs or long alphanumeric strings) and shows "Details"
 */
function segmentToLabel(segment: string): string {
  // UUID pattern: 8-4-4-4-12 hex chars
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Long alphanumeric (20+ chars) – likely a database ID
  const longIdPattern = /^[a-z0-9]{20,}$/i;

  if (uuidPattern.test(segment) || longIdPattern.test(segment)) {
    return 'Details';
  }

  return segment
    .split('-')
    .map((word) => {
      // Keep known acronyms uppercase
      if (word.toLowerCase() === 'ai') return 'AI';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function Breadcrumbs() {
  const pathname = usePathname();

  // Split into segments, filter out empty strings
  const segments = pathname.split('/').filter(Boolean);

  // Build cumulative paths
  const crumbs = segments.map((seg, i) => ({
    label: segmentToLabel(seg),
    href: '/' + segments.slice(0, i + 1).join('/'),
  }));

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
      <Link
        href="/"
        className="hover:text-blue-600 transition-colors"
      >
        Dashboard
      </Link>

      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <span className="text-gray-400">/</span>
            {isLast ? (
              <span className="text-gray-900 font-medium">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:text-blue-600 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
