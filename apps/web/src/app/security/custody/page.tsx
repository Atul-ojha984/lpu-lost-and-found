'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
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
import { DirectRecoveryPanel } from '@/components/security/DirectRecoveryPanel';
import { apiClient, ApiClientError, type CustodyLocationRecord, type SecurityReviewReport } from '@/lib/api-client';
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
  primaryImageUrl?: string;
}

interface LockerOption {
  id: string;
  lockerNumber: string;
  location: string;
  locationId: string;
  locationActive: boolean;
  is_active: boolean;
  currentItemId: string | null;
  currentItemTitle: string | null;
  occupied: boolean;
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

function escapeSlipText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function printableSlipHtml(data: Record<string, unknown>): string {
  const student = (data.student || {}) as Record<string, unknown>;
  const item = (data.item || {}) as Record<string, unknown>;
  const approval = (data.approval || {}) as Record<string, unknown>;
  const officer = (data.handoverOfficer || {}) as Record<string, unknown>;
  const imageUrl = String(item.imageUrl || '');
  const safeImageUrl = /^(https?:\/\/|\/(?!\/))/.test(imageUrl) ? escapeSlipText(imageUrl) : '';
  const image = safeImageUrl ? `<img class="item-photo" src="${safeImageUrl}" alt="Recovered item" />` : '';
  const when = (value: unknown) => value ? escapeSlipText(new Date(String(value)).toLocaleString('en-IN')) : 'Not recorded';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Handover Receipt ${escapeSlipText(data.handoverReference)}</title>
  <style>
  @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px/1.45 Arial,sans-serif;color:#17243b;margin:0}.sheet{max-width:180mm;margin:0 auto}.head{text-align:center;border-bottom:2px solid #f58220;padding:0 0 12px}.head h1{font-size:18px;margin:0 0 3px}.head p{margin:2px 0;color:#526174}.reference{display:flex;justify-content:space-between;margin:14px 0;padding:9px 12px;background:#f5f7fa;border:1px solid #d9e0e8;border-radius:5px;font-weight:bold}.section{margin:12px 0;border:1px solid #d9e0e8;border-radius:5px;overflow:hidden;break-inside:avoid}.section h2{margin:0;padding:7px 10px;background:#f5f7fa;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;padding:10px}.field label{display:block;color:#68778b;font-size:10px;text-transform:uppercase}.field strong{font-size:12px}.item{display:flex;gap:14px;padding:10px}.item-photo{width:110px;height:100px;object-fit:contain;border:1px solid #d9e0e8;border-radius:4px}.description{white-space:pre-wrap}.ack{display:grid;grid-template-columns:1fr 1fr;gap:28px;padding:22px 12px 12px}.signature{border-top:1px solid #425166;padding-top:5px;text-align:center;color:#526174}.note{font-size:10px;color:#69788b;text-align:center;margin-top:12px}.print-btn{display:block;margin:18px auto;padding:9px 16px;border:0;border-radius:5px;background:#a71930;color:#fff;font-weight:bold}@media print{.print-btn{display:none}.section,.reference,.head{break-inside:avoid}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><main class="sheet">
  <header class="head"><h1>Lovely Professional University</h1><p>Lost &amp; Found Management System</p><p><strong>Handover Receipt / Property Release Slip</strong></p></header>
  <div class="reference"><span>Handover: ${escapeSlipText(data.handoverReference)}</span><span>${when(data.handoverDate)}</span></div>
  <section class="section"><h2>Student Details</h2><div class="grid"><div class="field"><label>Full name</label><strong>${escapeSlipText(student.fullName)}</strong></div><div class="field"><label>Registration / Student ID</label><strong>${escapeSlipText(student.registrationNumber)}</strong></div><div class="field"><label>Department / Course</label><strong>${escapeSlipText(student.department || 'Not provided')}</strong></div><div class="field"><label>Registered mobile</label><strong>${escapeSlipText(student.mobile || 'Not provided')}</strong></div></div></section>
  <section class="section"><h2>Item Details</h2><div class="item">${image}<div class="grid" style="flex:1;padding:0"><div class="field"><label>Item</label><strong>${escapeSlipText(item.title)}</strong></div><div class="field"><label>Category</label><strong>${escapeSlipText(item.category)}</strong></div><div class="field"><label>Item ID</label><strong>${escapeSlipText(item.id)}</strong></div><div class="field"><label>Lost / found report reference</label><strong>${escapeSlipText(item.reportReference)}</strong></div><div class="field description" style="grid-column:1/-1"><label>Description</label><strong>${escapeSlipText(item.description)}</strong></div></div></div></section>
  <section class="section"><h2>Security Approval &amp; Release</h2><div class="grid"><div class="field"><label>Claim reference</label><strong>${escapeSlipText(data.claimReference)}</strong></div><div class="field"><label>Locker immediately before release</label><strong>${escapeSlipText(data.lockerNumber || 'Not assigned')}</strong></div><div class="field"><label>Approved by</label><strong>${escapeSlipText(approval.officerName)}</strong></div><div class="field"><label>Approval date</label><strong>${when(approval.approvedAt)}</strong></div><div class="field"><label>Physical handover by</label><strong>${escapeSlipText(officer.fullName)}</strong></div><div class="field"><label>Security office</label><strong>${escapeSlipText(data.securityOffice)}</strong></div><div class="field"><label>Completion status</label><strong>OTP verified · Physical handover completed</strong></div><div class="field"><label>Identity checked</label><strong>${escapeSlipText(data.idCardPresentedType)} (${escapeSlipText(data.idCardNumberMasked)})</strong></div></div></section>
  <section class="section"><h2>Acknowledgement</h2><div class="ack"><div class="signature">Student acknowledgement / signature</div><div class="signature">Security officer acknowledgement / signature</div></div><div class="grid"><div class="field"><label>Handover reference</label><strong>${escapeSlipText(data.handoverReference)}</strong></div><div class="field"><label>Notes</label><strong>${escapeSlipText(data.acknowledgementNotes || '—')}</strong></div></div></section>
  <p class="note">This receipt confirms the supervised release recorded by campus security. It does not contain the handover OTP.</p><button class="print-btn" onclick="window.print()">Print Handover Slip</button></main><script>window.addEventListener('load',()=>window.print(),{once:true})</script></body></html>`;
}

function SecurityCustodyContent() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab === 'direct'
    ? 'direct'
    : requestedTab === 'handover'
    ? 'handover'
    : requestedTab === 'reports'
      ? 'reports'
      : 'inventory';

  const [activeTab, setActiveTab] = useState<'inventory' | 'handover' | 'reports' | 'direct'>(initialTab);

  // Inventory State
  const [inventoryItems, setInventoryItems] = useState<CustodyItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [lockers, setLockers] = useState<LockerOption[]>([]);
  const [custodyLocations, setCustodyLocations] = useState<CustodyLocationRecord[]>([]);
  const [locationSyncError, setLocationSyncError] = useState<string | null>(null);
  const [lockerError, setLockerError] = useState<string | null>(null);
  const [lockerAssignmentItem, setLockerAssignmentItem] = useState<CustodyItem | null>(null);
  const [selectedLockerId, setSelectedLockerId] = useState('');
  const [lockerReason, setLockerReason] = useState('');
  const [isAssigningLocker, setIsAssigningLocker] = useState(false);

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
  const [transferLocationId, setTransferLocationId] = useState('');
  const [transferLockerId, setTransferLockerId] = useState('');
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
      previousLockerReference?: string;
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
  const [handoverLocationId, setHandoverLocationId] = useState('');
  const [idTypeInput, setIdTypeInput] = useState('LPU_STUDENT_ID');
  const [idNumberInput, setIdNumberInput] = useState('');
  const [acknowledgementNotes, setAcknowledgementNotes] = useState('');
  const [idVerifiedCheck, setIdVerifiedCheck] = useState(false);
  const [isExecutingHandover, setIsExecutingHandover] = useState(false);
  const [isPrintingSlip, setIsPrintingSlip] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<HandoverReceipt | null>(null);

  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [handoversRefreshKey, setHandoversRefreshKey] = useState(0);
  const custodyConfigSignature = useRef('');

  const activeCustodyLocations = custodyLocations.filter((location) => location.isActive);
  const transferLocation = activeCustodyLocations.find((location) => location.id === transferLocationId)
    || activeCustodyLocations.find((location) => location.name.toLowerCase() === (transferModal.item?.currentCustodyDesk || '').toLowerCase())
    || activeCustodyLocations[0];
  const selectedTransferLocationId = transferLocation?.id || '';
  const handoverLocation = activeCustodyLocations.find((location) => location.id === handoverLocationId) || activeCustodyLocations[0];
  const selectedHandoverLocationId = handoverLocation?.id || '';
  const availableTransferLockers = lockers.filter((locker) =>
    locker.is_active && locker.locationActive && locker.locationId === selectedTransferLocationId &&
    (!locker.occupied || locker.currentItemId === transferModal.item?.id),
  );

  useEffect(() => {
    let isSubscribed = true;
    let refreshInProgress = false;
    const refreshCustodyConfiguration = async () => {
      if (refreshInProgress) return;
      refreshInProgress = true;
      try {
        const [locationData, lockerData] = await Promise.all([
          apiClient.getCustodyLocations(),
          apiClient.getLockers(),
        ]);
        if (!isSubscribed) return;
        const signature = JSON.stringify([
          locationData.map((location) => [
            location.id, location.name, location.code, location.isActive, location.updatedAt,
            location.lockers.map((locker) => [locker.id, locker.lockerNumber, locker.is_active, locker.occupied, locker.currentItemId, locker.updatedAt]),
          ]),
          lockerData.map((locker) => [locker.id, locker.locationId, locker.locationActive, locker.is_active, locker.currentItemId, locker.updatedAt]),
        ]);
        if (custodyConfigSignature.current && custodyConfigSignature.current !== signature) {
          setInventoryRefreshKey((key) => key + 1);
        }
        custodyConfigSignature.current = signature;
        setCustodyLocations(Array.isArray(locationData) ? locationData : []);
        setLockers(Array.isArray(lockerData) ? lockerData : []);
        setLocationSyncError(null);
      } catch {
        if (isSubscribed) setLocationSyncError('Custody locations could not be refreshed. Existing assignments are preserved until the connection returns.');
      } finally {
        refreshInProgress = false;
      }
    };
    void refreshCustodyConfiguration();
    const timer = window.setInterval(() => void refreshCustodyConfiguration(), 5000);
    return () => {
      isSubscribed = false;
      window.clearInterval(timer);
    };
  }, []);

  // Fetch Inventory Items
  useEffect(() => {
    let isSubscribed = true;
    async function loadInventory() {
      try {
        const res = await apiClient.getCustodyInventory({ search: searchQuery.trim() || undefined });
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
              primaryImageUrl: i.primaryImageUrl,
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

  const handleAssignLocker = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lockerAssignmentItem) return;
    setIsAssigningLocker(true);
    setLockerError(null);
    try {
      await apiClient.assignLocker({
        itemId: lockerAssignmentItem.id,
        lockerId: selectedLockerId || null,
        reason: lockerReason.trim(),
      });
      setLockerAssignmentItem(null);
      setLockerReason('');
      setInventoryRefreshKey((key) => key + 1);
    } catch (err) {
      setLockerError(err instanceof ApiClientError ? err.message : 'Could not update this locker allocation.');
    } finally {
      setIsAssigningLocker(false);
    }
  };

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
        toLocation: transferLocation?.name,
        custodyLocationId: transferLocation?.id,
        lockerId: availableTransferLockers.some((locker) => locker.id === transferLockerId) ? transferLockerId : undefined,
        action: actionInput,
        remarks: remarksInput.trim() || undefined,
      });
      setInventoryRefreshKey((key) => key + 1);

      setTransferModal({ isOpen: false, item: null });
      setRemarksInput('');
      setTransferLockerId('');
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
        physicalDeskLocation: handoverLocation?.name || '',
        custodyLocationId: selectedHandoverLocationId,
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

  const handlePrintHandoverSlip = async (handoverId: string, isDirectRecovery = false) => {
    // Open synchronously from the click so the browser permits the print window.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setHandoverError('Allow pop-ups for this site to print the handover slip.');
      return;
    }

    setIsPrintingSlip(true);
    setHandoverError(null);
    try {
      const slip = isDirectRecovery
        ? await apiClient.getDirectRecoverySlip(handoverId)
        : await apiClient.getHandoverSlip(handoverId);
      printWindow.document.open();
      printWindow.document.write(printableSlipHtml(slip));
      printWindow.document.close();
    } catch (err) {
      printWindow.close();
      setHandoverError(err instanceof ApiClientError
        ? err.message
        : 'Unable to load the completed handover slip. Please try again.');
    } finally {
      setIsPrintingSlip(false);
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
      {locationSyncError && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{locationSyncError}</div>}
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
          onClick={() => setActiveTab('direct')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-bold transition-colors ${
            activeTab === 'direct'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PackageCheck className="h-4 w-4" />
          <span>Direct Handover</span>
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
              <span className="hidden text-[11px] text-slate-500 md:inline">Locker settings are managed by administrators.</span>
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
                          <div className="mb-2 flex items-center gap-2">
                            {item.primaryImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.primaryImageUrl} alt={item.title} className="h-10 w-10 rounded-md border border-slate-200 object-cover" />
                            ) : null}
                            <span className="min-w-0">
                          <span className="font-mono text-[10px] font-bold text-slate-500 block">
                            {item.referenceNumber}
                          </span>
                          <span className="font-bold text-slate-900 text-xs block mt-0.5">
                            {item.title}
                          </span>
                          <span className="font-mono text-[9px] text-slate-400 block mt-0.5">ID: {item.id}</span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            {typeof item.category === 'string' ? item.category : item.category?.name || item.category?.code || 'Uncategorized'}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Found: {item.specificLocation}
                          </span>
                            </span>
                          </div>
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
                              setLockerAssignmentItem(item);
                              const assigned = lockers.find((locker) => locker.lockerNumber === item.lockerStorageReference);
                              setSelectedLockerId(assigned?.id || '');
                              setLockerReason('');
                              setLockerError(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                          >
                            <Lock className="h-3 w-3" />
                            <span>Locker</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTransferModal({ isOpen: true, item });
                              const currentLocation = activeCustodyLocations.find((location) =>
                                location.name.toLowerCase() === (item.currentCustodyDesk || '').toLowerCase(),
                              ) || activeCustodyLocations[0];
                              setTransferLocationId(currentLocation?.id || '');
                              const assignedLocker = lockers.find((locker) =>
                                locker.lockerNumber === item.lockerStorageReference && locker.locationId === currentLocation?.id,
                              );
                              setTransferLockerId(assignedLocker?.id || '');
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
      {activeTab === 'direct' && (
        <DirectRecoveryPanel
          onPrintSlip={(directRecoveryId) => void handlePrintHandoverSlip(directRecoveryId, true)}
          isPrintingSlip={isPrintingSlip}
          printError={handoverError}
          custodyLocations={custodyLocations}
        />
      )}

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
                  onClick={() => handlePrintHandoverSlip(receipt.handoverId)}
                  disabled={isPrintingSlip}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-50 self-start sm:self-auto"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>{isPrintingSlip ? 'Loading Slip…' : 'Print Handover Slip'}</span>
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
                      <select
                        id="desk-location"
                        value={selectedHandoverLocationId}
                        onChange={(e) => setHandoverLocationId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                        required
                      >
                        <option value="">Select an active custody location</option>
                        {activeCustodyLocations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                      </select>
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
                      disabled={isExecutingHandover || !selectedClaimId || !selectedHandoverLocationId}
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

      {lockerAssignmentItem && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setLockerAssignmentItem(null)} />
          <div className="relative z-10 w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <button type="button" onClick={() => setLockerAssignmentItem(null)} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close locker allocation">
              <X className="h-5 w-5" />
            </button>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">Single-Occupancy Storage</span>
              <h3 className="text-base font-bold text-slate-900">Assign Locker</h3>
              <p className="font-mono text-xs text-slate-500">{lockerAssignmentItem.referenceNumber} · {lockerAssignmentItem.title}</p>
            </div>
            {lockerError && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{lockerError}</div>}
            <form onSubmit={handleAssignLocker} className="space-y-3">
              <FormField id="assign-locker" label="Available Locker">
                <select id="assign-locker" value={selectedLockerId} onChange={(event) => setSelectedLockerId(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-red-600 focus:outline-none">
                  <option value="">Unassigned</option>
                  {lockers.filter((locker) => locker.is_active && locker.locationActive && (!locker.occupied || locker.currentItemId === lockerAssignmentItem.id)).map((locker) => (
                    <option key={locker.id} value={locker.id}>{locker.lockerNumber} · {locker.location}</option>
                  ))}
                </select>
              </FormField>
              <FormField id="locker-reason" label="Reason / Notes">
                <textarea id="locker-reason" rows={2} maxLength={500} value={lockerReason} onChange={(event) => setLockerReason(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 focus:border-red-600 focus:outline-none" />
              </FormField>
              <p className="text-[11px] text-slate-500">Each active locker can hold one item. Every assignment or move is retained in the custody history.</p>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setLockerAssignmentItem(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isAssigningLocker} className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-60">{isAssigningLocker ? 'Saving...' : 'Save Allocation'}</button>
              </div>
            </form>
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
                  value={selectedTransferLocationId}
                  onChange={(e) => {
                    setTransferLocationId(e.target.value);
                    setTransferLockerId('');
                  }}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-red-600 focus:outline-none"
                  required
                >
                  <option value="">Select an active custody location</option>
                  {activeCustodyLocations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                </select>
              </FormField>

              <FormField id="locker-ref" label="Destination Locker" helperText="Only available lockers at the selected active location can be assigned.">
                <select
                  id="locker-ref"
                  value={transferLockerId}
                  onChange={(e) => setTransferLockerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-slate-900 focus:border-red-600 focus:outline-none"
                >
                  <option value="">No locker assignment</option>
                  {availableTransferLockers.map((locker) => <option key={locker.id} value={locker.id}>{locker.lockerNumber}</option>)}
                </select>
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
                  disabled={isSubmittingTransfer || !selectedTransferLocationId}
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
                      {rec.previousLockerReference || rec.lockerReference ? ` (Locker: ${rec.previousLockerReference || 'Unassigned'} → ${rec.lockerReference || 'Unassigned'})` : ''}
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
