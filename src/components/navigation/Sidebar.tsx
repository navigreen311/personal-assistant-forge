'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Lightweight Entity type for sidebar use
// ---------------------------------------------------------------------------

interface SidebarEntity {
  id: string;
  name: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Navigation structure – all 28 modules grouped by category
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavGroup {
  category: string;
  defaultCollapsed?: boolean;
  items: NavItem[];
}

// Simple 16×16 SVG helper
function Icon({ d }: { d: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

// Multi-path SVG icon
function MIcon({ paths }: { paths: string[] }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

const NAV_GROUPS: NavGroup[] = [
  {
    category: 'CORE',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <MIcon paths={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z']} /> },
      { href: '/inbox', label: 'Inbox', icon: <MIcon paths={['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'M22 6l-10 7L2 6']} /> },
      { href: '/calendar', label: 'Calendar', icon: <MIcon paths={['M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18']} /> },
      { href: '/tasks', label: 'Tasks', icon: <MIcon paths={['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11']} /> },
      { href: '/projects', label: 'Projects', icon: <MIcon paths={['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z']} /> },
      { href: '/contacts', label: 'Contacts', icon: <MIcon paths={['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75']} /> },
      { href: '/decisions', label: 'Decisions', icon: <MIcon paths={['M12 3v18', 'M2 12l4-4v8l-4-4z', 'M22 12l-4-4v8l4-4z']} /> },
      { href: '/documents', label: 'Documents', icon: <MIcon paths={['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8']} /> },
    ],
  },
  {
    category: 'VOICE',
    items: [
      { href: '/voiceforge', label: 'VoiceForge', icon: <MIcon paths={['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z']} /> },
      { href: '/capture', label: 'Voice Capture', icon: <MIcon paths={['M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v4', 'M8 23h8']} /> },
      { href: '/communication', label: 'Communication', icon: <MIcon paths={['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z']} /> },
      { href: '/shadow', label: 'Shadow', icon: <MIcon paths={['M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7l-1 4H10l-1-4c-2-1.5-4-4-4-7a7 7 0 0 1 7-7z', 'M10 22h4']} /> },
    ],
  },
  {
    category: 'OPERATIONS',
    items: [
      { href: '/workflows', label: 'Workflows', icon: <MIcon paths={['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 9a9 9 0 0 1-9 9']} /> },
      { href: '/execution', label: 'Execution', icon: <Icon d="M5 3l14 9-14 9V3z" /> },
      { href: '/delegation', label: 'Delegation', icon: <MIcon paths={['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13']} /> },
      { href: '/finance', label: 'Finance', icon: <MIcon paths={['M12 1v22', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6']} /> },
    ],
  },
  {
    category: 'ANALYTICS',
    items: [
      { href: '/analytics', label: 'Analytics', icon: <MIcon paths={['M18 20V10', 'M12 20V4', 'M6 20v-6']} /> },
      { href: '/ai-quality', label: 'AI Quality', icon: <MIcon paths={['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']} /> },
      { href: '/attention', label: 'Attention', icon: <MIcon paths={['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z']} /> },
    ],
  },
  {
    category: 'LIFE',
    items: [
      { href: '/health', label: 'Health', icon: <Icon d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /> },
      { href: '/household', label: 'Household', icon: <MIcon paths={['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10']} /> },
      { href: '/travel', label: 'Travel', icon: <MIcon paths={['M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z', 'M8 2v16', 'M16 6v16']} /> },
      { href: '/crisis', label: 'Crisis', icon: <MIcon paths={['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01']} /> },
    ],
  },
  {
    category: 'PLATFORM',
    items: [
      { href: '/entities', label: 'Entities', icon: <MIcon paths={['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']} /> },
      { href: '/knowledge', label: 'Knowledge', icon: <MIcon paths={['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z']} /> },
      { href: '/trust', label: 'Trust & Safety', icon: <MIcon paths={['M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z', 'M7 11V7a5 5 0 0 1 10 0v4']} /> },
      { href: '/trust', label: 'Security', icon: <MIcon paths={['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4']} /> },
      { href: '/adoption', label: 'Adoption', icon: <MIcon paths={['M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z', 'M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z', 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0', 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5']} /> },
      { href: '/onboarding', label: 'Onboarding', icon: <MIcon paths={['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49', 'M12 12h.01']} /> },
      { href: '/settings', label: 'Admin', icon: <MIcon paths={['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z']} /> },
    ],
  },
  {
    category: 'ENGINES',
    defaultCollapsed: true,
    items: [
      { href: '/engines/triage', label: 'Triage Engine', icon: <Icon d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" /> },
      { href: '/engines/draft', label: 'Draft Engine', icon: <Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /> },
      { href: '/engines/classification', label: 'Classification', icon: <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /> },
      { href: '/engines/scheduling', label: 'Scheduling', icon: <Icon d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.5" /> },
      { href: '/engines/voice', label: 'Voice Engine', icon: <Icon d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /> },
      { href: '/developer', label: 'Developer Tools', icon: <MIcon paths={['M16 18l6-6-6-6', 'M8 6l-6 6 6 6']} /> },
    ],
  },
];

// ---------------------------------------------------------------------------
// Eye circle for Attention icon
// ---------------------------------------------------------------------------
function AttentionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Patch the Attention nav item to use the circle variant
NAV_GROUPS[3].items[2] = {
  ...NAV_GROUPS[3].items[2],
  icon: <AttentionIcon />,
};

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar({
  collapsed,
  onToggle,
  badges,
}: {
  collapsed: boolean;
  onToggle: () => void;
  badges?: Record<string, number>;
}) {
  const { data: session, update: updateSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => {
      if (g.defaultCollapsed) initial[g.category] = true;
    });
    return initial;
  });
  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(href + '/'),
    [pathname],
  );

  // --- Entity switcher state ---
  const [entities, setEntities] = useState<SidebarEntity[]>([]);
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const entityDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch entities on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities?page=1&pageSize=100');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setEntities(json.data.map((e: SidebarEntity) => ({ id: e.id, name: e.name, type: e.type })));
        }
      } catch {
        // Silently fail — entity list is non-critical
      }
    }
    if (session?.user?.activeEntityId) {
      fetchEntities();
    }
    return () => { cancelled = true; };
  }, [session?.user?.activeEntityId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
        setEntityDropdownOpen(false);
      }
    }
    if (entityDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [entityDropdownOpen]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const activeEntity = entities.find((e) => e.id === session?.user?.activeEntityId);

  const handleSwitchEntity = async (entityId: string) => {
    if (entityId === session?.user?.activeEntityId) {
      setEntityDropdownOpen(false);
      return;
    }
    setSwitchingTo(entityId);
    try {
      const res = await fetch('/api/auth/switch-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      });
      if (!res.ok) {
        throw new Error('Failed to switch entity');
      }
      const targetEntity = entities.find((e) => e.id === entityId);
      setEntityDropdownOpen(false);
      setToastMessage(`Switched to ${targetEntity?.name ?? 'entity'}`);
      // Refresh session and page to reflect new active entity
      await updateSession();
      router.refresh();
    } catch {
      setToastMessage('Failed to switch entity');
    } finally {
      setSwitchingTo(null);
    }
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const initials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <aside
      className={`flex flex-col bg-gray-900 text-gray-300 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      } h-screen sticky top-0 z-40 overflow-hidden`}
    >
      {/* Header / Toggle */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-gray-800 shrink-0">
        {!collapsed && (
          <span className="text-white font-semibold text-lg truncate">PAF</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {collapsed ? (
              <>
                <path d="M3 12h18" />
                <path d="M3 6h18" />
                <path d="M3 18h18" />
              </>
            ) : (
              <>
                <path d="M11 19l-7-7 7-7" />
                <path d="M18 5v14" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {NAV_GROUPS.map((group) => {
          const isCatCollapsed = collapsedCategories[group.category];
          return (
            <div key={group.category} className="mb-1">
              {/* Category header */}
              {!collapsed && (
                <button
                  onClick={() => toggleCategory(group.category)}
                  className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-400 transition-colors"
                >
                  <span>{group.category}</span>
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`transition-transform ${isCatCollapsed ? '-rotate-90' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}

              {/* Links */}
              {!isCatCollapsed &&
                group.items.map((item) => {
                  const active = isActive(item.href);
                  const itemBadge = badges?.[item.href];
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      className={`relative flex items-center gap-3 px-4 py-2 mx-2 rounded-md text-sm transition-colors ${
                        active
                          ? 'bg-gray-800 text-white border-l-2 border-blue-500 pl-3.5'
                          : 'hover:bg-gray-800 hover:text-white'
                      } ${collapsed ? 'justify-center mx-1 px-0' : ''}`}
                      title={collapsed ? item.label : undefined}
                    >
                      {item.icon}
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && itemBadge !== undefined && itemBadge > 0 && (
                        <span className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          item.href === '/inbox' ? 'bg-red-500 text-white' :
                          item.href === '/tasks' ? 'bg-amber-500 text-white' :
                          'bg-gray-500 text-white'
                        }`}>
                          {itemBadge}
                        </span>
                      )}
                      {collapsed && itemBadge !== undefined && itemBadge > 0 && (
                        <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                          item.href === '/inbox' ? 'bg-red-500' : 'bg-amber-500'
                        }`} />
                      )}
                    </Link>
                  );
                })}

              {/* Show divider line in collapsed mode between groups */}
              {collapsed && (
                <div className="mx-3 my-1 border-t border-gray-800" />
              )}
            </div>
          );
        })}
      </nav>

      {/* Entity Switcher */}
      {session?.user?.activeEntityId && (
        <div
          ref={entityDropdownRef}
          className={`relative px-4 py-2 border-t border-gray-800 shrink-0 ${
            collapsed ? 'px-2 text-center' : ''
          }`}
        >
          {collapsed ? (
            <button
              onClick={() => setEntityDropdownOpen(!entityDropdownOpen)}
              className="w-8 h-8 mx-auto rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-semibold"
              title={activeEntity?.name ?? 'Active Entity'}
            >
              {activeEntity?.name?.[0]?.toUpperCase() ?? 'E'}
            </button>
          ) : (
            <div className="text-xs">
              <div className="text-gray-500 font-medium mb-0.5">Active Entity</div>
              <button
                onClick={() => setEntityDropdownOpen(!entityDropdownOpen)}
                className="w-full flex items-center justify-between gap-1 rounded px-1.5 py-1 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <span className="truncate text-sm font-medium">
                  {activeEntity?.name ?? (entities.length > 0 ? 'Unknown Entity' : 'Loading...')}
                </span>
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`shrink-0 text-gray-500 transition-transform ${entityDropdownOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          )}

          {/* Dropdown */}
          {entityDropdownOpen && (
            <div
              className={`absolute z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 ${
                collapsed
                  ? 'left-full ml-2 bottom-0 w-56'
                  : 'bottom-full mb-1 left-0 right-0'
              }`}
              role="listbox"
              aria-label="Select entity"
            >
              <div className="max-h-48 overflow-y-auto">
                {entities.map((entity) => {
                  const isCurrentEntity = entity.id === session?.user?.activeEntityId;
                  const isSwitching = switchingTo === entity.id;
                  return (
                    <button
                      key={entity.id}
                      role="option"
                      aria-selected={isCurrentEntity}
                      disabled={isSwitching}
                      onClick={() => handleSwitchEntity(entity.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isCurrentEntity
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      } ${isSwitching ? 'opacity-50' : ''}`}
                    >
                      <span className="truncate flex-1">{entity.name}</span>
                      {isCurrentEntity && (
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="shrink-0 text-blue-400">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                      {isSwitching && (
                        <span className="shrink-0 text-gray-400 text-xs">...</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-gray-700">
                <Link
                  href="/entities"
                  onClick={() => setEntityDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-700 transition-colors"
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Create new entity
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className="absolute bottom-20 left-4 right-4 z-50 bg-gray-700 text-white text-xs px-3 py-2 rounded-lg shadow-lg animate-pulse">
          {toastMessage}
        </div>
      )}

      {/* User Section */}
      <div
        className={`border-t border-gray-800 shrink-0 ${
          collapsed ? 'p-2' : 'p-4'
        }`}
      >
        <div
          className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {initials}
          </div>
          {!collapsed && session?.user && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {session.user.name}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {session.user.email}
              </div>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className={`mt-3 w-full flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Sign out"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
