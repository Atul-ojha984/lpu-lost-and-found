'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface LPULogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const LPULogo: React.FC<LPULogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const [imageError, setImageError] = useState(false);

  const dimensions = {
    sm: { width: 140, height: 38, iconSize: 'h-7', text: 'text-xs' },
    md: { width: 180, height: 48, iconSize: 'h-9', text: 'text-sm' },
    lg: { width: 240, height: 64, iconSize: 'h-12', text: 'text-base' },
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {!imageError ? (
        <div className="relative flex items-center">
          <Image
            src="/images/lpu-logo.png"
            alt="Lovely Professional University Logo"
            width={dimensions.width}
            height={dimensions.height}
            className="h-auto max-h-12 w-auto object-contain"
            priority
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        /* Explicitly labeled placeholder per project guidelines */
        <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1.5 text-red-900 shadow-xs">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-700 text-xs font-bold tracking-wider text-white">
            LPU
          </div>
          <div className="flex flex-col text-left">
            <span className="font-semibold text-xs tracking-tight text-red-950">
              Campus Recovery
            </span>
            <span className="font-mono text-[9px] text-red-700/90 leading-tight">
              [Logo: /images/lpu-logo.png]
            </span>
          </div>
        </div>
      )}

      {showSubtitle && (
        <div className="hidden border-l border-slate-200 pl-3 sm:flex sm:flex-col text-left">
          <span className="text-xs font-semibold tracking-tight text-slate-900">
            Lost &amp; Found
          </span>
          <span className="text-[10px] text-slate-500 font-medium leading-none">
            Property Recovery Portal
          </span>
        </div>
      )}
    </div>
  );
};
