import React from 'react';

interface HealthBadgeProps {
  score: number;
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({ score }) => {
  let color = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  let label = 'Healthy';

  if (score < 45) {
    color = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    label = 'Needs Attention';
  } else if (score < 70) {
    color = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    label = 'Moderate';
  }

  return (
    <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-semibold ${color}`}>
      <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
      <span>{score.toFixed(1)} / 100 — {label}</span>
    </div>
  );
};

