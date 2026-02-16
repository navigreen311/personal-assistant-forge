'use client';

import React from 'react';

interface TriageScoreBadgeProps {
  score: number;
  reasoning?: string;
  size?: 'small' | 'large';
}

function getScoreColor(score: number): string {
  if (score <= 3) return '#22c55e'; // green
  if (score <= 6) return '#eab308'; // yellow
  if (score <= 8) return '#f97316'; // orange
  return '#ef4444'; // red
}

function getScoreBg(score: number): string {
  if (score <= 3) return '#f0fdf4';
  if (score <= 6) return '#fefce8';
  if (score <= 8) return '#fff7ed';
  return '#fef2f2';
}

export function TriageScoreBadge({
  score,
  reasoning,
  size = 'small',
}: TriageScoreBadgeProps) {
  const dimension = size === 'small' ? 28 : 44;
  const fontSize = size === 'small' ? 12 : 18;
  const color = getScoreColor(score);
  const bg = getScoreBg(score);

  return (
    <div
      title={reasoning}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: '50%',
        backgroundColor: bg,
        border: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        color,
        cursor: reasoning ? 'help' : 'default',
        flexShrink: 0,
      }}
    >
      {score}
    </div>
  );
}
