'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  PlusCircle, 
  MapPin, 
  Calendar, 
  ExternalLink, 
  Edit3, 
  AlertCircle,
  X,
  CheckCircle2,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { PublicItem } from '@/types';
import { formatDisplayDate } from '@/lib/formatters';

function MyReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdParam = searchParams.get('edit');

  const [items, setItems] = useState<PublicItem[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'LOST' | 'FOUND'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<PublicItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);

  // Report withdrawal confirmation state
  const [withdrawingItem, setWithdrawingItem] = useState<PublicItem | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawErrorMsg, setWithdrawErrorMsg] = useState<string | null>(null);
  const [reportActionNotice, setReportActionNotice] = useState<string | null>(null);

  const handleOpenEdit = useCallback((item: PublicItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditDescription(item.publicDescription);
    setEditLocation(item.specificLocation);
    setEditSuccessMsg(null);
    setEditErrorMsg(null);
  }, []);

  const fetchMyReports = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const reports = await apiClient.getMyReports();
      setItems(reports);

      // If URL param specified an item to edit, open it
      if (editIdParam) {
        const target = reports.find((r) => r.id === editIdParam);
        if (target) {
          handleOpenEdit(target);
        }
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          setErrorMessage('Please log in with your LPU account to view your filed reports.');
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage('Failed to load your reported items. Please retry.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [editIdParam, handleOpenEdit]);

  useEffect(() => {
    let isMounted = true;

    async function loadReports() {
      try {
        const reports = await apiClient.getMyReports();
        if (isMounted) {
          setItems(reports);

          // If URL param specified an item to edit, open it
          if (editIdParam) {
            const target = reports.find((r) => r.id === editIdParam);
            if (target) {
              handleOpenEdit(target);
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          if (err instanceof ApiClientError) {
            if (err.statusCode === 401) {
              setErrorMessage('Please log in with your LPU account to view your filed reports.');
            } else {
              setErrorMessage(err.message);
            }
          } else {
            setErrorMessage('Failed to load your reported items. Please retry.');
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadReports();

    return () => {
      isMounted = false;
    };
  }, [editIdParam, handleOpenEdit]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setIsSavingEdit(true);
    setEditErrorMsg(null);

    try {
      const updated = await apiClient.updateReport(editingItem.id, {
        title: editTitle.trim(),
        publicDescription: editDescription.trim(),
        specificLocation: editLocation.trim(),
      });

      setEditSuccessMsg('Report updated successfully.');
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));

      setTimeout(() => {
        setEditingItem(null);
        setEditSuccessMsg(null);
      }, 1500);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditErrorMsg(err.message);
      } else {
        setEditErrorMsg('Failed to update report. Please check your network connection.');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleWithdrawReport = async () => {
    if (!withdrawingItem || !withdrawingItem.isOwner) return;

    setIsWithdrawing(true);
    setWithdrawErrorMsg(null);

    try {
      await apiClient.withdrawReport(withdrawingItem.id);
      setItems((prev) => prev.filter((item) => item.id !== withdrawingItem.id));
      setReportActionNotice(`Report ${withdrawingItem.referenceNumber} was removed from your active reports.`);
      setWithdrawingItem(null);

      // Re-fetch the authenticated user's active reports after withdrawal.
      void apiClient.getMyReports().then(setItems).catch(() => undefined);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setWithdrawErrorMsg(err.message);
      } else {
        setWithdrawErrorMsg('Unable to remove this report right now. Please retry.');
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  const filteredItems = items.filter((i) => {
    if (filterType !== 'ALL' && i.itemType !== filterType) return false;
    return true;
  });

  return (
    <DashboardLayout
      title="My Reported Items"
      subtitle="View, track status changes, and manage your property reports."
      role="STUDENT_STAFF"
    >
      {/* Top Filter and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-2xs">
          {(['ALL', 'LOST', 'FOUND'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`rounded-md px-3 py-1 text-xs font-semibold tracking-wide transition-all ${
                filterType === type
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {type === 'ALL' ? 'All My Reports' : type === 'LOST' ? 'Lost Property' : 'Found Property'}
            </button>
          ))}
        </div>

        <Link
          href="/report"
          className="inline-flex items-center gap-1.5 rounded-lg lpu-btn-primary px-3.5 py-1.5 text-xs font-semibold shadow-xs hover:bg-[#E66F00] transition-colors"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          <span>Submit New Report</span>
        </Link>
      </div>

      {reportActionNotice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{reportActionNotice}</span>
          <button
            type="button"
            onClick={() => setReportActionNotice(null)}
            className="ml-auto rounded p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <LoadingState message="Loading your campus incident filings..." />
        </div>
      )}

      {/* Error State */}
      {!isLoading && errorMessage && (
        <div className="rounded-xl border border-red-200 bg-white p-10 text-center shadow-xs space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Unable to Load Reports</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">{errorMessage}</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/login?redirect=/dashboard/my-reports"
              className="rounded-lg lpu-btn-primary px-4 py-2 text-xs font-semibold shadow-xs hover:bg-[#E66F00] transition-colors"
            >
              Log In
            </Link>
            <button
              type="button"
              onClick={fetchMyReports}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Reports Table / Card List */}
      {!isLoading && !errorMessage && (
        <>
          {filteredItems.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 gap-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            item.itemType === 'FOUND'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-red-50 text-red-800 border border-red-200'
                          }`}
                        >
                          {item.itemType}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          {item.referenceNumber}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>

                      <p className="text-xs text-slate-500 max-w-2xl line-clamp-1">
                        {item.publicDescription}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1 text-slate-600 font-medium">
                          <MapPin className="h-3.5 w-3.5 text-red-600" />
                          {item.specificLocation}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          Logged on {formatDisplayDate(item.createdAt)}
                        </span>
                        {item.currentCustodyDesk && (
                          <span className="flex items-center gap-1 text-blue-700 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {item.currentCustodyDesk}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                      <Link
                        href={`/items/${item.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                        <span>View</span>
                      </Link>

                      {/* Allow editing if item is not yet handed over or disposed */}
                      {item.status !== 'HANDED_OVER' && item.status !== 'DISPOSED' && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-red-700 transition-colors"
                          title="Edit this report"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                          <span>Edit</span>
                        </button>
                      )}

                      {item.isOwner && (
                        <button
                          type="button"
                          onClick={() => {
                            setWithdrawErrorMsg(null);
                            setWithdrawingItem(item);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
                          title="Remove this report"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No reports found in this category"
              description="You have not filed any lost or found items under the selected filter."
              actionText="File New Report"
              onAction={() => router.push('/report')}
            />
          )}
        </>
      )}

      {/* Edit Report Modal */}
      {editingItem && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setEditingItem(null)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">
                Authorized Owner Edit
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                Edit Report: {editingItem.referenceNumber}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Update report details or specific location information.
              </p>
            </div>

            {editSuccessMsg ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="text-xs font-bold text-emerald-900">{editSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSaveEdit} className="space-y-4">
                {editErrorMsg && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
                    <span>{editErrorMsg}</span>
                  </div>
                )}

                <FormField id="edit-title" label="Item Title / Model" required>
                  <input
                    id="edit-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    required
                  />
                </FormField>

                <FormField id="edit-desc" label="Public Description" required>
                  <textarea
                    id="edit-desc"
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    required
                  />
                </FormField>

                <FormField id="edit-loc" label="Specific Location / Landmark" required>
                  <input
                    id="edit-loc"
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    required
                  />
                </FormField>

                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    disabled={isSavingEdit}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="rounded-lg lpu-btn-primary px-5 py-2 text-xs font-semibold shadow-xs hover:bg-[#E66F00] transition-colors disabled:opacity-60"
                  >
                    {isSavingEdit ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Withdraw Report Confirmation Modal */}
      {withdrawingItem && (
        <div role="dialog" aria-modal="true" aria-labelledby="withdraw-report-title" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => !isWithdrawing && setWithdrawingItem(null)}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 animate-fade-in">
            <button
              type="button"
              onClick={() => setWithdrawingItem(null)}
              disabled={isWithdrawing}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              aria-label="Close confirmation"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">Remove Your Report</span>
              <h3 id="withdraw-report-title" className="text-lg font-bold text-slate-900 mt-0.5">
                Remove Report: {withdrawingItem.referenceNumber}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Are you sure you want to remove this report? If you have already recovered the item or resolved the matter independently, you can remove this report. This action cannot be undone from your account.
              </p>
            </div>

            {withdrawErrorMsg && (
              <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
                <span>{withdrawErrorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWithdrawingItem(null)}
                disabled={isWithdrawing}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWithdrawReport}
                disabled={isWithdrawing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-800 transition-colors disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isWithdrawing ? 'Removing Report...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function MyReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading My Reports...</div>}>
      <MyReportsContent />
    </Suspense>
  );
}
