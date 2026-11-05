'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  BarChart3, 
  Package, 
  Users, 
  ArrowRight, 
  TrendingUp,
  ClipboardList,
  Shield,
  MapPin,
  ClipboardCheck,
  Sliders
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface AnalyticsOverview {
  totalReports: number;
  totalLost: number;
  totalFound: number;
  itemsReturned: number;
  returnRatePercent: number;
  pendingClaims: number;
  totalVerificationFailures: number;
  totalUnclaimedInCustody: number;
}

interface AuditItem {
  _id: string;
  action: string;
  targetEntity: string;
  targetId?: string;
  actorRole: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export default function AdminOverviewPage() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, logsData] = await Promise.allSettled([
          apiClient.getAdminAnalytics(),
          apiClient.getAdminAuditLogs({ limit: 5 }),
        ]);

        if (statsData.status === 'fulfilled' && statsData.value?.overview) {
          setAnalytics(statsData.value.overview);
        } else {
          setAnalytics(null);
        }

        if (logsData.status === 'fulfilled' && Array.isArray(logsData.value)) {
          setAuditLogs(logsData.value);
        } else {
          setAuditLogs([]);
        }
      } catch {
        setAnalytics(null);
        setAuditLogs([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <DashboardLayout
      title="Lost &amp; Found Administration &amp; Governance"
      subtitle="Directorate of Student Welfare • Campus property governance, chain-of-custody oversight, and audit logs."
      role="CAMPUS_ADMIN"
    >
      {/* High-Level Operational Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Total Logged Property
          </span>
          <p className="mt-2 text-2xl font-black text-[#283442]">
            {loading ? '...' : analytics?.totalReports ?? 0}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            {analytics?.totalLost ?? 0} Lost • {analytics?.totalFound ?? 0} Found
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Successful Return Rate
          </span>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {loading ? '...' : `${analytics?.returnRatePercent ?? 0}%`}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{analytics?.itemsReturned ?? 0} items returned to owners</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Secure Custody Items
          </span>
          <p className="mt-2 text-2xl font-black text-[#356DE8]">
            {loading ? '...' : analytics?.totalUnclaimedInCustody ?? 0}
          </p>
          <span className="text-[11px] text-[#356DE8] font-medium">Under campus security custody</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Pending Claims in Review
          </span>
          <p className="mt-2 text-2xl font-black text-[#F58220]">
            {loading ? '...' : `${analytics?.pendingClaims ?? 0}`}
          </p>
          <span className="text-[11px] text-[#E66F00] font-medium">
            {analytics?.totalVerificationFailures ?? 0} verification attempts flagged
          </span>
        </div>
      </div>

      {/* Governance Hub Navigation Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Lost & Found Reports */}
        <Link
          href="/admin/items"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-[#F58220] hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1E6] text-[#F58220] mb-3 group-hover:bg-[#F58220] group-hover:text-white transition-colors">
              <Package className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-[#F58220] transition-colors">
              Lost &amp; Found Reports
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Campus inventory, 90-day retention queue, notice periods, and statutory ageing.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#F58220]">
            <span>Manage Inventory</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {/* Card 2: User Management */}
        <Link
          href="/admin/users"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-[#356DE8] hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EBF1FD] text-[#356DE8] mb-3 group-hover:bg-[#356DE8] group-hover:text-white transition-colors">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-[#356DE8] transition-colors">
              User Management
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Manage accounts, registration numbers, role permissions, and access status.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#356DE8]">
            <span>Manage Users</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {/* Card 3: Claim Management */}
        <Link
          href="/admin/claims"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-amber-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 mb-3 group-hover:bg-amber-700 group-hover:text-white transition-colors">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-amber-800 transition-colors">
              Claim Management
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Supervise ownership claims, resolution disputes, and single-use OTP handovers.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-amber-700">
            <span>Manage Claims</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {/* Card 4: Security Officer Management */}
        <Link
          href="/admin/officers"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 mb-3 group-hover:bg-blue-700 group-hover:text-white transition-colors">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-blue-800 transition-colors">
              Security Officer Management
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Assign security posts (Gate 1, Uni-Mall, Block 38) and custody authorizations.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
            <span>Manage Officers</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {/* Card 5: Custody Locations */}
        <Link
          href="/admin/locations"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-400 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 mb-3 group-hover:bg-slate-800 group-hover:text-white transition-colors">
              <MapPin className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-slate-800 transition-colors">
              Custody Locations
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Campus zones, intake drop points, security booths, and storage locker clusters.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-slate-700">
            <span>View Locations</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {/* Card 6: Audit Logs */}
        <Link
          href="/admin/audit"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 mb-3 group-hover:bg-emerald-700 group-hover:text-white transition-colors">
              <ClipboardList className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-emerald-800 transition-colors">
              Audit Logs
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Forensic audit trail, cryptographic vault view attempts, and custody transitions.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
            <span>Inspect Logs</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {/* Card 7: Reports & Analytics */}
        <Link
          href="/admin/analytics"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-purple-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 mb-3 group-hover:bg-purple-700 group-hover:text-white transition-colors">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-purple-800 transition-colors">
              Reports and Analytics
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Recovery hotspots, median turnaround times, item category charts, and KPIs.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-purple-700">
            <span>View Analytics</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {/* Card 8: Settings */}
        <Link
          href="/admin/settings"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-[#F58220] hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1E6] text-[#F58220] mb-3 group-hover:bg-[#F58220] group-hover:text-white transition-colors">
              <Sliders className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-[#283442] group-hover:text-[#F58220] transition-colors">
              Settings &amp; Rules
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Configure retention periods, matching engine thresholds, and cryptographic vaults.
            </p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#F58220]">
            <span>Configure</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>

      {/* Forensic Audit Log Strip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-[#283442]">Recent Statutory Audit Entries</h3>
            <p className="text-xs text-slate-500">Live cryptographic state transitions across campus security posts.</p>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs font-bold text-[#F58220] hover:underline"
          >
            Full Audit Ledger &rarr;
          </Link>
        </div>

        <div className="divide-y divide-slate-100 mt-2">
          {auditLogs.length > 0 ? (
            auditLogs.map((log) => (
              <div key={log._id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs gap-2">
                <div>
                  <span className="font-mono font-bold text-[#356DE8] bg-[#EBF1FD] px-2 py-0.5 rounded text-[10px]">
                    {log.targetEntity}
                  </span>
                  <span className="ml-2 font-semibold text-slate-800">
                    {(log.action || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                  <span>Role: <strong>{log.actorRole}</strong></span>
                  <span className="font-mono text-slate-400">{new Date(log.timestamp).toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-4 text-xs text-slate-500 text-center">
              Audit ledger running in verified mode. No security exceptions recorded.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
