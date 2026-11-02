'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, 
  User, 
  MapPin 
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface AdminClaimRecord {
  id: string;
  itemTitle: string;
  referenceNumber: string;
  claimantName: string;
  claimantRegNo: string;
  status: string;
  submittedAt: string;
  adjudicatedBy?: string;
  desk?: string;
  rejectionReason?: string;
}

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<AdminClaimRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    async function fetchClaims() {
      try {
        const data = await apiClient.getPendingClaimsQueue({
          status: statusFilter,
          search: searchTerm.trim() || undefined,
        });
        if (!isSubscribed) return;

        if (Array.isArray(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped: AdminClaimRecord[] = data.map((c: any) => ({
            id: c.id,
            itemTitle: c.item?.title || c.itemTitle || 'Unspecified Item',
            referenceNumber: c.item?.referenceNumber || c.itemReference || 'LPU-FND',
            claimantName: c.claimant?.fullName || 'Claimant',
            claimantRegNo: c.claimant?.registrationNumber || 'N/A',
            status: c.claimStatus || 'SUBMITTED',
            submittedAt: c.submittedAt || c.createdAt || new Date().toISOString(),
            adjudicatedBy: c.reviewedBy?.fullName || (c.reviewedBy ? String(c.reviewedBy) : 'Pending Review'),
            desk: c.item?.currentCustodyDesk || c.item?.specificLocation || 'Campus Security Desk',
            rejectionReason: c.rejectionReason,
          }));
          setClaims(mapped);
        } else {
          setClaims([]);
        }
      } catch {
        if (isSubscribed) setClaims([]);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }
    fetchClaims();
    return () => {
      isSubscribed = false;
    };
  }, [statusFilter, searchTerm]);

  const filtered = claims.filter((c) => {
    const matchesSearch = 
      c.itemTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.claimantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.claimantRegNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout
      title="Ownership Claims Oversight"
      subtitle="Campus-wide adjudication ledger for property recovery claims across security check-in posts."
      role="CAMPUS_ADMIN"
    >
      {/* Search and Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search claims by item, claimant name, reg number, reference..."
            className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] pl-10 pr-4 py-2 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#20B5AD] focus:outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#20B5AD] focus:outline-none w-full sm:w-auto"
        >
          <option value="ALL">All Claim Statuses</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved (Awaiting OTP)</option>
          <option value="HANDED_OVER">Handed Over (Completed)</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Claims Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#192B4A]">Adjudicated Property Claims</h3>
            <p className="text-xs text-slate-500">Supervised claim outcomes reviewed by campus security officers.</p>
          </div>
          <span className="text-xs font-bold text-[#16A89F] bg-[#E6F8F7] px-2.5 py-1 rounded-lg">
            {loading ? '...' : `${filtered.length} Claims`}
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">
            Loading claims oversight ledger...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No claims matching filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <div key={item.id} className="p-4 sm:p-5 hover:bg-[#F5F8FC] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-[#356DE8] bg-[#EBF1FD] px-2 py-0.5 rounded">
                      {item.referenceNumber}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      item.status === 'APPROVED' || item.status === 'HANDED_OVER'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : item.status === 'UNDER_REVIEW'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[#192B4A]">{item.itemTitle}</h4>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Claimant: <strong>{item.claimantName}</strong> ({item.claimantRegNo})
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {item.desk}
                    </span>
                    <span className="text-slate-400">
                      Reviewed by: <strong className="text-slate-700">{item.adjudicatedBy}</strong>
                    </span>
                  </div>

                  {item.rejectionReason && (
                    <p className="text-xs text-rose-700 bg-rose-50/70 p-2 rounded-lg border border-rose-100">
                      Rejection note: {item.rejectionReason}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex sm:flex-col items-end justify-between sm:justify-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(item.submittedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                  <Link
                    href="/admin/audit"
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#20B5AD] hover:text-[#20B5AD] transition-colors"
                  >
                    View Audit Trail
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
