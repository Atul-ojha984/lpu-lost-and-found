'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ShieldAlert, 
  Package, 
  ClipboardCheck, 
  KeyRound, 
  ArrowRight,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';
import { DEMO_ITEMS, DEMO_CLAIMS, DEMO_CUSTODY_RECORDS } from '@/lib/mock-data';
import { formatDisplayDateTime } from '@/lib/formatters';

export default function SecurityDeskOverview() {
  const [stats, setStats] = useState({
    inCustodyCount: DEMO_ITEMS.filter((i) => i.status === 'IN_CUSTODY' || i.status === 'READY_FOR_HANDOVER').length,
    pendingClaimsCount: DEMO_CLAIMS.filter((c) => c.claimStatus === 'UNDER_REVIEW' || c.claimStatus === 'SUBMITTED').length,
    readyHandoverCount: DEMO_CLAIMS.filter((c) => c.claimStatus === 'APPROVED').length || 1,
    completedHandoversCount: 2,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);

  const fetchLiveStats = () => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  };

  useEffect(() => {
    let isMounted = true;

    async function loadLiveStats() {
      try {
        const data = await apiClient.getSecurityStats();
        if (isMounted && data) {
          setStats({
            inCustodyCount: data.custodyInventoryCount,
            pendingClaimsCount: data.pendingClaimsCount,
            readyHandoverCount: data.approvedAwaitingHandoverCount,
            completedHandoversCount: data.completedHandoversCount,
          });
          if (data.recentAuditEvents && data.recentAuditEvents.length > 0) {
            setRecentEvents(data.recentAuditEvents);
          }
        }
      } catch {
        // Graceful fallback to demo records if offline
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadLiveStats();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  return (
    <DashboardLayout
      title="Campus Security Reception & Custody Post"
      subtitle="Gate 1 Main Control Desk • Physical property intake, claim adjudication, and supervised handover."
      role="SECURITY_PERSONNEL"
    >
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Physical Items in Custody
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{stats.inCustodyCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Stored in station locker storage</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pending Claims in Review
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <ClipboardCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{stats.pendingClaimsCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
            <span>Requires evidence verification</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ready for Handover (OTP)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{stats.readyHandoverCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <span>Awaiting claimant OTP check-in</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Completed Handovers
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{stats.completedHandoversCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Safely released to owners</span>
          </div>
        </div>
      </div>

      {/* Security Action Panels */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Quick Intake Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-red-700">
            <ShieldAlert className="h-5 w-5" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Property Intake
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Log found property surrendered at security posts with EXIF-sanitized photos and locker references.
          </p>

          <div className="pt-2">
            <Link
              href="/report?type=FOUND"
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-800 transition-colors"
            >
              <span>Log Found Intake</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Claims Review Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-amber-700">
            <ClipboardCheck className="h-5 w-5" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Claims Adjudication
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Adjudicate student ownership statements, inspect the encrypted private vault, and resolve competing claims.
          </p>

          <div className="pt-2">
            <Link
              href="/security/claims"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-800 transition-colors"
            >
              <span>Review Claims Queue</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Handover OTP Terminal Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-700">
            <KeyRound className="h-5 w-5" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Handover Terminal
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Authenticate the claimant&apos;s 6-digit OTP, inspect physical university ID, and record signed acknowledgement.
          </p>

          <div className="pt-2">
            <Link
              href="/security/custody?tab=handover"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors"
            >
              <span>Open Handover Terminal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Custody Log Activity & Audit Trail */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Campus Custody &amp; Security Audit Trail</h3>
            <p className="text-xs text-slate-500">Append-only audit ledger of custody transfers, adjudications, and supervised handovers.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchLiveStats}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              href="/security/custody"
              className="text-xs font-semibold text-red-700 hover:text-red-800"
            >
              Full Custody Inventory →
            </Link>
          </div>
        </div>

        <div className="divide-y divide-slate-100 mt-2">
          {recentEvents.length > 0
            ? recentEvents.slice(0, 5).map((ev) => (
                <div key={ev._id || ev.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500 font-semibold">{ev.targetEntity}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {(ev.action || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      Target Ref: {ev.metadata?.referenceNumber || ev.targetId || 'Campus Item'}
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      {ev.metadata?.fromLocation ? `From: ${ev.metadata.fromLocation} → To: ${ev.metadata.toLocation}` : ''}
                      {ev.metadata?.remarks ? ` • ${ev.metadata.remarks}` : ''}
                    </p>
                  </div>

                  <div className="text-right sm:text-right text-[11px] text-slate-500 shrink-0">
                    <span className="font-medium text-slate-700">
                      {ev.actor?.fullName || ev.actorRole || 'Campus Security'}
                    </span>
                    <p className="text-slate-400">{formatDisplayDateTime(ev.timestamp)}</p>
                  </div>
                </div>
              ))
            : DEMO_CUSTODY_RECORDS.slice(0, 3).map((rec) => (
                <div key={rec.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500 font-semibold">{rec.itemReference}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {rec.action.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 mt-0.5">{rec.itemTitle}</p>
                    <p className="text-slate-500 text-[11px]">{rec.remarks}</p>
                  </div>

                  <div className="text-right sm:text-right text-[11px] text-slate-500 shrink-0">
                    <span className="font-medium text-slate-700">{rec.officerName}</span>
                    <p className="text-slate-400">{formatDisplayDateTime(rec.timestamp)}</p>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

