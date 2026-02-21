'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  name: string;
  score: number;
  entityId: string;
  entityName?: string;
  tier?: string;
  lastTouch?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface RelationshipGraphViewProps {
  contacts: GraphNode[];
  onContactClick: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_PALETTE: Record<string, string> = {};
const PALETTE_COLORS = [
  { fill: '#3b82f6', label: 'blue' },   // blue-500
  { fill: '#22c55e', label: 'green' },   // green-500
  { fill: '#a855f7', label: 'purple' },  // purple-500
  { fill: '#f97316', label: 'orange' },  // orange-500
  { fill: '#ec4899', label: 'pink' },    // pink-500
  { fill: '#14b8a6', label: 'teal' },    // teal-500
];

const MIN_RADIUS = 8;
const MAX_RADIUS = 24;
const REPULSION_STRENGTH = 3000;
const CENTER_GRAVITY = 0.01;
const ENTITY_ATTRACTION = 0.005;
const DAMPING = 0.95;
const MAX_FRAMES = 100;
const STABILITY_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreToRadius(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return MIN_RADIUS + ((MAX_RADIUS - MIN_RADIUS) * clamped) / 100;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}

function getEntityColor(entityId: string, entityColorMap: Map<string, string>): string {
  if (entityColorMap.has(entityId)) return entityColorMap.get(entityId)!;
  const idx = entityColorMap.size % PALETTE_COLORS.length;
  const color = PALETTE_COLORS[idx].fill;
  entityColorMap.set(entityId, color);
  return color;
}

function isVIP(tier?: string): boolean {
  return tier?.toUpperCase() === 'VIP';
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RelationshipGraphView({
  contacts,
  onContactClick,
}: RelationshipGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>(0);
  const frameCountRef = useRef(0);

  // ---- Entity color mapping (stable across renders) ----
  const entityColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueEntities = [...new Set(contacts.map((c) => c.entityId))];
    uniqueEntities.forEach((eid) => getEntityColor(eid, map));
    return map;
  }, [contacts]);

  // ---- Legend data ----
  const legendEntries = useMemo(() => {
    const seen = new Map<string, { entityId: string; entityName: string; color: string }>();
    contacts.forEach((c) => {
      if (!seen.has(c.entityId)) {
        seen.set(c.entityId, {
          entityId: c.entityId,
          entityName: c.entityName || c.entityId,
          color: entityColorMap.get(c.entityId) || PALETTE_COLORS[0].fill,
        });
      }
    });
    return [...seen.values()];
  }, [contacts, entityColorMap]);

  // ---- Simulation state ----
  const [nodes, setNodes] = useState<
    (GraphNode & { x: number; y: number; vx: number; vy: number })[]
  >([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // ---- Tooltip state ----
  const [tooltip, setTooltip] = useState<{
    node: GraphNode;
    x: number;
    y: number;
  } | null>(null);

  // ---- Dragging state ----
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });

  // ---- SVG dimensions (responsive) ----
  const [dimensions, setDimensions] = useState({ width: 800, height: 450 });

  useEffect(() => {
    function updateDimensions() {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    }

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    if (svgRef.current) observer.observe(svgRef.current);

    return () => observer.disconnect();
  }, []);

  // ---- Initialize node positions ----
  useEffect(() => {
    if (contacts.length === 0) {
      setNodes([]);
      return;
    }

    const { width, height } = dimensions;
    const padX = width * 0.15;
    const padY = height * 0.15;

    const initialized = contacts.map((c) => ({
      ...c,
      x: padX + Math.random() * (width - 2 * padX),
      y: padY + Math.random() * (height - 2 * padY),
      vx: 0,
      vy: 0,
    }));

    setNodes(initialized);
    frameCountRef.current = 0;
    setIsSimulating(true);
  }, [contacts, dimensions]);

  // ---- Force simulation loop ----
  const simulate = useCallback(() => {
    setNodes((prev) => {
      if (prev.length === 0) return prev;

      const { width, height } = dimensions;
      const cx = width / 2;
      const cy = height / 2;

      const next = prev.map((n) => ({ ...n }));

      // Apply forces
      for (let i = 0; i < next.length; i++) {
        let fx = 0;
        let fy = 0;

        // Repulsion from all other nodes (Coulomb's law)
        for (let j = 0; j < next.length; j++) {
          if (i === j) continue;
          const dx = next[i].x - next[j].x;
          const dy = next[i].y - next[j].y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq) || 1;
          const force = REPULSION_STRENGTH / distSq;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }

        // Center gravity
        fx += (cx - next[i].x) * CENTER_GRAVITY;
        fy += (cy - next[i].y) * CENTER_GRAVITY;

        // Entity attraction (cluster nodes from same entity)
        for (let j = 0; j < next.length; j++) {
          if (i === j) continue;
          if (next[i].entityId === next[j].entityId) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            fx += dx * ENTITY_ATTRACTION;
            fy += dy * ENTITY_ATTRACTION;
          }
        }

        // Update velocity with damping
        next[i].vx = (next[i].vx + fx) * DAMPING;
        next[i].vy = (next[i].vy + fy) * DAMPING;

        // Update position
        next[i].x += next[i].vx;
        next[i].y += next[i].vy;

        // Boundary clamping
        const r = scoreToRadius(next[i].score);
        next[i].x = Math.max(r, Math.min(width - r, next[i].x));
        next[i].y = Math.max(r, Math.min(height - r - 20, next[i].y));
      }

      return next;
    });

    frameCountRef.current += 1;

    // Check stability or max frames
    if (frameCountRef.current >= MAX_FRAMES) {
      setIsSimulating(false);
      return;
    }

    // Check velocity magnitude for early stop
    setNodes((current) => {
      const totalKinetic = current.reduce(
        (sum, n) => sum + n.vx * n.vx + n.vy * n.vy,
        0,
      );
      if (totalKinetic < STABILITY_THRESHOLD) {
        setIsSimulating(false);
      }
      return current;
    });
  }, [dimensions]);

  useEffect(() => {
    if (!isSimulating) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    function tick() {
      simulate();
      if (frameCountRef.current < MAX_FRAMES) {
        animationRef.current = requestAnimationFrame(tick);
      }
    }

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSimulating, simulate]);

  // ---- Mouse handlers ----
  const handleMouseEnter = useCallback(
    (node: GraphNode, e: React.MouseEvent) => {
      setTooltip({ node, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleMouseMove = useCallback(
    (node: GraphNode, e: React.MouseEvent) => {
      if (tooltip) {
        setTooltip({ node, x: e.clientX, y: e.clientY });
      }
    },
    [tooltip],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleNodeClick = useCallback(
    (id: string) => {
      onContactClick(id);
    },
    [onContactClick],
  );

  // ---- Drag handlers ----
  const handleDragStart = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.preventDefault();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      dragOffsetRef.current = {
        dx: node.x - (e.clientX - rect.left),
        dy: node.y - (e.clientY - rect.top),
      };
      setDragId(nodeId);
    },
    [nodes],
  );

  useEffect(() => {
    if (!dragId) return;

    function onMouseMove(e: MouseEvent) {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const newX = e.clientX - rect.left + dragOffsetRef.current.dx;
      const newY = e.clientY - rect.top + dragOffsetRef.current.dy;

      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragId ? { ...n, x: newX, y: newY, vx: 0, vy: 0 } : n,
        ),
      );
    }

    function onMouseUp() {
      setDragId(null);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragId]);

  // ---- Empty state ----
  if (contacts.length === 0) {
    return (
      <div className="w-full aspect-[16/9] bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center">
        <p className="text-gray-400 text-sm">
          Add contacts to see your relationship network
        </p>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="relative">
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="w-full aspect-[16/9] bg-gray-50 rounded-lg border border-gray-200"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Defs for VIP glow filter */}
        <defs>
          <filter id="vip-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Nodes */}
        {nodes.map((node) => {
          const r = scoreToRadius(node.score);
          const color = entityColorMap.get(node.entityId) || PALETTE_COLORS[0].fill;
          const vip = isVIP(node.tier);

          return (
            <g
              key={node.id}
              style={{ cursor: dragId === node.id ? 'grabbing' : 'pointer' }}
              onMouseEnter={(e) => handleMouseEnter(node, e)}
              onMouseMove={(e) => handleMouseMove(node, e)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleNodeClick(node.id)}
              onMouseDown={(e) => handleDragStart(node.id, e)}
            >
              {/* VIP outer glow ring */}
              {vip && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r + 4}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  opacity={0.6}
                  filter="url(#vip-glow)"
                />
              )}

              {/* Main circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={color}
                opacity={0.85}
                stroke={vip ? '#f59e0b' : '#ffffff'}
                strokeWidth={vip ? 2 : 1.5}
              />

              {/* Label */}
              <text
                x={node.x}
                y={node.y + r + 12}
                textAnchor="middle"
                fontSize={10}
                fill="#4b5563"
                pointerEvents="none"
                className="select-none"
              >
                {truncate(node.name, 12)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed bg-gray-900 text-white rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none z-50"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          <p className="font-semibold">{tooltip.node.name}</p>
          <p className="text-gray-300">Score: {tooltip.node.score}</p>
          <p className="text-gray-300">
            Entity: {tooltip.node.entityName || tooltip.node.entityId}
          </p>
          <p className="text-gray-300">
            Last touch: {formatDate(tooltip.node.lastTouch)}
          </p>
        </div>
      )}

      {/* Legend */}
      {legendEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mt-2 px-2">
          {legendEntries.map((entry) => (
            <div key={entry.entityId} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-gray-600">
                {truncate(entry.entityName, 20)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
