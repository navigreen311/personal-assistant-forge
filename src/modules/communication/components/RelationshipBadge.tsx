'use client';

interface RelationshipBadgeProps {
  score: number;
}

export default function RelationshipBadge({ score }: RelationshipBadgeProps) {
  let bgColor: string;
  let textColor: string;
  let label: string;

  if (score > 70) {
    bgColor = 'bg-green-100';
    textColor = 'text-green-800';
    label = 'Strong';
  } else if (score >= 40) {
    bgColor = 'bg-yellow-100';
    textColor = 'text-yellow-800';
    label = 'Moderate';
  } else {
    bgColor = 'bg-red-100';
    textColor = 'text-red-800';
    label = 'Weak';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
      <span className={`w-2 h-2 rounded-full ${
        score > 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
      }`} />
      {score} — {label}
    </span>
  );
}
