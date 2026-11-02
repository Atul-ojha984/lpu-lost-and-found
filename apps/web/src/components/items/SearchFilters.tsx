'use client';

import React from 'react';
import { Search, RotateCcw, Filter } from 'lucide-react';
import { ItemCategory, LPUCampusZone, ItemType, ItemStatus } from '@/types';
import { CATEGORY_LABELS, CAMPUS_ZONE_LABELS, STATUS_CONFIG } from '@/lib/constants';

interface SearchFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedType: ItemType | 'ALL';
  onTypeChange: (type: ItemType | 'ALL') => void;
  selectedCategory: ItemCategory | 'ALL';
  onCategoryChange: (category: ItemCategory | 'ALL') => void;
  selectedZone: LPUCampusZone | 'ALL';
  onZoneChange: (zone: LPUCampusZone | 'ALL') => void;
  selectedStatus: ItemStatus | 'ALL';
  onStatusChange: (status: ItemStatus | 'ALL') => void;
  onReset: () => void;
  totalResults: number;
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  searchQuery,
  onSearchChange,
  selectedType,
  onTypeChange,
  selectedCategory,
  onCategoryChange,
  selectedZone,
  onZoneChange,
  selectedStatus,
  onStatusChange,
  onReset,
  totalResults,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
      {/* Search Input Bar + Type Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by keywords (e.g. MacBook, Titan wallet, ID card, Room 204)..."
            className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] pl-10 pr-4 py-2.5 text-xs font-medium text-[#17243B] placeholder-slate-400 focus:bg-white focus:border-[#20B5AD] focus:ring-2 focus:ring-[#20B5AD]/20 focus:outline-none transition-all"
          />
        </div>

        {/* Item Type Selector Tabs */}
        <div className="inline-flex rounded-xl border border-slate-200 bg-[#F5F8FC] p-1 shrink-0">
          {(['ALL', 'LOST', 'FOUND'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onTypeChange(type)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide transition-all ${
                selectedType === type
                  ? 'bg-white text-[#20B5AD] shadow-xs'
                  : 'text-slate-600 hover:text-[#192B4A]'
              }`}
            >
              {type === 'ALL' ? 'All Items' : type === 'LOST' ? 'Lost Items' : 'Found Items'}
            </button>
          ))}
        </div>
      </div>

      {/* Dropdown Filters Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 border-t border-slate-100">
        {/* Category Dropdown */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value as ItemCategory | 'ALL')}
            className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] px-3 py-2 text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#20B5AD] focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([catKey, catVal]) => (
              <option key={catKey} value={catKey}>
                {catVal.label}
              </option>
            ))}
          </select>
        </div>

        {/* Campus Zone Dropdown */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Campus Zone
          </label>
          <select
            value={selectedZone}
            onChange={(e) => onZoneChange(e.target.value as LPUCampusZone | 'ALL')}
            className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] px-3 py-2 text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#20B5AD] focus:outline-none"
          >
            <option value="ALL">All Campus Zones</option>
            {Object.entries(CAMPUS_ZONE_LABELS).map(([zoneKey, zoneVal]) => (
              <option key={zoneKey} value={zoneKey}>
                {zoneVal.label} — {zoneVal.area}
              </option>
            ))}
          </select>
        </div>

        {/* Status Dropdown */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Recovery Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value as ItemStatus | 'ALL')}
            className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] px-3 py-2 text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#20B5AD] focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([stKey, stVal]) => (
              <option key={stKey} value={stKey}>
                {stVal.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Count & Reset Row */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 font-semibold">
          <Filter className="h-3.5 w-3.5 text-[#20B5AD]" />
          <span>
            Showing <strong className="text-[#192B4A]">{totalResults}</strong> campus item{totalResults === 1 ? '' : 's'}
          </span>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-[#20B5AD] font-semibold transition-colors focus:outline-none"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset Filters</span>
        </button>
      </div>
    </div>
  );
};
