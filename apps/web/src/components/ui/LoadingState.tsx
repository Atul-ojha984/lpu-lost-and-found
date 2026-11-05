import React from 'react';

interface LoadingStateProps {
  type?: 'card' | 'grid' | 'table' | 'text';
  count?: number;
  className?: string;
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  type = 'card',
  count = 3,
  className = '',
  message,
}) => {
  if (type === 'table') {
    return (
      <div className={`w-full divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-200" />
              <div className="space-y-2">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-3 w-24 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-6 w-20 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'grid') {
    return (
      <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs animate-pulse space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-20 rounded-full bg-slate-200" />
              <div className="h-5 w-24 rounded-full bg-slate-100" />
            </div>
            <div className="space-y-2">
              <div className="h-5 w-3/4 rounded bg-slate-200" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-2/3 rounded bg-slate-100" />
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-slate-100" />
              <div className="h-4 w-16 rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-8 shadow-xs animate-pulse ${className}`}>
      <div className="h-8 w-8 rounded-full border-2 border-[#F58220] border-t-transparent animate-spin" />
      <p className="text-xs font-medium text-slate-600">{message || 'Loading data...'}</p>
    </div>
  );
};
