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

  // Logo aspect ratio is approximately 1.83 (1024x558)
  const dimensions = {
    sm: { width: 64, height: 35, maxHeight: 'h-8 max-h-8' },
    md: { width: 84, height: 46, maxHeight: 'h-10 max-h-10' },
    lg: { width: 110, height: 60, maxHeight: 'h-12 max-h-12 sm:h-14 sm:max-h-14' },
    xl: { width: 146, height: 80, maxHeight: 'h-16 max-h-16 sm:h-20 sm:max-h-20' },
  }[size];

  return (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 ${className}`}>
      {!imageError ? (
        <div className="relative flex items-center shrink-0">
          <Image
            src="/images/lost-and-found-logo.png"
            alt="Lost & Found Property Recovery Portal"
            width={dimensions.width}
            height={dimensions.height}
            className={`w-auto ${dimensions.maxHeight} object-contain`}
            priority
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        /* Minimal graceful fallback retaining navy/teal visual language */
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#192B4A] text-xs font-black text-[#20B5AD] border border-[#20B5AD]/30 shadow-xs">
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
                  inverted ? 'text-white' : 'text-[#192B4A]'
                }`}
              >
                LOST &amp; FOUND
              </span>
              <span className="text-[10px] font-extrabold tracking-widest text-[#20B5AD] uppercase leading-tight">
                MANAGEMENT SYSTEM
              </span>
            </div>
          ) : wordmarkVariant === 'portal-recovery' ? (
            <div className="flex flex-col text-left justify-center">
              <span
                className={`text-xs sm:text-sm font-extrabold tracking-tight ${
                  inverted ? 'text-white' : 'text-[#192B4A]'
                }`}
              >
                {titleText || 'LOST & FOUND'}
              </span>
              <span className="text-[10px] sm:text-xs text-[#20B5AD] font-bold leading-tight">
                {subtitleText || 'Campus Property Recovery Portal'}
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex sm:flex-col text-left justify-center">
              <span
                className={`text-xs font-bold tracking-tight ${
                  inverted ? 'text-white' : 'text-[#192B4A]'
                }`}
              >
                {titleText || 'LOST & FOUND'}
              </span>
              <span className="text-[10px] text-[#20B5AD] font-semibold leading-tight">
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
