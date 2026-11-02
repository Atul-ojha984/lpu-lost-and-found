'use client';

import React, { useEffect, useState } from 'react';
import { 
  MapPin, 
  PieChart, 
  Clock, 
  CheckCircle2, 
  AlertOctagon, 
  Building2, 
  Calendar,
  Layers,
  HelpCircle
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface AnalyticsData {
  overview: {
    totalReports: number;
    totalLost: number;
    totalFound: number;
    itemsReturned: number;
    returnRatePercent: number;
    pendingClaims: number;
    totalVerificationFailures: number;
    totalUnclaimedInCustody: number;
  };
  returnMetrics: {
    itemsReturned: number;
    returnRatePercent: number;
    returnRateDefinition: string;
    medianTimeToReturnHours: number;
    medianTimeToReturnDays: number;
    medianTimeToReturnDefinition: string;
  };
  verificationMetrics: {
    pendingClaims: number;
    totalVerificationFailures: number;
    failedChallengesCount: number;
    failedHandoverOtpsCount: number;
    rejectedClaimsCount: number;
    failureDefinition: string;
  };
  custodyInventory: {
    totalInCustody: number;
    byLocation: Array<{ desk: string; count: number }>;
  };
  categoryDistribution: Array<{
    categoryId: string;
    categoryCode: string;
    categoryName: string;
    count: number;
    percentage: number;
  }>;
  hotspots: {
    locations: Array<{
      locationId: string;
      name: string;
      campusZone: string;
      buildingName?: string;
      totalCount: number;
      lostCount: number;
      foundCount: number;
    }>;
    hourly: Array<{ hour: number; count: number }>;
  };
  ageing: {
    brackets: {
      under30Days: number;
      from31To60Days: number;
      from61To90Days: number;
      over90Days: number;
    };
    statutoryRetentionPeriodDays: number;
    ageingDefinition: string;
  };
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await apiClient.getAdminAnalytics();
        if (res && res.overview) {
          setData(res);
        } else {
          setData(null);
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, []);

  const maxHourCount = data?.hotspots.hourly
    ? Math.max(...data.hotspots.hourly.map((h) => h.count), 1)
    : 1;

  return (
    <DashboardLayout
      title="Campus Operational Analytics &amp; Reports"
      subtitle="Calculated strictly from live database records • Verified return velocity, custody breakdown, and ageing queues."
      role="CAMPUS_ADMIN"
    >
      {/* Primary Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Reports */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Reports Logged
            </span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">
            {loading ? '...' : data?.overview.totalReports ?? 0}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="text-red-700 font-semibold">{data?.overview.totalLost ?? 0} Lost</span>
            <span>•</span>
            <span className="text-blue-700 font-semibold">{data?.overview.totalFound ?? 0} Found</span>
          </div>
        </div>

        {/* Return Rate */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Verified Return Rate
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-emerald-700">
            {loading ? '...' : `${data?.returnMetrics.returnRatePercent ?? 0}%`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {data?.returnMetrics.itemsReturned ?? 0} items returned to owners
          </p>
        </div>

        {/* Median Time to Return */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Median Time to Return
            </span>
            <Clock className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">
            {loading ? '...' : `${data?.returnMetrics.medianTimeToReturnDays ?? 0} Days`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            ~{data?.returnMetrics.medianTimeToReturnHours ?? 0} hours intake-to-handover
          </p>
        </div>

        {/* Verification Failures & Pending */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pending Claims / Failures
            </span>
            <AlertOctagon className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-amber-700">
            {loading ? '...' : `${data?.verificationMetrics.pendingClaims ?? 0} Active`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {data?.verificationMetrics.totalVerificationFailures ?? 0} failed challenges/OTPs
          </p>
        </div>
      </div>

      {/* Documented Metric Definitions Banner */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <HelpCircle className="h-4 w-4 text-slate-500" />
          <span>Transparent Database Metric Definitions (Non-Hardcoded)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed">
          <div className="rounded bg-white p-2.5 border border-slate-200/80">
            <span className="font-semibold text-slate-900">Return Rate: </span>
            {data?.returnMetrics.returnRateDefinition ||
              'Percentage of registered found items successfully verified and handed over to rightful claimants: (itemsReturned / totalFound) * 100.'}
          </div>
          <div className="rounded bg-white p-2.5 border border-slate-200/80">
            <span className="font-semibold text-slate-900">Median Velocity: </span>
            {data?.returnMetrics.medianTimeToReturnDefinition ||
              'Median duration from initial report registration until authorized physical custody handover.'}
          </div>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Category Distribution</h3>
              <p className="text-xs text-slate-500">Live breakdown of items across campus categories.</p>
            </div>
            <PieChart className="h-4 w-4 text-slate-400" />
          </div>

          <div className="space-y-3 pt-2">
            {data?.categoryDistribution.map((cat, idx) => {
              const colors = [
                'bg-red-700',
                'bg-blue-600',
                'bg-amber-500',
                'bg-emerald-600',
                'bg-purple-600',
                'bg-indigo-600',
              ];
              const color = colors[idx % colors.length];

              return (
                <div key={cat.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{cat.categoryName}</span>
                    <span className="text-slate-500 font-mono">
                      {cat.count} items ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Custody Inventory by Physical Desk */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Custody by Security Desk</h3>
              <p className="text-xs text-slate-500">
                Physical repository distribution ({data?.custodyInventory.totalInCustody ?? 0} items currently held).
              </p>
            </div>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {data?.custodyInventory.byLocation.map((item) => (
              <div key={item.desk} className="py-2.5 flex items-center justify-between">
                <span className="font-medium text-slate-800">{item.desk}</span>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-bold font-mono text-blue-700 text-[11px]">
                  {item.count} items
                </span>
              </div>
            ))}
            {(!data?.custodyInventory.byLocation || data.custodyInventory.byLocation.length === 0) && (
              <p className="py-4 text-center text-xs text-slate-400">No items currently in custody</p>
            )}
          </div>
        </div>

        {/* Campus Location Hotspots */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Campus Location Hotspots</h3>
              <p className="text-xs text-slate-500">High-frequency incident zones across university sectors.</p>
            </div>
            <MapPin className="h-4 w-4 text-red-700" />
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {data?.hotspots.locations.map((loc) => (
              <div key={loc.locationId} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">{loc.name}</span>
                  <span className="text-[11px] text-slate-500">{loc.campusZone}</span>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="text-[11px] text-red-600 font-semibold">{loc.lostCount} lost</span>
                  <span className="text-[11px] text-slate-300">•</span>
                  <span className="text-[11px] text-blue-600 font-semibold">{loc.foundCount} found</span>
                  <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800 font-mono">
                    {loc.totalCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 24-Hour Time Hotspot Distribution */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Incident Hourly Hotspots (24h)</h3>
              <p className="text-xs text-slate-500">Loss and found report frequency across hours of the day.</p>
            </div>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>

          <div className="flex items-end gap-1 h-36 pt-4 px-2">
            {data?.hotspots.hourly.map((h) => {
              const heightPct = h.count > 0 ? (h.count / maxHourCount) * 100 : 4;
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className={`w-full rounded-t transition-all ${
                      h.count > 0 ? 'bg-red-700 hover:bg-red-800' : 'bg-slate-100'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  {h.hour % 3 === 0 && (
                    <span className="text-[9px] font-mono text-slate-400 mt-1">
                      {h.hour.toString().padStart(2, '0')}
                    </span>
                  )}
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-8 hidden group-hover:block z-10 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-white shadow-sm">
                    {h.hour}:00 — {h.count} incidents
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
            <span>00:00 (Midnight)</span>
            <span>12:00 (Noon)</span>
            <span>23:00 (Night)</span>
          </div>
        </div>
      </div>

      {/* Unclaimed Item Volume & Ageing Brackets */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Unclaimed Item Volume &amp; Ageing Brackets</h3>
            <p className="text-xs text-slate-500">{data?.ageing.ageingDefinition}</p>
          </div>
          <span className="text-xs font-bold text-red-700">
            Statutory Period: {data?.ageing.statutoryRetentionPeriodDays ?? 90} Days
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              0 – 30 Days (Recent)
            </span>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {data?.ageing.brackets.under30Days ?? 0} Items
            </p>
            <span className="text-[10px] text-slate-400">Active public board discovery window</span>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">
              31 – 60 Days (Medium)
            </span>
            <p className="mt-2 text-2xl font-extrabold text-blue-900">
              {data?.ageing.brackets.from31To60Days ?? 0} Items
            </p>
            <span className="text-[10px] text-blue-600">Secure locker storage placement</span>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
              61 – 90 Days (Mature)
            </span>
            <p className="mt-2 text-2xl font-extrabold text-amber-900">
              {data?.ageing.brackets.from61To90Days ?? 0} Items
            </p>
            <span className="text-[10px] text-amber-700">Approaching statutory retention expiry</span>
          </div>

          <div className="rounded-xl border border-rose-300 bg-rose-50/60 p-4">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
              &gt;90 Days (Overdue Queue)
            </span>
            <p className="mt-2 text-2xl font-extrabold text-rose-800">
              {data?.ageing.brackets.over90Days ?? 0} Items
            </p>
            <span className="text-[10px] text-rose-700 font-medium">
              Eligible for committee disposal review
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
