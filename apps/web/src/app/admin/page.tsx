'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  BarChart3, 
  Package, 
  Users, 
  ArrowRight, 
  TrendingUp,
  ClipboardList
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

        if (statsData.status === 'fulfilled' && statsData.value) {
          setAnalytics(statsData.value.overview);
        } else {
          // Fallback demo values if offline
          setAnalytics({
            totalReports: 12,
            totalLost: 5,
            totalFound: 7,
            itemsReturned: 4,
            returnRatePercent: 57.1,
            pendingClaims: 3,
            totalVerificationFailures: 2,
            totalUnclaimedInCustody: 5,
          });
        }

        if (logsData.status === 'fulfilled' && Array.isArray(logsData.value)) {
          setAuditLogs(logsData.value);
        }
      } catch {
        // Safe fallback
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <DashboardLayout
      title="Campus Administration & Governance"
      subtitle="Directorate of Student Welfare (DSW) • Operational oversight, statutory ageing, and audit trail."
      role="CAMPUS_ADMIN"
    >
      {/* High-Level Operational Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Logged Property
          </span>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {loading ? '...' : analytics?.totalReports ?? 0}
          </p>
          <span className="text-[11px] text-slate-400">
            {analytics?.totalLost ?? 0} Lost • {analytics?.totalFound ?? 0} Found
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Successful Return Rate
          </span>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">
            {loading ? '...' : `${analytics?.returnRatePercent ?? 0}%`}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{analytics?.itemsReturned ?? 0} items returned to owners</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Secure Custody Items
          </span>
          <p className="mt-2 text-2xl font-extrabold text-blue-700">
            {loading ? '...' : analytics?.totalUnclaimedInCustody ?? 0}
          </p>
          <span className="text-[11px] text-slate-400">Under campus security custody</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Pending Claims &amp; Failures
          </span>
          <p className="mt-2 text-2xl font-extrabold text-amber-700">
            {loading ? '...' : `${analytics?.pendingClaims ?? 0} Pending`}
          </p>
          <span className="text-[11px] text-amber-700 font-medium">
            {analytics?.totalVerificationFailures ?? 0} verification attempts flagged
          </span>
        </div>
      </div>

      {/* Governance Hub Navigation Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Link
          href="/admin/items"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-red-300 hover:shadow-md transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700 mb-4 group-hover:bg-red-700 group-hover:text-white transition-colors">
            <Package className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 group-hover:text-red-700 transition-colors">
            Inventory &amp; Ageing
          </h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Statutory 90-day retention queue, notice periods, and formal disposal committee review.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-red-700">
            <span>Manage Inventory</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        <Link
          href="/admin/users"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 mb-4 group-hover:bg-blue-700 group-hover:text-white transition-colors">
            <Users className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
            Role Permissions
          </h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Assign security officers, post stations (Uni-Mall, Gate 1), and manage account governance.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
            <span>Manage Roles</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        <Link
          href="/admin/analytics"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-purple-300 hover:shadow-md transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 mb-4 group-hover:bg-purple-700 group-hover:text-white transition-colors">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
            Computed Analytics
          </h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Median return time, custody desk inventory, category breakdown, and 24h hotspots.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-purple-700">
            <span>View Analytics</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        <Link
          href="/admin/audit"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 mb-4 group-hover:bg-emerald-700 group-hover:text-white transition-colors">
            <ClipboardList className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
            Audit Trail Explorer
          </h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Searchable privileged audit log with zero privacy leaks and entity filters.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <span>Inspect Audit Log</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>

      {/* Security Audit Trail Sample */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Privileged Security Audit Stream</h3>
            <p className="text-xs text-slate-500">Immutable record of high-privilege administrative actions.</p>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs font-semibold text-red-700 hover:underline inline-flex items-center gap-1"
          >
            <span>View All Logs</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-slate-100 mt-2 text-xs">
          {auditLogs.length > 0 ? (
            auditLogs.map((log) => (
              <div key={log._id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{log.action}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {log.targetEntity}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Actor Role: {log.actorRole}
                    {log.metadata && typeof log.metadata.reason === 'string'
                      ? ` • Reason: ${log.metadata.reason}`
                      : ''}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))
          ) : (
            <>
              <div className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900">CLAIM_APPROVED</span>
                  <p className="text-slate-500 text-[11px]">Officer Rajesh Verma approved claim for Casio fx-991EX (LPU-2026-F0089)</p>
                </div>
                <span className="text-[10px] text-slate-400">Today, 09:15 AM</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900">OTP_HANDOVER_EXECUTED</span>
                  <p className="text-slate-500 text-[11px]">Head Guard Manjit Singh executed handover for Honda Bike Key (LPU-2026-F0080)</p>
                </div>
                <span className="text-[10px] text-slate-400">15 Oct 2026, 11:20 AM</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900">ITEM_DISPOSE</span>
                  <p className="text-slate-500 text-[11px]">Committee approved disposal for Badminton Kit Bag via DONATION</p>
                </div>
                <span className="text-[10px] text-slate-400">18 Oct 2026, 12:05 PM</span>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
