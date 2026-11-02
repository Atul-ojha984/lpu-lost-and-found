'use client';

import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Eye, 
  ChevronLeft, 
  ChevronRight
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface AuditLogEntry {
  _id: string;
  action: string;
  actor?: {
    _id: string;
    fullName: string;
    email: string;
    registrationNumber: string;
    role: string;
  };
  actorRole: string;
  targetEntity: string;
  targetId?: string;
  ipAddress: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Inspector modal for metadata
  const [inspectedLog, setInspectedLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    let isSubscribed = true;
    async function fetchLogs() {
      try {
        const res = await apiClient.getAdminAuditLogs({
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
          targetEntity: entityFilter !== 'ALL' ? entityFilter : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page,
          limit: 15,
        });
        if (!isSubscribed) return;

        if (Array.isArray(res)) {
          setLogs(res);
          setTotalCount(res.length);
          setTotalPages(Math.max(1, Math.ceil(res.length / 15)));
        } else if (res && Array.isArray(res.items)) {
          setLogs(res.items);
          setTotalCount(res.total || res.items.length);
          setTotalPages(res.totalPages || Math.max(1, Math.ceil((res.total || res.items.length) / 15)));
        } else {
          setLogs([]);
          setTotalCount(0);
          setTotalPages(1);
        }
      } catch {
        if (isSubscribed) {
          setLogs([]);
          setTotalCount(0);
          setTotalPages(1);
        }
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }
    fetchLogs();
    return () => {
      isSubscribed = false;
    };
  }, [actionFilter, entityFilter, startDate, endDate, page, refreshTrigger]);

  return (
    <DashboardLayout
      title="Compliance Audit Trail &amp; History Explorer"
      subtitle="Authorized immutable security history • Cryptographic integrity with zero privacy leaks."
      role="CAMPUS_ADMIN"
    >
      {/* Privacy Guarantee Alert Box */}
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 text-xs text-emerald-950 shadow-xs">
        <div className="flex items-start gap-2.5">
          <Lock className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-emerald-950">
              Zero-Exposure Privacy Guarantee (Campus Data Protection Directive)
            </h4>
            <p className="leading-relaxed">
              All administrative queries are strictly filtered before presentation. Student passwords, OTP
              secrets, cryptographic keys, and private ownership verification challenge answers are permanently
              redacted from the audit representations.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Filter by Action
          </label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none"
          >
            <option value="">All Audit Actions</option>
            <option value="ITEM_DISPOSE">ITEM_DISPOSE (Disposal Approvals)</option>
            <option value="ROLE_UPDATE">ROLE_UPDATE (Privilege Changes)</option>
            <option value="CLAIM_REVIEW">CLAIM_REVIEW (Claim Approvals/Rejections)</option>
            <option value="HANDOVER_EXECUTE">HANDOVER_EXECUTE (OTP Releases)</option>
            <option value="CUSTODY_TRANSFER">CUSTODY_TRANSFER (Locker Moves)</option>
            <option value="CATEGORY_MANAGE">CATEGORY_MANAGE (Retention Settings)</option>
            <option value="LOCATION_MANAGE">LOCATION_MANAGE (Campus Locations)</option>
            <option value="PRIVATE_VAULT_VIEW">PRIVATE_VAULT_VIEW (Officer Audits)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Target Entity
          </label>
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none"
          >
            <option value="">All Entities</option>
            <option value="Item">Item</option>
            <option value="User">User</option>
            <option value="Claim">Claim</option>
            <option value="Handover">Handover</option>
            <option value="ItemCategory">ItemCategory</option>
            <option value="Location">Location</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            End Date
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setRefreshTrigger((prev) => prev + 1);
              }}
              className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white text-xs hover:bg-red-800 shrink-0"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Action Event</th>
              <th className="px-4 py-3">Actor &amp; Role</th>
              <th className="px-4 py-3">Target Entity</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  Loading immutable audit entries...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  No audit entries found matching the filter criteria.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log._id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 font-mono text-[11px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800 block">
                      {log.actor?.fullName || log.actorRole}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {log.actor?.registrationNumber || log.actorRole}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-700 font-bold">
                      {log.targetEntity}
                    </span>
                    {log.targetId && (
                      <span className="text-[10px] text-slate-400 block font-mono truncate max-w-[120px]">
                        ID: {log.targetId}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    {log.ipAddress}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setInspectedLog(log)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span>
            Total Entries: <strong className="text-slate-900">{totalCount}</strong> • Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Metadata Inspector Modal */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Audit Record Inspector</h3>
                <p className="text-xs text-slate-500 font-mono">
                  Event: {inspectedLog.action} • {inspectedLog._id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px]">TIMESTAMP</span>
                  <span className="font-mono">{new Date(inspectedLog.timestamp).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">ACTOR ROLE</span>
                  <span className="font-bold">{inspectedLog.actorRole}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">TARGET ENTITY</span>
                  <span className="font-mono">{inspectedLog.targetEntity}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">IP ADDRESS</span>
                  <span className="font-mono">{inspectedLog.ipAddress}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px] mb-1">
                  SANITIZED AUDIT METADATA (PAYLOAD)
                </span>
                <pre className="rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-56">
                  {JSON.stringify(inspectedLog.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 text-xs"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
