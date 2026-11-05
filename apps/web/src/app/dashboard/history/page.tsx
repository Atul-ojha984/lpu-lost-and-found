'use client';

/* eslint-disable @next/next/no-img-element -- Recovered item images may use existing external storage URLs. */

import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  Search, 
  ArrowRight,
  ShieldCheck,
  Calendar,
  MapPin
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface RecoveryEvent {
  id: string;
  handoverId: string;
  claimId: string;
  claimReference: string;
  claimStatement: string;
  claimSubmittedAt: string;
  itemId: string;
  referenceNumber: string;
  itemTitle: string;
  category: string;
  publicDescription: string;
  primaryImageUrl: string;
  recoveryDate: string;
  custodyDesk: string;
  status: string;
  handoverOfficer: string;
  handoverOfficerRegistrationNumber: string;
  idCardPresentedType: string;
  idCardNumberMasked: string;
  acknowledgementNotes: string;
  receiptNumber: string;
}

export default function StudentRecoveryHistoryPage() {
  const [historyItems, setHistoryItems] = useState<RecoveryEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    async function loadHistory() {
      try {
        const recoveries = await apiClient.getMyRecoveryHistory();
        if (!isSubscribed) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setHistoryItems((Array.isArray(recoveries) ? recoveries : []).map((record: any) => ({
          id: record.handoverId,
          handoverId: record.handoverId,
          claimId: record.claimId,
          claimReference: record.claimReference,
          claimStatement: record.claimStatement,
          claimSubmittedAt: record.claimSubmittedAt,
          itemId: record.itemId,
          referenceNumber: record.itemReference,
          itemTitle: record.itemTitle,
          category: record.category,
          publicDescription: record.publicDescription,
          primaryImageUrl: record.primaryImageUrl,
          recoveryDate: record.recoveryDate,
          custodyDesk: record.custodyDesk,
          status: record.status,
          handoverOfficer: record.handoverOfficer,
          handoverOfficerRegistrationNumber: record.handoverOfficerRegistrationNumber,
          idCardPresentedType: record.idCardPresentedType,
          idCardNumberMasked: record.idCardNumberMasked,
          acknowledgementNotes: record.acknowledgementNotes,
          receiptNumber: record.handoverReference,
        })));
      } catch {
        if (isSubscribed) setHistoryItems([]);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    loadHistory();
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadHistory();
    }, 20000);
    return () => {
      isSubscribed = false;
      window.clearInterval(refreshInterval);
    };
  }, []);

  const filteredItems = historyItems.filter((i) => 
    i.itemTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const recoveryDurations = historyItems
    .map((item) => new Date(item.recoveryDate).getTime() - new Date(item.claimSubmittedAt).getTime())
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  const averageRecoveryHours = recoveryDurations.length
    ? recoveryDurations.reduce((total, duration) => total + duration, 0) / recoveryDurations.length / (1000 * 60 * 60)
    : null;
  const averageRecoveryLabel = averageRecoveryHours === null
    ? '—'
    : averageRecoveryHours >= 24
      ? `${(averageRecoveryHours / 24).toFixed(1)}d`
      : `${averageRecoveryHours.toFixed(1)}h`;

  return (
    <DashboardLayout
      title="Property Recovery History"
      subtitle="Complete ledger of items successfully claimed and verified through security custody."
      role="STUDENT_STAFF"
    >
      {/* Header Metric Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Recovered
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">{historyItems.length}</p>
          <span className="text-[11px] text-emerald-700 font-semibold">100% verified release</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              OTP Verified Handovers
            </span>
            <div className="h-8 w-8 rounded-xl bg-[#FFF1E6] text-[#F58220] flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">{historyItems.length}</p>
          <span className="text-[11px] text-slate-500">Cryptographic audit trail</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Average Recovery Time
            </span>
            <div className="h-8 w-8 rounded-xl bg-[#EBF1FD] text-[#356DE8] flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-[#283442]">{averageRecoveryLabel}</p>
          <span className="text-[11px] text-slate-500">From claim submission to handover</span>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search recovery history by item title, reference number, or receipt..."
            className="w-full rounded-xl border border-slate-200 bg-[#F5F5F5] pl-10 pr-4 py-2 text-xs font-medium text-[#17243B] placeholder-slate-400 focus:border-[#F58220] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Recovery History Table / Cards */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#283442]">Verified Recovery Receipts</h3>
            <p className="text-xs text-slate-500">Official proof-of-handover records issued by campus security.</p>
          </div>
          <span className="text-xs font-bold text-[#F58220] bg-[#FFF1E6] px-2.5 py-1 rounded-lg">
            {filteredItems.length} Records
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500 text-xs">
            Loading recovery records...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-xs">
            No recovery records matching your filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <div key={item.id} className="p-4 sm:p-5 hover:bg-[#F5F5F5] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-[#356DE8] bg-[#EBF1FD] px-2 py-0.5 rounded">
                      {item.referenceNumber}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Handover Complete
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Handover: {item.receiptNumber}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[#283442]">
                    {item.itemTitle}
                  </h4>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {item.custodyDesk}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(item.recoveryDate).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-slate-400">
                      Handled by: <strong className="text-slate-700">{item.handoverOfficer}</strong>
                    </span>
                  </div>
                </div>

                <div className="relative flex sm:flex-col items-end justify-between sm:justify-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Verification Method
                    </span>
                    <span className="text-xs font-bold text-[#283442]">Single-Use OTP</span>
                  </div>
                  <details className="text-left">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#356DE8] hover:text-[#356DE8] transition-colors">
                      <span>View Recovery Details</span>
                      <ArrowRight className="w-3 h-3" />
                    </summary>
                    <div className="mt-3 w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-slate-600 sm:absolute sm:right-5 sm:z-10 sm:shadow-lg">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">Claim:</span>
                        <span className="font-mono">{item.claimReference}</span>
                        <span className="text-slate-400">({item.claimId})</span>
                      </div>
                      <p className="mt-2"><strong className="text-slate-700">Category:</strong> {item.category}</p>
                      <p className="mt-1"><strong className="text-slate-700">Description:</strong> {item.publicDescription}</p>
                      <p className="mt-1"><strong className="text-slate-700">Claim submitted:</strong> {new Date(item.claimSubmittedAt).toLocaleString('en-IN')}</p>
                      <p className="mt-1"><strong className="text-slate-700">ID verified:</strong> {item.idCardPresentedType} ({item.idCardNumberMasked})</p>
                      <p className="mt-1"><strong className="text-slate-700">Security officer:</strong> {item.handoverOfficer}{item.handoverOfficerRegistrationNumber ? ` (${item.handoverOfficerRegistrationNumber})` : ''}</p>
                      <p className="mt-1"><strong className="text-slate-700">Final status:</strong> {item.status}</p>
                      {item.acknowledgementNotes && (
                        <p className="mt-1"><strong className="text-slate-700">Handover notes:</strong> {item.acknowledgementNotes}</p>
                      )}
                      {item.primaryImageUrl && (
                        <img
                          src={item.primaryImageUrl}
                          alt={`${item.itemTitle} recovered item`}
                          className="mt-3 max-h-40 rounded-lg border border-slate-200 object-contain"
                        />
                      )}
                      <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">
                        Evidence submission is closed because this item has already been successfully recovered.
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
