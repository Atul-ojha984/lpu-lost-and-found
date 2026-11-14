'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  Archive, 
  ShieldAlert,
  Clock,
  Settings2,
  X
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { AdminInventoryControls } from '@/components/admin/AdminInventoryControls';
import { apiClient } from '@/lib/api-client';

interface AgeingItem {
  _id: string;
  referenceNumber: string;
  title: string;
  status: string;
  eventDate: string;
  retentionExpiresAt: string;
  currentCustodyDesk?: string;
  category?: { _id: string; name: string; code: string; defaultRetentionDays: number };
  location?: { _id: string; name: string; campusZone: string };
  daysElapsed: number;
  daysUntilExpiry: number;
  isRetentionExpired: boolean;
  escalationState: 'IN_RETENTION' | 'NOTICE_PERIOD' | 'DISPOSAL_PENDING' | 'DISPOSED';
}

interface ItemCategoryRecord {
  _id: string;
  code: string;
  name: string;
  description?: string;
  defaultRetentionDays: number;
  isActive: boolean;
}

export default function AdminItemsPage() {
  const [items, setItems] = useState<AgeingItem[]>([]);
  const [categories, setCategories] = useState<ItemCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [queueLoadError, setQueueLoadError] = useState('');
  const [categoriesLoadError, setCategoriesLoadError] = useState('');
  const loadRequestId = useRef(0);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [countsByState, setCountsByState] = useState<{
    inRetention: number;
    noticePeriod: number;
    disposalPending: number;
    disposed: number;
  } | null>(null);

  // Disposal Modal state
  const [selectedItemForDisposal, setSelectedItemForDisposal] = useState<AgeingItem | null>(null);
  const [disposalMethod, setDisposalMethod] = useState<'DONATION' | 'AUCTION' | 'DESTRUCTION' | 'RECYCLED'>('DONATION');
  const [disposalReason, setDisposalReason] = useState('');
  const [recipientOrg, setRecipientOrg] = useState('');
  const [certificateUrl, setCertificateUrl] = useState('');
  const [submittingDisposal, setSubmittingDisposal] = useState(false);
  const [disposalError, setDisposalError] = useState('');
  const [disposalSuccess, setDisposalSuccess] = useState('');

  // Category Configuration Modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ItemCategoryRecord | null>(null);
  const [catRetentionDays, setCatRetentionDays] = useState(90);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setQueueLoadError('');
    setCategoriesLoadError('');
    try {
      const [queueRes, catRes] = await Promise.allSettled([
        apiClient.getAdminAgeingQueue({
          escalationState: stateFilter !== 'ALL' ? stateFilter : undefined,
          search: search.trim() || undefined,
        }),
        apiClient.getAdminCategories(true),
      ]);
      if (requestId !== loadRequestId.current) return;

      if (queueRes.status === 'fulfilled' && Array.isArray(queueRes.value?.items)) {
        setItems(queueRes.value.items);
        setQueueLoaded(true);
        if (queueRes.value.countsByState && typeof queueRes.value.countsByState === 'object') {
          setCountsByState(queueRes.value.countsByState);
        } else {
          setCountsByState(null);
        }
      } else {
        setItems([]);
        setCountsByState(null);
        setQueueLoaded(false);
        setQueueLoadError('The property ageing queue could not be loaded. Refresh and try again.');
      }

      if (catRes.status === 'fulfilled' && Array.isArray(catRes.value)) {
        setCategories(catRes.value);
        setCategoriesLoaded(true);
      } else {
        setCategories([]);
        setCategoriesLoaded(false);
        setCategoriesLoadError('Category retention rules could not be loaded. Refresh and try again.');
      }
    } catch {
      if (requestId !== loadRequestId.current) return;
      setItems([]);
      setCountsByState(null);
      setQueueLoaded(false);
      setCategories([]);
      setCategoriesLoaded(false);
      setQueueLoadError('The property ageing queue could not be loaded. Refresh and try again.');
      setCategoriesLoadError('Category retention rules could not be loaded. Refresh and try again.');
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [search, stateFilter]);

  useEffect(() => {
    const request = window.setTimeout(() => void loadData(), 0);
    return () => {
      window.clearTimeout(request);
      loadRequestId.current += 1;
    };
  }, [loadData]);

  async function handleDisposalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItemForDisposal) return;
    if (disposalReason.trim().length < 5) {
      setDisposalError('Disposal reason must be at least 5 characters.');
      return;
    }

    setSubmittingDisposal(true);
    setDisposalError('');
    setDisposalSuccess('');

    try {
      await apiClient.approveDisposal({
        itemId: selectedItemForDisposal._id,
        method: disposalMethod,
        reason: disposalReason.trim(),
        recipientOrganization: recipientOrg.trim() || undefined,
        certificateUrl: certificateUrl.trim() || undefined,
      });

      setDisposalSuccess(
        `Disposal approved successfully for ${selectedItemForDisposal.referenceNumber}. Logged to audit trail.`
      );
      setTimeout(() => {
        setSelectedItemForDisposal(null);
        setDisposalReason('');
        setRecipientOrg('');
        setCertificateUrl('');
        setDisposalSuccess('');
        void loadData();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Disposal approval failed';
      setDisposalError(msg);
    } finally {
      setSubmittingDisposal(false);
    }
  }

  async function handleUpdateCategoryRetention(catId: string) {
    try {
      await apiClient.updateAdminCategory(catId, {
        defaultRetentionDays: catRetentionDays,
      });
      setShowCategoryModal(false);
      setEditingCategory(null);
      void loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update category');
    }
  }

  return (
    <DashboardLayout
      title="Campus Property Inventory &amp; Lifecycle"
      subtitle="Statutory retention oversight, ageing queues, and committee-approved disposal board."
      role="CAMPUS_ADMIN"
    >
      <AdminInventoryControls />

      {/* Statutory Retention Rule Notice Banner */}
      <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-xs">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-amber-950">
              Statutory Retention Compliance Protocol (University Rule 26.4)
            </h4>
            <p className="leading-relaxed">
              <strong>Mandatory Rule:</strong> Never automatically dispose of an item merely because it is old.
              Items past their configured retention window transition to the <em>Disposal Pending</em> queue and
              strictly require formal review and signoff by the campus administrative committee.
            </p>
          </div>
        </div>
      </div>

      {/* Escalation State Tabs & Category Config Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStateFilter('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              stateFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Items ({queueLoaded ? items.length : '—'})
          </button>
          <button
            type="button"
            onClick={() => setStateFilter('IN_RETENTION')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              stateFilter === 'IN_RETENTION'
                ? 'bg-emerald-700 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            In Retention ({countsByState?.inRetention ?? '—'})
          </button>
          <button
            type="button"
            onClick={() => setStateFilter('NOTICE_PERIOD')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              stateFilter === 'NOTICE_PERIOD'
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Notice Period ({countsByState?.noticePeriod ?? '—'})
          </button>
          <button
            type="button"
            onClick={() => setStateFilter('DISPOSAL_PENDING')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              stateFilter === 'DISPOSAL_PENDING'
                ? 'bg-rose-700 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Disposal Pending ({countsByState?.disposalPending ?? '—'})
          </button>
          <button
            type="button"
            onClick={() => setStateFilter('DISPOSED')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              stateFilter === 'DISPOSED'
                ? 'bg-slate-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Disposed ({countsByState?.disposed ?? '—'})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowCategoryModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
        >
          <Settings2 className="h-3.5 w-3.5 text-slate-500" />
          <span>Category Retention Rules ({categoriesLoaded ? categories.length : '—'})</span>
        </button>
      </div>

      {queueLoadError && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {queueLoadError}
        </div>
      )}
      {categoriesLoadError && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {categoriesLoadError}
        </div>
      )}

      {/* Search & Actions Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadData()}
            placeholder="Search inventory by reference, title, or custody desk..."
            className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          Filter
        </button>
      </div>

      {/* Inventory & Ageing Queue Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Reference &amp; Title</th>
              <th className="px-4 py-3">Category &amp; Zone</th>
              <th className="px-4 py-3">Custody Desk</th>
              <th className="px-4 py-3">Days Elapsed</th>
              <th className="px-4 py-3">Escalation State</th>
              <th className="px-4 py-3 text-right">Administrative Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  Loading campus inventory and ageing status...
                </td>
              </tr>
            ) : queueLoadError ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-amber-800">
                  Property ageing records are unavailable. Use the Filter button to retry.
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  No property items match the selected escalation filter.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const badgeColor =
                  item.escalationState === 'IN_RETENTION'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : item.escalationState === 'NOTICE_PERIOD'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : item.escalationState === 'DISPOSAL_PENDING'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200';

                return (
                  <tr key={item._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] text-slate-500 block font-semibold">
                        {item.referenceNumber}
                      </span>
                      <span className="font-semibold text-slate-900">{item.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-800 font-medium block">
                        {item.category?.name || 'Uncategorized'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {item.location?.campusZone || 'Not specified'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-slate-700">
                        {item.currentCustodyDesk || 'Not recorded'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span className="font-semibold text-slate-800">{item.daysElapsed} days</span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {item.daysUntilExpiry >= 0
                          ? `${item.daysUntilExpiry}d left in retention`
                          : `${Math.abs(item.daysUntilExpiry)}d past retention`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}
                      >
                        {item.escalationState.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'DISPOSED' ? (
                        <span className="text-[11px] font-semibold text-slate-400">Disposed</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedItemForDisposal(item)}
                          className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-rose-800 transition-colors"
                        >
                          <Archive className="h-3 w-3" />
                          <span>Approve Disposal</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Disposal Committee Approval Modal */}
      {selectedItemForDisposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Administrative Committee Disposal Approval
                </h3>
                <p className="text-xs text-slate-500">
                  Item: {selectedItemForDisposal.referenceNumber} — {selectedItemForDisposal.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemForDisposal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {disposalError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {disposalError}
              </div>
            )}
            {disposalSuccess && (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
                {disposalSuccess}
              </div>
            )}

            <form onSubmit={handleDisposalSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Disposal Method *
                </label>
                <select
                  value={disposalMethod}
                  onChange={(e) =>
                    setDisposalMethod(
                      e.target.value as 'DONATION' | 'AUCTION' | 'DESTRUCTION' | 'RECYCLED'
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                >
                  <option value="DONATION">Campus Charity Donation (e.g., Goonj, Student Welfare)</option>
                  <option value="AUCTION">University Surplus Asset Auction</option>
                  <option value="RECYCLED">Campus E-Waste / Material Recycling</option>
                  <option value="DESTRUCTION">Supervised Destruction (Biohazard / Perishable / Expired)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Disposal Committee Reason &amp; Justification *
                </label>
                <textarea
                  rows={3}
                  value={disposalReason}
                  onChange={(e) => setDisposalReason(e.target.value)}
                  placeholder="Record formal statutory committee minutes and reason for disposal..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient Organization / Recycler (Optional)
                </label>
                <input
                  type="text"
                  value={recipientOrg}
                  onChange={(e) => setRecipientOrg(e.target.value)}
                  placeholder="e.g. Goonj Student Relief Cell or Green Campus Recyclers"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Certificate / Evidence Reference URL (Optional)
                </label>
                <input
                  type="url"
                  value={certificateUrl}
                  onChange={(e) => setCertificateUrl(e.target.value)}
                  placeholder="e.g. https://docs.lpu.in/certificates/disp-2026-004.pdf"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedItemForDisposal(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDisposal}
                  className="rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white shadow-xs hover:bg-rose-800 transition-colors disabled:opacity-50"
                >
                  {submittingDisposal ? 'Recording Disposal...' : 'Approve & Execute Disposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Retention Period Configuration Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Approved Item Categories &amp; Retention Periods
                </h3>
                <p className="text-xs text-slate-500">
                  Configure statutory hold days per item category before notice escalation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
              {categories.map((cat) => (
                <div key={cat._id} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">{cat.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">{cat.code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-slate-100 px-2 py-1 font-mono text-slate-700 font-semibold text-xs">
                      {cat.defaultRetentionDays ?? 90} Days
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(cat);
                        setCatRetentionDays(cat.defaultRetentionDays || 90);
                      }}
                      className="text-xs text-red-700 font-semibold hover:underline"
                    >
                      Edit Period
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {editingCategory && (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-2 text-xs">
                <span className="font-bold text-red-900 block">
                  Update Retention for: {editingCategory.name}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={catRetentionDays}
                    onChange={(e) => setCatRetentionDays(Number(e.target.value))}
                    className="w-24 rounded border border-slate-300 p-1.5 font-mono text-xs text-slate-900 bg-white"
                  />
                  <span className="text-slate-600">days statutory hold</span>
                  <button
                    type="button"
                    onClick={() => handleUpdateCategoryRetention(editingCategory._id)}
                    className="ml-auto rounded bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800"
                  >
                    Save Retention
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
