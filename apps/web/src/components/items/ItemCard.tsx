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
import { PublicItem } from '@/types';
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
  const categoryInfo = CATEGORY_LABELS[item.category] || { label: item.category, icon: 'Package' };
  const zoneInfo = CAMPUS_ZONE_LABELS[item.campusZone] || { label: item.campusZone, area: 'LPU Campus' };

  const formattedDate = formatDisplayDate(item.eventDate);

  const isFound = item.itemType === 'FOUND';

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md">
      {/* Top Banner Tags */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ${
                isFound
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
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
        <h3 className="text-base font-semibold text-slate-900 group-hover:text-red-700 transition-colors line-clamp-1">
          {item.title}
        </h3>

        {/* Category Pill */}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
          <span>{categoryInfo.label}</span>
        </div>

        {/* Description (Redacted/Sanitized) */}
        <p className="mt-2.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
          {item.publicDescription}
        </p>
      </div>

      {/* Metadata & Footer */}
      <div className="mt-4 pt-3.5 border-t border-slate-100/90 space-y-2.5">
        <div className="flex flex-col gap-1 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 text-slate-700">
            <MapPin className="h-3.5 w-3.5 text-red-600 shrink-0" />
            <span className="font-medium truncate">{zoneInfo.label}</span>
            <span className="text-slate-400 text-[11px] truncate">({item.specificLocation})</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              {formattedDate}
            </span>

            {item.currentCustodyDesk && (
              <span className="flex items-center gap-1 text-blue-700 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />
                {item.currentCustodyDesk.split(' ')[0]} Desk
              </span>
            )}
          </div>
        </div>

        {/* Demo Tag Indicator */}
        {item.isDemoItem && (
          <div className="rounded-md bg-slate-50 border border-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-mono flex items-center justify-between">
            <span>DEMO ITEM</span>
            <span className="text-slate-500">Fictional Data</span>
          </div>
        )}

        {/* Card Actions */}
        {showActions && (
          <div className="flex items-center gap-2 pt-1">
            <Link
              href={`/items/${item.id}`}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <span>View Details</span>
              <ArrowRight className="h-3 w-3" />
            </Link>

            {isFound && item.status !== 'HANDED_OVER' && (
              <button
                type="button"
                onClick={() => onClaim?.(item)}
                className="inline-flex items-center justify-center rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 transition-colors shadow-2xs"
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
