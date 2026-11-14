'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  FileText, 
  HelpCircle, 
  ArrowRight,
  CheckCircle2,
  Package,
  ShieldAlert,
  PlusCircle,
  FilePlus2,
  MapPin
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { apiClient } from '@/lib/api-client';
import { PublicItem } from '@/types';

export default function StudentDashboardOverview() {
  const [loading, setLoading] = useState(true);
  const [myReports, setMyReports] = useState<PublicItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [myClaims, setMyClaims] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    activeLostReports: null as number | null,
    foundItemsReported: null as number | null,
    pendingClaims: null as number | null,
    itemsInCustody: null as number | null,
    itemsSuccessfullyReturned: null as number | null,
  });
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [dashboardLoadError, setDashboardLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        const [reportsRes, claimsRes, recoveriesRes] = await Promise.allSettled([
          apiClient.getMyReports(),
          apiClient.getMyClaims(),
          apiClient.getMyRecoveryHistory(),
        ]);

        if (!isMounted) return;

        const reportsLoadedSuccessfully = reportsRes.status === 'fulfilled' && Array.isArray(reportsRes.value);
        const claimsLoadedSuccessfully = claimsRes.status === 'fulfilled' && Array.isArray(claimsRes.value);
        const recoveriesLoadedSuccessfully = recoveriesRes.status === 'fulfilled' && Array.isArray(recoveriesRes.value);
        const reportsData: PublicItem[] = reportsLoadedSuccessfully ? reportsRes.value : [];
        setReportsLoaded(reportsLoadedSuccessfully);
        setMyReports(reportsData);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const claimsData: any[] = claimsLoadedSuccessfully ? claimsRes.value : [];
        setMyClaims(claimsData);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recoveryData: any[] = recoveriesLoadedSuccessfully ? recoveriesRes.value : [];

        const failedResources = [
          !reportsLoadedSuccessfully && 'reports',
          !claimsLoadedSuccessfully && 'claims',
          !recoveriesLoadedSuccessfully && 'recovery history',
        ].filter(Boolean);
        setDashboardLoadError(
          failedResources.length
            ? `Could not load ${failedResources.join(', ')}. Values for unavailable data are shown as a dash.`
            : ''
        );

        // Calculate accurate real metrics
        const lostCount = reportsData.filter((i) => i.itemType === 'LOST').length;
        const foundCount = reportsData.filter((i) => i.itemType === 'FOUND').length;
        const pendingClaimsCount = claimsData.filter((c) => c.claimStatus === 'UNDER_REVIEW' || c.claimStatus === 'SUBMITTED').length;
        const inCustodyCount = reportsData.filter((i) => i.status === 'IN_CUSTODY' || i.status === 'READY_FOR_HANDOVER').length;
        const returnedCount = recoveryData.length;

        setMetrics({
          activeLostReports: reportsLoadedSuccessfully ? lostCount : null,
          foundItemsReported: reportsLoadedSuccessfully ? foundCount : null,
          pendingClaims: claimsLoadedSuccessfully ? pendingClaimsCount : null,
          itemsInCustody: reportsLoadedSuccessfully ? inCustodyCount : null,
          itemsSuccessfullyReturned: recoveriesLoadedSuccessfully ? returnedCount : null,
        });
      } catch {
        setMyReports([]);
        setMyClaims([]);
        setReportsLoaded(false);
        setDashboardLoadError('Dashboard data could not be loaded. Refresh the page and try again.');
        setMetrics({
          activeLostReports: null,
          foundItemsReported: null,
          pendingClaims: null,
          itemsInCustody: null,
          itemsSuccessfullyReturned: null,
        });
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <DashboardLayout
      title="Property Recovery Dashboard"
      subtitle="Campus lost &amp; found property ledger, claim status, and single-use collection passes."
      role="STUDENT_STAFF"
      actionButton={
        <div className="flex items-center gap-2">
          <Link
            href="/report?type=LOST"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#356DE8] bg-white px-3 py-1.5 text-xs font-bold text-[#356DE8] hover:bg-[#EBF1FD] transition-colors"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Report Lost</span>
          </Link>
          <Link
            href="/report?type=FOUND"
            className="inline-flex items-center gap-1.5 rounded-xl lpu-btn-primary px-3 py-1.5 text-xs font-bold shadow-xs hover:bg-[#E66F00] transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Report Found</span>
          </Link>
        </div>
      }
    >
      {/* 5-Metric Lost & Found Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Metric 1: Active Lost Reports */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Lost Reports
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#EBF1FD] text-[#356DE8] flex items-center justify-center">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">
            {loading ? '...' : metrics.activeLostReports ?? '—'}
          </p>
          <span className="text-[10px] text-slate-500 font-medium">Logged by you</span>
        </div>

        {/* Metric 2: Found Items Reported */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Found Items
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#FFF1E6] text-[#F58220] flex items-center justify-center">
              <Package className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">
            {loading ? '...' : metrics.foundItemsReported ?? '—'}
          </p>
          <span className="text-[10px] text-slate-500 font-medium">Surrendered</span>
        </div>

        {/* Metric 3: Pending Claims */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Pending Claims
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">
            {loading ? '...' : metrics.pendingClaims ?? '—'}
          </p>
          <span className="text-[10px] text-amber-700 font-medium">In verification</span>
        </div>

        {/* Metric 4: Items in Custody */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Security Custody
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#EBF1FD] text-[#356DE8] flex items-center justify-center">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">
            {loading ? '...' : metrics.itemsInCustody ?? '—'}
          </p>
          <span className="text-[10px] text-[#356DE8] font-medium">Station lockers</span>
        </div>

        {/* Metric 5: Successfully Returned */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Recovered
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">
            {loading ? '...' : metrics.itemsSuccessfullyReturned ?? '—'}
          </p>
          <span className="text-[10px] text-emerald-700 font-medium">Verified release</span>
        </div>
      </div>

      {!loading && dashboardLoadError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          {dashboardLoadError}
        </div>
      )}

      {/* Action Banner: Approved Claim Ready for Collection OTP */}
      {myClaims.some((c) => c.claimStatus === 'APPROVED' && c.handoverOtp) && (
        <div className="rounded-2xl border border-[#F58220]/30 bg-gradient-to-r from-[#FFF1E6] to-[#F0FBFA] p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#F58220] text-white flex items-center justify-center shrink-0 shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#E66F00] bg-white/80 px-2 py-0.5 rounded-md border border-[#F58220]/30">
                  Action Required • Collection Ready
                </span>
                <h3 className="text-sm font-bold text-[#283442] mt-1">
                  Claim Approved &amp; Awaiting Handover
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Present your single-use OTP and physical Student ID Card at the assigned Security Desk to collect your property.
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/my-claims"
              className="inline-flex items-center gap-1.5 rounded-xl lpu-btn-primary px-4 py-2 text-xs font-bold shadow-xs hover:bg-[#E66F00] transition-colors shrink-0"
            >
              <span>View Handover Pass</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Main Section: My Reports */}
      <div className="w-full">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#283442]">My Recent Property Reports</h3>
              <p className="text-xs text-slate-500">Items you logged across university premises.</p>
            </div>
            <Link
              href="/dashboard/my-reports"
              className="text-xs font-bold text-[#F58220] hover:underline"
            >
              {reportsLoaded ? `View All (${myReports.length})` : 'View All'}
            </Link>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading your reports...</div>
            ) : !reportsLoaded ? (
              <div role="alert" className="py-12 text-center text-xs text-amber-800">
                Your reports could not be loaded. Use View All to open the reports page and try again.
              </div>
            ) : myReports.length > 0 ? (
              myReports.slice(0, 5).map((item) => (
                <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#356DE8] bg-[#EBF1FD] px-2 py-0.5 rounded">
                        {item.referenceNumber}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#283442] mt-1.5 truncate">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{item.specificLocation}</span>
                    </p>
                  </div>

                  <Link
                    href={`/items/${item.id}`}
                    className="self-start sm:self-auto rounded-xl border border-slate-200 bg-[#F5F5F5] px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#356DE8] hover:text-[#356DE8] hover:bg-white transition-colors shrink-0"
                  >
                    Inspect Details
                  </Link>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                <p>You have not reported any lost or found items yet.</p>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <Link
                    href="/report?type=LOST"
                    className="font-bold text-[#356DE8] hover:underline"
                  >
                    Report Lost Item &rarr;
                  </Link>
                  <Link
                    href="/report?type=FOUND"
                    className="font-bold text-[#F58220] hover:underline"
                  >
                    Report Found Item &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
