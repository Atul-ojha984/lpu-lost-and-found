'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface LPULogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  wordmarkVariant?: 'standard' | 'stacked-system' | 'portal-recovery' | 'none';
  subtitleText?: string;
  titleText?: string;
  inverted?: boolean;
}

export const LPULogo: React.FC<LPULogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
  wordmarkVariant = 'standard',
  subtitleText,
  titleText,
  inverted = false,
}) => {
  const [imageError, setImageError] = useState(false);

  // Square mark dimensions keep the icon crisp beside every wordmark variant.
  const dimensions = {
    sm: { width: 32, height: 32, sizeClass: 'h-8 w-8' },
    md: { width: 40, height: 40, sizeClass: 'h-10 w-10' },
    lg: { width: 52, height: 52, sizeClass: 'h-12 w-12 sm:h-14 sm:w-14' },
    xl: { width: 64, height: 64, sizeClass: 'h-16 w-16 sm:h-20 sm:w-20' },
  }[size];

  return (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 ${className}`}>
      {!imageError ? (
        <div className="relative flex items-center shrink-0">
          <Image
            src="/images/lost-and-found-logo.svg"
            alt="Lost & Found Property Recovery Portal"
            width={dimensions.width}
            height={dimensions.height}
            className={`${dimensions.sizeClass} object-contain`}
            priority
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        /* Minimal graceful fallback retaining the charcoal and orange palette */
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#283442] text-xs font-black text-[#F58220] border border-[#F58220]/30 shadow-xs">
          LF
        </div>
      )}

      {/* Wordmark Variations strictly aligned with new visual identity */}
      {showSubtitle && wordmarkVariant !== 'none' && (
        <div className="flex items-center gap-2.5">
          <div className={`h-8 w-[1.5px] ${inverted ? 'bg-white/20' : 'bg-slate-200'}`} />
          {wordmarkVariant === 'stacked-system' ? (
            <div className="flex flex-col text-left justify-center">
              <span
                className={`text-xs font-black tracking-wider uppercase leading-tight font-sans ${
                  inverted ? 'text-white' : 'text-[#283442]'
                }`}
              >
                LOST &amp; FOUND
              </span>
              <span className="text-[10px] font-extrabold tracking-widest text-[#F58220] uppercase leading-tight">
                MANAGEMENT SYSTEM
              </span>
            </div>
          ) : wordmarkVariant === 'portal-recovery' ? (
            <div className="flex flex-col text-left justify-center">
              <span
                className={`text-xs sm:text-sm font-extrabold tracking-tight ${
                  inverted ? 'text-white' : 'text-[#283442]'
                }`}
              >
                {titleText || 'LOST & FOUND'}
              </span>
              <span className="text-[10px] sm:text-xs text-[#F58220] font-bold leading-tight">
                {subtitleText || 'Campus Property Recovery Portal'}
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex sm:flex-col text-left justify-center">
              <span
                className={`text-xs font-bold tracking-tight ${
                  inverted ? 'text-white' : 'text-[#283442]'
                }`}
              >
                {titleText || 'LOST & FOUND'}
              </span>
              <span className="text-[10px] text-[#F58220] font-semibold leading-tight">
                {subtitleText || 'Property Recovery'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Alias export for explicit naming
export const LostAndFoundLogo = LPULogo;
