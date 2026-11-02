import React from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionText,
  actionHref,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 sm:p-12 text-center ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-4 shadow-2xs">
        {icon || <SearchX className="h-7 w-7 text-slate-400" />}
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="max-w-md text-sm text-slate-600 mb-6 leading-relaxed">
        {description}
      </p>

      {actionText && (
        actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center justify-center rounded-xl lpu-btn-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#16A89F] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20B5AD]"
          >
            {actionText}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center justify-center rounded-xl lpu-btn-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#16A89F] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20B5AD]"
          >
            {actionText}
          </button>
        )
      )}
    </div>
  );
};
