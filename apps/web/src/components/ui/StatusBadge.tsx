import React from 'react';
import { ItemStatus } from '@/types';
import { STATUS_CONFIG } from '@/lib/constants';

interface StatusBadgeProps {
  status: ItemStatus;
  className?: string;
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
  showDot = true,
}) => {
  const config = STATUS_CONFIG[status] || {
    label: status,
    color: 'text-slate-700',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight ${config.bg} ${config.color} ${config.border} ${className}`}
    >
      {showDot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status === 'READY_FOR_HANDOVER'
              ? 'bg-emerald-500 animate-pulse'
              : status === 'CLAIM_IN_REVIEW'
              ? 'bg-amber-500'
              : status === 'IN_CUSTODY'
              ? 'bg-blue-500'
              : status === 'MATCH_PENDING'
              ? 'bg-purple-500'
              : 'bg-current opacity-70'
          }`}
        />
      )}
      {config.label}
    </span>
  );
};
