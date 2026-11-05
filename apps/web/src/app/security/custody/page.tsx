'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  KeyRound, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  History,
  ArrowRightLeft,
  Search,
  RefreshCw,
  PackageCheck,
  Printer,
  X,
  FileText,
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FormField } from '@/components/ui/FormField';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiClient, ApiClientError, type SecurityReviewReport } from '@/lib/api-client';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/formatters';

interface CustodyItem {
  id: string;
  referenceNumber: string;
  title: string;
  category: { name?: string; code?: string } | string;
  specificLocation: string;
  currentCustodyDesk?: string;
  lockerStorageReference?: string;
  status: string;
  eventDate: string;
}

interface PendingHandover {
  claim: {
    _id: string;
    statement: string;
    claimStatus: string;
    claimant?: {
      fullName?: string;
      registrationNumber?: string;
      email?: string;
    };
  };
  item: {
    _id: string;
    referenceNumber: string;
    title: string;
    currentCustodyDesk?: string;
    lockerStorageReference?: string;
  };
}

interface HandoverReceipt {
  handoverId: string;
  claimId: string;
  referenceNumber: string;
  itemTitle: string;
  recipientName: string;
  recipientRegNo: string;
  recipientEmail: string;
  physicalDeskLocation: string;
  idCardPresentedType: string;
  idCardNumberMasked: string;
  acknowledgementNotes?: string;
  completedAt: string;
}

function SecurityCustodyContent() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab === 'handover'
    ? 'handover'
    : requestedTab === 'reports'
      ? 'reports'
      : 'inventory';

  const [activeTab, setActiveTab] = useState<'inventory' | 'handover' | 'reports'>(initialTab);

  // Inventory State
  const [inventoryItems, setInventoryItems] = useState<CustodyItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);

  // Submitted report review queue
  const [reviewReports, setReviewReports] = useState<SecurityReviewReport[]>([]);
  const [reviewSearchQuery, setReviewSearchQuery] = useState('');
  const [appliedReviewSearch, setAppliedReviewSearch] = useState('');
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotalPages, setReviewTotalPages] = useState(1);
  const [reviewTotalItems, setReviewTotalItems] = useState(0);
  const [isLoadingReviewReports, setIsLoadingReviewReports] = useState(true);
  const [reviewReportsError, setReviewReportsError] = useState<string | null>(null);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);

  // Custody Transfer Modal State
  const [transferModal, setTransferModal] = useState<{
    isOpen: boolean;
    item: CustodyItem | null;
  }>({ isOpen: false, item: null });
  const [toLocationInput, setToLocationInput] = useState('Uni-Mall Security Post - Ground Floor');
  const [lockerInput, setLockerInput] = useState('');
  const [actionInput, setActionInput] = useState('TRANSFERRED_DESK');
  const [remarksInput, setRemarksInput] = useState('');
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Custody Timeline History Modal State
  const [timelineModal, setTimelineModal] = useState<{
    isOpen: boolean;
    item: CustodyItem | null;
    history: Array<{
      id?: string;
      _id?: string;
      action: string;
      fromLocation?: string;
      toLocation: string;
      lockerReference?: string;
      handledBy?: { fullName?: string };
      remarks?: string;
      timestamp: string;
    }>;
    isLoading: boolean;
  }>({ isOpen: false, item: null, history: [], isLoading: false });

  // Handover Terminal State
  const [pendingHandovers, setPendingHandovers] = useState<PendingHandover[]>([]);
  const [isLoadingHandovers, setIsLoadingHandovers] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [deskLocation, setDeskLocation] = useState('Uni-Mall Security Post - Ground Floor');
  const [idTypeInput, setIdTypeInput] = useState('LPU_STUDENT_ID');
  const [idNumberInput, setIdNumberInput] = useState('');
  const [acknowledgementNotes, setAcknowledgementNotes] = useState('');
  const [idVerifiedCheck, setIdVerifiedCheck] = useState(false);
  const [isExecutingHandover, setIsExecutingHandover] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<HandoverReceipt | null>(null);

  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [handoversRefreshKey, setHandoversRefreshKey] = useState(0);

  // Fetch Inventory Items
  useEffect(() => {
    let isSubscribed = true;
    async function loadInventory() {
      try {
        const res = await apiClient.getCustodyInventory({
          search: searchQuery.trim() || undefined,
        });
        if (!isSubscribed) return;

        if (res?.items && Array.isArray(res.items)) {
          setInventoryItems(
            res.items.map((i) => ({
              id: i._id || i.id,
              referenceNumber: i.referenceNumber,
              title: i.title,
              category: i.category,
              specificLocation: i.specificLocation,
              currentCustodyDesk: i.currentCustodyDesk,
              lockerStorageReference: i.lockerStorageReference,
              status: i.status,
              eventDate: i.eventDate,
            }))
          );
        } else {
          setInventoryItems([]);
        }
      } catch {
        if (isSubscribed) setInventoryItems([]);
      } finally {
        if (isSubscribed) setIsLoadingInventory(false);
      }
    }
    loadInventory();
    return () => {
      isSubscribed = false;
    };
  }, [searchQuery, inventoryRefreshKey]);

  // Fetch submitted reports only while the review queue tab is open.
  useEffect(() => {
    if (activeTab !== 'reports') return;

    let isSubscribed = true;
    async function loadReviewReports() {
      try {
        const result = await apiClient.getSecuritySubmittedReports({
          search: appliedReviewSearch || undefined,
          page: reviewPage,
          limit: 20,
        });
        if (!isSubscribed) return;
        setReviewReports(Array.isArray(result?.items) ? result.items : []);
        setReviewTotalPages(result?.pagination?.totalPages || 1);
        setReviewTotalItems(result?.pagination?.totalItems || 0);
      } catch (err) {
        if (!isSubscribed) return;
        setReviewReports([]);
        setReviewTotalPages(1);
        setReviewTotalItems(0);
        setReviewReportsError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to retrieve reports awaiting security review.'
        );
      } finally {
        if (isSubscribed) setIsLoadingReviewReports(false);
      }
    }

    loadReviewReports();
    return () => {
      isSubscribed = false;
    };
  }, [activeTab, appliedReviewSearch, reviewPage, reviewRefreshKey]);

  // Fetch Pending Handovers
  useEffect(() => {
    if (activeTab !== 'handover') return;
    let isSubscribed = true;
    async function loadHandovers() {
      try {
        const list = await apiClient.getPendingHandovers();
        if (!isSubscribed) return;

        if (Array.isArray(list)) {
          setPendingHandovers(list);
          const availableClaimIds = list
            .map((handover) => handover?.claim?._id || handover?.claim?.id)
            .filter(Boolean);
          setSelectedClaimId((current) =>
            availableClaimIds.includes(current) ? current : (availableClaimIds[0] || '')
          );
        } else {
          setPendingHandovers([]);
          setSelectedClaimId('');
        }
      } catch {
        if (isSubscribed) {
          setPendingHandovers([]);
          setSelectedClaimId('');
        }
      } finally {
        if (isSubscribed) setIsLoadingHandovers(false);
      }
    }
    loadHandovers();
    return () => {
      isSubscribed = false;
    };
  }, [activeTab, handoversRefreshKey]);

  // Handle Custody Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModal.item) return;

    setIsSubmittingTransfer(true);
    setTransferError(null);

    try {
      await apiClient.transferCustody({
        itemId: transferModal.item.id,
        toLocation: toLocationInput.trim(),
        lockerReference: lockerInput.trim() || undefined,
        action: actionInput,
        remarks: remarksInput.trim() || undefined,
      });

      // Update locally
      setInventoryItems((prev) =>
        prev.map((i) =>
          i.id === transferModal.item?.id
            ? {
                ...i,
                currentCustodyDesk: toLocationInput.trim(),
                lockerStorageReference: lockerInput.trim() || i.lockerStorageReference,
              }
            : i
        )
      );

      setTransferModal({ isOpen: false, item: null });
      setRemarksInput('');
      setLockerInput('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setTransferError(err.message);
      } else {
        setTransferError('Failed to record custody transfer.');
      }
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // View Custody Timeline History
  const handleOpenTimeline = async (item: CustodyItem) => {
    setTimelineModal({
      isOpen: true,
      item,
      history: [],
      isLoading: true,
    });

    try {
      const records = await apiClient.getItemCustodyHistory(item.id);
      setTimelineModal((prev) => ({
        ...prev,
        history: Array.isArray(records) ? records : [],
        isLoading: false,
      }));
    } catch {
      setTimelineModal((prev) => ({
        ...prev,
        history: [],
        isLoading: false,
      }));
    }
  };

  // Execute Handover
  const handleExecuteHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaimId || !otpInput.trim() || !idNumberInput.trim()) {
      return;
    }

    if (!idVerifiedCheck) {
      setHandoverError('Physical ID Inspection is mandatory before releasing property.');
      return;
    }

    setIsExecutingHandover(true);
    setHandoverError(null);

    try {
      const res = await apiClient.verifyAndCompleteHandover({
        claimId: selectedClaimId,
        otp: otpInput.trim(),
        physicalDeskLocation: deskLocation.trim(),
        idCardPresentedType: idTypeInput,
        idCardNumber: idNumberInput.trim(),
        acknowledgementNotes: acknowledgementNotes.trim() || undefined,
      });

      setReceipt(res);
      setOtpInput('');
      setIdNumberInput('');
      setAcknowledgementNotes('');
      setIdVerifiedCheck(false);

      // Refresh queues
      setHandoversRefreshKey((k) => k + 1);
      setInventoryRefreshKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setHandoverError(err.message);
      } else {
        setHandoverError('Handover authentication failed. Check the OTP and try again.');
      }
    } finally {
      setIsExecutingHandover(false);
    }
  };

  const handleReviewSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingReviewReports(true);
    setReviewReportsError(null);
    setReviewPage(1);
    setAppliedReviewSearch(reviewSearchQuery.trim());
    setReviewRefreshKey((current) => current + 1);
  };

  const refreshReviewReports = () => {
    setIsLoadingReviewReports(true);
    setReviewReportsError(null);
    setReviewRefreshKey((current) => current + 1);
  };

  return (
    <DashboardLayout
      title="Custody Ledger & Supervised Handover Terminal"
      subtitle="Track physical item custody, manage storage lockers, and authenticate 6-digit handover OTPs."
      role="SECURITY_PERSONNEL"
    >
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-bold transition-colors ${
            activeTab === 'inventory'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Lock className="h-4 w-4" />
          <span>Custody Inventory &amp; Lockers</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (activeTab === 'reports') {
              refreshReviewReports();
              return;
            }
            setIsLoadingReviewReports(true);
            setReviewReportsError(null);
            setActiveTab('reports');
          }}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-bold transition-colors ${
            activeTab === 'reports'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Submitted Reports</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('handover')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-bold transition-colors ${
            activeTab === 'handover'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>Supervised Handover Terminal (OTP)</span>
        </button>
      </div>

      {/* TAB 1: CUSTODY INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference, title, locker, or desk..."
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInventoryRefreshKey((k) => k + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingInventory ? 'animate-spin' : ''}`} />
                <span>Refresh Inventory</span>
              </button>
            </div>
          </div>

          {/* Inventory Table */}
          {isLoadingInventory ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <LoadingState message="Loading campus custody inventory..." />
            </div>
          ) : inventoryItems.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3.5">Item Reference &amp; Title</th>
                      <th className="px-4 py-3.5">Current Custody Desk</th>
                      <th className="px-4 py-3.5">Locker Storage</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Incident Date</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                    {inventoryItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <span className="font-mono text-[10px] font-bold text-slate-500 block">
                            {item.referenceNumber}
                          </span>
                          <span className="font-bold text-slate-900 text-xs block mt-0.5">
                            {item.title}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Found: {item.specificLocation}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-medium text-slate-800">
                          {item.currentCustodyDesk || 'Central Security Post'}
                        </td>
                        <td className="px-4 py-4">
                          {item.lockerStorageReference ? (
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-[10px]">
                              <Lock className="h-3 w-3" />
                              <span>{item.lockerStorageReference}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={item.status as never} />
                        </td>
                        <td className="px-4 py-4 text-slate-500 text-[11px]">
                          {formatDisplayDate(item.eventDate)}
                        </td>
                        <td className="px-5 py-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTransferModal({ isOpen: true, item });
                              setToLocationInput(item.currentCustodyDesk || 'Uni-Mall Security Post - Ground Floor');
                              setLockerInput(item.lockerStorageReference || '');
                              setTransferError(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            <span>Transfer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenTimeline(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <History className="h-3 w-3" />
                            <span>Timeline</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No items in custody"
              description="No physical properties matching the current criteria were found in custody."
            />
          )}
        </div>
      )}

      {/* TAB 2: SUBMITTED REPORT REVIEW */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#283442]">New Reports Awaiting Security Review</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Student and staff reports remain in their submitted status until reviewed through existing security workflows.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshReviewReports}
                className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:self-auto"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingReviewReports ? 'animate-spin' : ''}`} />
                <span>Refresh Reports</span>
              </button>
            </div>

            <form onSubmit={handleReviewSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={reviewSearchQuery}
                  onChange={(e) => setReviewSearchQuery(e.target.value)}
                  placeholder="Search reference, title, or description..."
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Search Reports
              </button>
            </form>
          </div>

          {reviewReportsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{reviewReportsError}</span>
            </div>
          )}

          {isLoadingReviewReports ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <LoadingState message="Loading reports awaiting security review..." />
            </div>
          ) : reviewReports.length > 0 ? (
            <div className="space-y-3">
              <p className="px-1 text-xs text-slate-500">
                {reviewTotalItems} report{reviewTotalItems === 1 ? '' : 's'} awaiting review
              </p>
              {reviewReports.map((report) => (
                <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    {report.primaryImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={report.primaryImageUrl}
                        alt={`${report.title} report`}
                        className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                        <PackageCheck className="h-6 w-6" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          {report.referenceNumber}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          report.itemType === 'LOST'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-orange-50 text-orange-700'
                        }`}>
                          {report.itemType}
                        </span>
                        <StatusBadge status={report.status} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{report.title}</h3>
                      <p className="text-xs leading-relaxed text-slate-600">{report.publicDescription}</p>
                      <p className="text-[11px] text-slate-500">
                        {report.category.name} · {report.location.name} · {report.specificLocation}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Reported by {report.reporter.fullName} ({report.reporter.registrationNumber}) · {report.reporter.userType}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Reported {formatDisplayDateTime(report.createdAt)} · Incident {formatDisplayDate(report.eventDate)}
                      </p>
                    </div>

                    <Link
                      href={`/items/${report.id}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open Report
                    </Link>
                  </div>
                </article>
              ))}

              {reviewTotalPages > 1 && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    disabled={reviewPage <= 1 || isLoadingReviewReports}
                    onClick={() => {
                      setIsLoadingReviewReports(true);
                      setReviewPage((current) => Math.max(1, current - 1));
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-500">Page {reviewPage} of {reviewTotalPages}</span>
                  <button
                    type="button"
                    disabled={reviewPage >= reviewTotalPages || isLoadingReviewReports}
                    onClick={() => {
                      setIsLoadingReviewReports(true);
                      setReviewPage((current) => Math.min(reviewTotalPages, current + 1));
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="No reports awaiting review"
              description="New student and staff lost or found reports will appear here while they are in an active submitted state."
            />
          )}
        </div>
      )}

      {/* TAB 3: HANDOVER TERMINAL */}
      {activeTab === 'handover' && (
        <div className="space-y-6">
          {/* Handover Receipt Card (Shown on Successful Handover) */}
          {receipt && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-6 shadow-sm space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-emerald-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Official Supervised Release Confirmation
                    </span>
                    <h3 className="text-base font-extrabold text-emerald-950">
                      Handover Complete • Property Sealed &amp; Returned
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-50 self-start sm:self-auto"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Receipt Voucher</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Item Reference</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">{receipt.referenceNumber}</p>
                  <p className="font-medium text-slate-700 text-[11px] truncate">{receipt.itemTitle}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Verified Recipient</span>
                  <p className="font-bold text-slate-900 mt-0.5">{receipt.recipientName}</p>
                  <p className="font-mono text-slate-600 text-[11px]">Reg: {receipt.recipientRegNo}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Desk &amp; Masked ID</span>
                  <p className="font-medium text-slate-900 mt-0.5">{receipt.physicalDeskLocation}</p>
                  <p className="font-mono text-emerald-700 text-[11px] font-semibold">
                    {receipt.idCardPresentedType}: {receipt.idCardNumberMasked}
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-emerald-900 flex items-center justify-between">
                <span>Timestamp: {formatDisplayDateTime(receipt.completedAt)}</span>
                <span className="font-semibold text-emerald-800">Item Status: HANDED_OVER</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <KeyRound className="h-5 w-5 text-emerald-700" />
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                      Supervised Handover Verification Terminal
                    </h3>
                    <p className="text-xs text-slate-500">Authenticate claimant OTP and execute property transfer.</p>
                  </div>
                </div>

                {handoverError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                    <span>{handoverError}</span>
                  </div>
                )}

                <form onSubmit={handleExecuteHandover} className="space-y-4">
                  {/* Select Claim / Item */}
                  <FormField
                    id="select-claim"
                    label="Approved Claim Awaiting Handover"
                    required
                    helperText="Select the approved claim from the campus security adjudication list"
                  >
                    <select
                      id="select-claim"
                      value={selectedClaimId}
                      onChange={(e) => setSelectedClaimId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                      required
                    >
                      {pendingHandovers.length > 0 ? (
                        pendingHandovers.map((h) => (
                          <option key={h.claim._id} value={h.claim._id}>
                            {h.item.referenceNumber} • {h.item.title} — Claimant: {h.claim.claimant?.fullName || 'Student'} ({h.claim.claimant?.registrationNumber || 'N/A'})
                          </option>
                        ))
                      ) : (
                        <option value="">No approved claims awaiting handover</option>
                      )}
                    </select>
                  </FormField>

                  {/* 6-Digit OTP Input & Desk Location */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      id="handover-otp"
                      label="6-Digit Handover OTP"
                      required
                      helperText="Ask claimant for the code shown in their My Claims pass"
                    >
                      <input
                        id="handover-otp"
                        type="text"
                        maxLength={6}
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        placeholder="e.g. 524190"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-lg font-bold tracking-widest text-slate-900 focus:border-red-600 focus:outline-none"
                        required
                      />
                    </FormField>

                    <FormField
                      id="desk-location"
                      label="Current Physical Custody Desk"
                      required
                      helperText="Security post where physical item is being surrendered"
                    >
                      <input
                        id="desk-location"
                        type="text"
                        value={deskLocation}
                        onChange={(e) => setDeskLocation(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                        required
                      />
                    </FormField>
                  </div>

                  {/* Physical ID Inspection Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      id="id-type"
                      label="Claimant Identity Document"
                      required
                      helperText="Physically inspected university credential"
                    >
                      <select
                        id="id-type"
                        value={idTypeInput}
                        onChange={(e) => setIdTypeInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                        required
                      >
                        <option value="LPU_STUDENT_ID">LPU Student ID Card</option>
                        <option value="LPU_FACULTY_ID">LPU Faculty / Staff ID Card</option>
                        <option value="GOVT_AADHAAR">Government Photo ID (Aadhaar / Voter ID)</option>
                        <option value="DRIVING_LICENSE">Driving License</option>
                      </select>
                    </FormField>

                    <FormField
                      id="id-number"
                      label="ID Document Number"
                      required
                      helperText="Will be masked on server (e.g. 12****8899)"
                    >
                      <input
                        id="id-number"
                        type="text"
                        value={idNumberInput}
                        onChange={(e) => setIdNumberInput(e.target.value)}
                        placeholder="e.g. 12108899"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                        required
                      />
                    </FormField>
                  </div>

                  {/* Notes */}
                  <FormField
                    id="ack-notes"
                    label="Officer Observation / Claimant Signoff Notes"
                    helperText="Record property condition confirmation or claimant remarks"
                  >
                    <textarea
                      id="ack-notes"
                      rows={2}
                      value={acknowledgementNotes}
                      onChange={(e) => setAcknowledgementNotes(e.target.value)}
                      placeholder="Claimant checked contents, confirmed full working order, and signed physical voucher..."
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                    />
                  </FormField>

                  {/* Physical Verification Checkbox */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs">
                    <label className="flex items-start gap-2.5 cursor-pointer text-amber-950 font-medium">
                      <input
                        type="checkbox"
                        checked={idVerifiedCheck}
                        onChange={(e) => setIdVerifiedCheck(e.target.checked)}
                        className="rounded border-amber-400 text-emerald-600 focus:ring-emerald-500 mt-0.5"
                      />
                      <span className="leading-relaxed">
                        <strong>Mandatory Officer Certification:</strong> I hereby certify that the claimant has presented a physical identity card matching their university profile, verified the property condition, and accepted delivery.
                      </span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isExecutingHandover || !selectedClaimId}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors disabled:opacity-60"
                    >
                      {isExecutingHandover ? (
                        <span>Validating OTP &amp; Releasing...</span>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          <span>Confirm &amp; Execute Supervised Handover</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right Col: Active Approved Claims Sidebar */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Awaiting Handover Queue
                  </span>
                  <PackageCheck className="h-4 w-4 text-emerald-700" />
                </div>

                <div className="space-y-2 text-xs">
                  {isLoadingHandovers ? (
                    <p className="text-slate-500 py-4 text-center">Loading pending claims...</p>
                  ) : pendingHandovers.length > 0 ? (
                    pendingHandovers.map((h) => (
                      <div
                        key={h.claim._id}
                        onClick={() => setSelectedClaimId(h.claim._id)}
                        className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                          selectedClaimId === h.claim._id
                            ? 'border-emerald-500 bg-emerald-50/50'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold text-slate-600">
                            {h.item.referenceNumber}
                          </span>
                          <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 text-[9px]">
                            APPROVED
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 text-xs mt-1 truncate">{h.item.title}</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Claimant: {h.claim.claimant?.fullName || 'Student'} ({h.claim.claimant?.registrationNumber || 'N/A'})
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic py-4 text-center text-xs">
                      No approved claims currently awaiting collection.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custody Transfer Modal */}
      {transferModal.isOpen && transferModal.item && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setTransferModal({ isOpen: false, item: null })} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 space-y-4">
            <button
              type="button"
              onClick={() => setTransferModal({ isOpen: false, item: null })}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-red-700" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">Physical Custody Movement</span>
                <h3 className="text-base font-bold text-slate-900">{transferModal.item.title}</h3>
                <p className="font-mono text-xs text-slate-500">{transferModal.item.referenceNumber}</p>
              </div>
            </div>

            {transferError && (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
                {transferError}
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-3 text-xs">
              <FormField id="to-desk" label="Destination Custody Desk / Station" required>
                <select
                  id="to-desk"
                  value={toLocationInput}
                  onChange={(e) => setToLocationInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-red-600 focus:outline-none"
                >
                  <option value="Uni-Mall Security Post - Ground Floor">Uni-Mall Security Post - Ground Floor</option>
                  <option value="Gate 1 Main Control Desk">Gate 1 Main Control Desk</option>
                  <option value="Central Library Security Desk">Central Library Security Desk</option>
                  <option value="Main Security Vault - Block 30">Main Security Vault - Block 30</option>
                  <option value="Boys Hostel Security Desk">Boys Hostel Security Desk</option>
                  <option value="Girls Hostel Security Desk">Girls Hostel Security Desk</option>
                  <option value="Indoor Stadium Security Post">Indoor Stadium Security Post</option>
                </select>
              </FormField>

              <FormField id="locker-ref" label="Locker Storage Reference" helperText="E.g. LOCKER-U14, SAFE-2B">
                <input
                  id="locker-ref"
                  type="text"
                  value={lockerInput}
                  onChange={(e) => setLockerInput(e.target.value)}
                  placeholder="LOCKER-B12"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </FormField>

              <FormField id="custody-action" label="Movement Action Type" required>
                <select
                  id="custody-action"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-red-600 focus:outline-none"
                >
                  <option value="TRANSFERRED_DESK">Transferred Desk</option>
                  <option value="STORED_IN_LOCKER">Stored in Locker</option>
                  <option value="INITIAL_INTAKE">Initial Intake Check-in</option>
                  <option value="INSPECTION">Inspection / Inventory Audit</option>
                </select>
              </FormField>

              <FormField id="remarks" label="Remarks / Condition Notes">
                <textarea
                  id="remarks"
                  rows={2}
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  placeholder="Transferred to central vault for weekend secure storage..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </FormField>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferModal({ isOpen: false, item: null })}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransfer}
                  className="rounded-lg bg-red-700 px-5 py-2 font-bold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {isSubmittingTransfer ? 'Recording...' : 'Record Custody Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custody Timeline Modal */}
      {timelineModal.isOpen && timelineModal.item && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setTimelineModal({ isOpen: false, item: null, history: [], isLoading: false })} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 space-y-4 max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setTimelineModal({ isOpen: false, item: null, history: [], isLoading: false })}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-700" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Append-Only Ledger</span>
                <h3 className="text-base font-bold text-slate-900">{timelineModal.item.title}</h3>
                <p className="font-mono text-xs text-slate-500">Ref: {timelineModal.item.referenceNumber}</p>
              </div>
            </div>

            {timelineModal.isLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Loading custody history...
              </div>
            ) : timelineModal.history.length > 0 ? (
              <div className="divide-y divide-slate-100 mt-2">
                {timelineModal.history.map((rec, idx) => (
                  <div key={rec._id || rec.id || idx} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {rec.action.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDisplayDateTime(rec.timestamp)}
                      </span>
                    </div>

                    <p className="font-medium text-slate-800">
                      {rec.fromLocation ? `From: ${rec.fromLocation} → ` : ''}Location: {rec.toLocation}
                      {rec.lockerReference ? ` (Locker: ${rec.lockerReference})` : ''}
                    </p>

                    {rec.remarks && (
                      <p className="text-slate-500 text-[11px] italic">
                        &quot;{rec.remarks}&quot;
                      </p>
                    )}

                    <div className="text-[10px] text-slate-400 pt-0.5">
                      Officer: {rec.handledBy?.fullName || 'Campus Security'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">
                Initial intake recorded. No subsequent movements logged yet.
              </p>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTimelineModal({ isOpen: false, item: null, history: [], isLoading: false })}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function SecurityCustodyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Custody Desk...</div>}>
      <SecurityCustodyContent />
    </Suspense>
  );
}
