'use client';

import { useState, useEffect } from 'react';

interface DependencyLinesProps {
  activeTrace: string | null;
  p: any;
  taskListRef: React.RefObject<HTMLDivElement | null>;
}

export const DependencyLines = ({ activeTrace, p, taskListRef }: DependencyLinesProps) => {
  const [lines, setLines] = useState<{ x1: number, y1: number, x2: number, y2: number, color: string }[]>([]);

  useEffect(() => {
    const updateLines = () => {
      if (!activeTrace || !taskListRef.current) {
        setLines([]);
        return;
      }
      const containerRect = taskListRef.current.getBoundingClientRect();
      const activeEl = taskListRef.current.querySelector(`[data-code="${activeTrace}"]`);
      if (!activeEl) {
        setLines([]);
        return;
      }

      const activeRect = activeEl.getBoundingClientRect();
      const activeY = activeRect.top - containerRect.top + activeRect.height / 2;
      const activeX = 6; // Just inside the card edge

      const allTasks = Object.values(p.tasks).flat() as any[];
      const activeTask = allTasks.find(t => t.code === activeTrace);
      
      const newLines: any[] = [];

      // Prereqs
      activeTask?.dependsOn?.forEach((code: string) => {
        const el = taskListRef.current?.querySelector(`[data-code="${code}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const y = rect.top - containerRect.top + rect.height / 2;
          newLines.push({ x1: activeX, y1: y, x2: activeX, y2: activeY, color: 'var(--amber)' });
        }
      });

      // Dependents
      allTasks.filter(t => t.dependsOn?.includes(activeTrace)).forEach(t => {
        const el = taskListRef.current?.querySelector(`[data-code="${t.code}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const y = rect.top - containerRect.top + rect.height / 2;
          newLines.push({ x1: activeX, y1: activeY, x2: activeX, y2: y, color: 'var(--blue)' });
        }
      });

      setLines(newLines);
    };

    const raf = requestAnimationFrame(updateLines);
    const timer = setInterval(updateLines, 100);
    window.addEventListener('resize', updateLines);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener('resize', updateLines);
    };
  }, [activeTrace, p, taskListRef]);

  if (!activeTrace || lines.length === 0) return null;

  return (
    <svg 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none', 
        zIndex: 5,
        overflow: 'visible'
      }}
    >
      <defs>
        <marker id="arrowhead-amber" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--amber)" />
        </marker>
        <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--blue)" />
        </marker>
      </defs>
      {lines.map((l, i) => {
        const isUp = l.y2 < l.y1;
        const offset = 12;
        const radius = 6;
        const dist = Math.abs(l.y2 - l.y1);
        const actualRadius = Math.min(radius, dist / 2);
        
        const d = dist < 5 
          ? `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`
          : `M ${l.x1} ${l.y1} 
             L ${l.x1 - offset + actualRadius} ${l.y1} 
             Q ${l.x1 - offset} ${l.y1} ${l.x1 - offset} ${l.y1 + (isUp ? -actualRadius : actualRadius)} 
             L ${l.x1 - offset} ${l.y2 + (isUp ? actualRadius : -actualRadius)} 
             Q ${l.x1 - offset} ${l.y2} ${l.x1 - offset + actualRadius} ${l.y2} 
             L ${l.x2} ${l.y2}`;

        return (
          <g key={i}>
            <path 
              d={d}
              fill="none"
              stroke={l.color}
              strokeWidth="2"
              strokeDasharray="4 3"
              markerEnd={`url(#arrowhead-${l.color === 'var(--amber)' ? 'amber' : 'blue'})`}
              style={{ transition: 'all 0.3s ease-in-out', opacity: 0.8 }}
            />
          </g>
        );
      })}
    </svg>
  );
};
