'use client';

import React from 'react';
import Link from 'next/link';
import { 
  MapPin, 
  Calendar, 
  ShieldCheck, 
  ArrowRight,
  PackageCheck,
  AlertCircle
} from 'lucide-react';
import { PublicItem, ItemCategory, LPUCampusZone } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CATEGORY_LABELS, CAMPUS_ZONE_LABELS } from '@/lib/constants';
import { formatDisplayDate } from '@/lib/formatters';

interface ItemCardProps {
  item: PublicItem;
  onClaim?: (item: PublicItem) => void;
  showActions?: boolean;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onClaim,
  showActions = true,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categoryKey = (typeof item.category === 'object' && item.category !== null ? (item.category as any).code : item.category) as ItemCategory;
  const categoryInfo = (categoryKey && CATEGORY_LABELS[categoryKey]) || { label: String(categoryKey || 'General Item'), icon: 'Package' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoneKey = (typeof item.campusZone === 'object' && item.campusZone !== null ? (item.campusZone as any).code : item.campusZone) as LPUCampusZone;
  const zoneInfo = (zoneKey && CAMPUS_ZONE_LABELS[zoneKey]) || { label: String(zoneKey || 'LPU Campus'), area: 'LPU Campus' };

  const formattedDate = formatDisplayDate(item.eventDate);
  const isFound = item.itemType === 'FOUND';

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all duration-200 hover:border-[#20B5AD]/40 hover:shadow-md">
      {/* Top Banner Tags */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                isFound
                  ? 'bg-[#E6F8F7] text-[#16A89F] border border-[#20B5AD]/30'
                  : 'bg-[#EBF1FD] text-[#356DE8] border border-[#356DE8]/30'
              }`}
            >
              {isFound ? (
                <>
                  <PackageCheck className="h-3 w-3" />
                  FOUND
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" />
                  LOST
                </>
              )}
            </span>

            <span className="font-mono text-[11px] text-slate-500 font-medium">
              {item.referenceNumber}
            </span>
          </div>

          <StatusBadge status={item.status} />
        </div>

        {/* Title */}
        <h3 className="text-sm sm:text-base font-bold text-[#17243B] group-hover:text-[#20B5AD] transition-colors line-clamp-1">
          {item.title}
        </h3>

        {/* Category Pill */}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#20B5AD]" />
          <span>{categoryInfo.label}</span>
        </div>

        {/* Description (Redacted/Sanitized) */}
        <p className="mt-2.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
          {item.publicDescription}
        </p>
      </div>

      {/* Metadata & Footer */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2.5">
        <div className="flex flex-col gap-1 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 text-slate-700">
            <MapPin className="h-3.5 w-3.5 text-[#356DE8] shrink-0" />
            <span className="font-semibold truncate">{zoneInfo.label}</span>
            <span className="text-slate-400 text-[11px] truncate">({item.specificLocation})</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              {formattedDate}
            </span>

            {item.currentCustodyDesk && (
              <span className="flex items-center gap-1 text-[#20B5AD] font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" />
                {item.currentCustodyDesk.split(' ')[0]} Desk
              </span>
            )}
          </div>
        </div>

        {/* Card Actions */}
        {showActions && (
          <div className="flex items-center gap-2 pt-1">
            <Link
              href={`/items/${item.id}`}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-[#F5F8FC] py-2 text-xs font-semibold text-slate-700 hover:bg-white hover:border-[#356DE8]/50 hover:text-[#356DE8] transition-colors"
            >
              <span>View Details</span>
              <ArrowRight className="h-3 w-3" />
            </Link>

            {isFound && item.status !== 'HANDED_OVER' && (
              <button
                type="button"
                onClick={() => onClaim?.(item)}
                className="inline-flex items-center justify-center rounded-xl lpu-btn-primary px-3.5 py-2 text-xs font-bold text-white hover:bg-[#16A89F] transition-colors shadow-2xs"
              >
                Claim
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
