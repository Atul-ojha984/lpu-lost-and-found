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
  RefreshCw,
  PlusCircle
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';
import { formatDisplayDateTime } from '@/lib/formatters';

export default function SecurityDeskOverview() {
  const [stats, setStats] = useState({
    inCustodyCount: 0,
    pendingClaimsCount: 0,
    readyHandoverCount: 0,
    completedHandoversCount: 0,
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
            inCustodyCount: data.custodyInventoryCount ?? 0,
            pendingClaimsCount: data.pendingClaimsCount ?? 0,
            readyHandoverCount: data.approvedAwaitingHandoverCount ?? 0,
            completedHandoversCount: data.completedHandoversCount ?? 0,
          });
          if (Array.isArray(data.recentAuditEvents)) {
            setRecentEvents(data.recentAuditEvents);
          }
        }
      } catch {
        // Leave at current real records
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
      actionButton={
        <Link
          href="/report?type=FOUND"
          className="inline-flex items-center gap-1.5 rounded-xl lpu-btn-primary px-3.5 py-1.5 text-xs font-bold shadow-xs hover:bg-[#E66F00] transition-colors"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Register Found Item</span>
        </Link>
      }
    >
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Items in Custody
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EBF1FD] text-[#356DE8]">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-[#283442]">{stats.inCustodyCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Stored in station lockers</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pending Claims
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF1E6] text-[#F58220]">
              <ClipboardCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-[#283442]">{stats.pendingClaimsCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#F58220] font-semibold">
            <span>Requires proof verification</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Ready for Handover
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-[#16876A]">
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-[#283442]">{stats.readyHandoverCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#16876A] font-semibold">
            <span>Awaiting claimant OTP check-in</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Completed Releases
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-[#283442]">{stats.completedHandoversCount}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Safely released to verified owners</span>
          </div>
        </div>
      </div>

      {/* Security Action Panels */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Quick Intake Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#F58220]">
            <ShieldAlert className="h-5 w-5" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#283442]">
              Register Found Property
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Log found property surrendered at security posts with EXIF-sanitized photos and locker assignment.
          </p>

          <div className="pt-2">
            <Link
              href="/report?type=FOUND"
              className="inline-flex items-center gap-2 rounded-xl lpu-btn-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#E66F00] transition-colors"
            >
              <span>Log Found Intake</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Claims Review Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#356DE8]">
            <ClipboardCheck className="h-5 w-5" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#283442]">
              Claims Adjudication
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Adjudicate student ownership statements, inspect the encrypted private vault, and resolve competing claims.
          </p>

          <div className="pt-2">
            <Link
              href="/security/claims"
              className="inline-flex items-center gap-2 rounded-xl bg-[#356DE8] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2756C2] transition-colors"
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
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#283442]">
              Approved Handovers
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Authenticate the claimant&apos;s 6-digit OTP, inspect physical university ID, and record signed acknowledgement.
          </p>

          <div className="pt-2">
            <Link
              href="/security/handovers"
              className="inline-flex items-center gap-2 rounded-xl bg-[#283442] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#3A4B5E] transition-colors"
            >
              <span>Open Handover Terminal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Custody Log Activity & Audit Trail */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-[#283442]">Campus Custody &amp; Security Audit Trail</h3>
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
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/security/custody?tab=reports"
                className="text-xs font-bold text-[#F58220] hover:underline"
              >
                Submitted Reports &rarr;
              </Link>
              <Link
                href="/security/custody"
                className="text-xs font-bold text-[#F58220] hover:underline"
              >
                Full Custody Inventory &rarr;
              </Link>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100 mt-2">
          {recentEvents.length > 0 ? (
            recentEvents.slice(0, 5).map((ev) => (
              <div key={ev._id || ev.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500 font-semibold">{ev.targetEntity}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {(ev.action || '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800">
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
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              No recent custody actions recorded. New intakes, transfers, and handovers will appear here in real-time.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
