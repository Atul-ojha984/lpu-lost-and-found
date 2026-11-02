'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  User 
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface CustodyLog {
  id: string;
  referenceNumber: string;
  itemTitle: string;
  action: string;
  fromLocation: string;
  toLocation: string;
  officerName: string;
  officerPost: string;
  timestamp: string;
  remarks: string;
}

export default function SecurityCustodyHistoryPage() {
  const [logs, setLogs] = useState<CustodyLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    async function fetchLogs() {
      try {
        const res = await apiClient.getAuditTrail();
        if (!isSubscribed) return;

        if (Array.isArray(res)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped: CustodyLog[] = res.map((entry: any, idx: number) => {
            const meta = entry.metadata || {};
            let displayAction = 'INTAKE';
            if (entry.action === 'HANDOVER_EXECUTE') displayAction = 'HANDOVER';
            else if (entry.action === 'CUSTODY_TRANSFER') displayAction = 'TRANSFER';
            else if (entry.action === 'CUSTODY_INTAKE' || entry.action === 'ITEM_REPORT_FOUND') displayAction = 'INTAKE';
            else displayAction = entry.action || 'INTAKE';

            return {
              id: String(entry.id || entry._id || `cust-${idx}`),
              referenceNumber: meta.referenceNumber || meta.itemReference || entry.targetId || 'LPU-CUST',
              itemTitle: meta.itemTitle || meta.title || `Property (${entry.targetEntity || 'Item'})`,
              action: displayAction,
              fromLocation: meta.fromLocation || meta.deskLocation || 'Intake Desk',
              toLocation: meta.toLocation || meta.assignedDesk || 'Secure Custody',
              officerName: entry.actor?.fullName || 'Campus Security Officer',
              officerPost: entry.actor?.registrationNumber || 'LPU-SEC',
              timestamp: entry.createdAt || entry.timestamp || new Date().toISOString(),
              remarks: meta.remarks || meta.notes || meta.reason || `Action ${entry.action} recorded.`,
            };
          });
          setLogs(mapped);
        } else {
          setLogs([]);
        }
      } catch {
        if (isSubscribed) setLogs([]);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    fetchLogs();
    return () => {
      isSubscribed = false;
    };
  }, []);

  const filtered = logs.filter((log) => {
    const matchesSearch = 
      log.itemTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.officerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  return (
    <DashboardLayout
      title="Custody Ledger &amp; Movement History"
      subtitle="Chain-of-custody audit log tracking physical property intake, transfers, and releases."
      role="SECURITY_PERSONNEL"
    >
      {/* Search and Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search custody ledger by item, ref number, officer..."
            className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] pl-10 pr-4 py-2 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#20B5AD] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#20B5AD] focus:outline-none w-full sm:w-auto"
          >
            <option value="ALL">All Custody Actions</option>
            <option value="INTAKE">Property Intake</option>
            <option value="TRANSFER">Internal Transfer</option>
            <option value="HANDOVER">Handover Release</option>
          </select>
        </div>
      </div>

      {/* Custody Log Records */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#192B4A]">Physical Custody Ledger Entries</h3>
            <p className="text-xs text-slate-500">Immutable chain-of-custody entries with officer cryptographic timestamps.</p>
          </div>
          <span className="text-xs font-bold text-[#20B5AD] bg-[#E6F8F7] px-2.5 py-1 rounded-lg">
            {loading ? '...' : `${filtered.length} Entries`}
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">
            Loading chain-of-custody ledger...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No custody events found matching filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((log) => (
              <div key={log.id} className="p-4 sm:p-5 hover:bg-[#FAFBFB] transition-colors space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-[#356DE8] bg-[#EBF1FD] px-2 py-0.5 rounded">
                      {log.referenceNumber}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      log.action === 'HANDOVER'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : log.action === 'TRANSFER'
                        ? 'bg-[#EBF1FD] text-[#356DE8] border border-[#356DE8]/30'
                        : 'bg-[#E6F8F7] text-[#16A89F] border border-[#20B5AD]/30'
                    }`}>
                      {log.action}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(log.timestamp).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-[#192B4A]">{log.itemTitle}</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 bg-[#F5F8FC] p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">Custody Path:</span>
                    <span className="font-semibold text-slate-700">{log.fromLocation}</span>
                    <span className="text-slate-400">&rarr;</span>
                    <span className="font-semibold text-[#20B5AD]">{log.toLocation}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:justify-end">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Officer: <strong>{log.officerName}</strong> ({log.officerPost})</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 italic pl-1">
                  &ldquo;{log.remarks}&rdquo;
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
