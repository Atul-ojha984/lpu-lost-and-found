'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldAlert, 
  Lock, 
  Clock, 
  AlertCircle,
  X,
  Check,
  Search,
  Filter,
  RefreshCw,
  User,
  FileText,
  Calendar,
  CheckCircle2,
  XCircle,
  PackageCheck
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { formatDisplayDateTime } from '@/lib/formatters';

interface ClaimItem {
  id: string;
  claimReference?: string;
  itemId?: string;
  itemTitle?: string;
  itemReference?: string;
  item: {
    id: string;
    referenceNumber: string;
    title: string;
    publicDescription: string;
    status: string;
    specificLocation?: string;
  } | null;
  claimant: {
    id: string;
    fullName: string;
    registrationNumber: string;
    email: string;
    department?: string;
    phone?: string;
  } | null;
  claimStatus: string;
  statement: string;
  challengeAnswers?: Array<{
    challengeId: string;
    questionText?: string;
    providedAnswer: string;
    isCorrect?: boolean;
  }>;
  verificationAttemptsCount?: number;
  reviewedBy?: {
    id: string;
    fullName: string;
    registrationNumber?: string;
  } | null;
  reviewedAt?: string | null;
  reviewNotes?: string;
  rejectionReason?: string;
  handoverStatus?: string | null;
  handoverCompletedAt?: string | null;
  handoverOtp?: string | null;
  submittedAt: string;
}

const FILTER_TABS = [
  { id: 'ALL', label: 'All Claims' },
  { id: 'SUBMITTED', label: 'Pending Claims' },
  { id: 'UNDER_REVIEW', label: 'Under Review' },
  { id: 'CHALLENGE_REQUIRED', label: 'More Info Required' },
  { id: 'APPROVED', label: 'Approved Claims' },
  { id: 'AWAITING_COLLECTION', label: 'Awaiting Collection' },
  { id: 'COMPLETED', label: 'Completed Handovers' },
  { id: 'REJECTED', label: 'Rejected Claims' },
];

function SecurityClaimsContent() {
  const router = useRouter();
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Filter & Search State
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    claim: ClaimItem | null;
    action: 'APPROVE' | 'REJECT';
  }>({ isOpen: false, claim: null, action: 'APPROVE' });
  const [decisionNotes, setDecisionNotes] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Private Vault View Modal
  const [vaultModal, setVaultModal] = useState<{
    isOpen: boolean;
    itemId: string | null;
    content: string | null;
    summary: string[];
    isLoading: boolean;
    error: string | null;
  }>({ isOpen: false, itemId: null, content: null, summary: [], isLoading: false, error: null });

  const fetchClaimsRegister = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await apiClient.getPendingClaimsQueue({
        status: activeFilter,
        search: appliedSearch,
      });
      if (Array.isArray(data)) {
        setClaims(data);
      } else {
        setClaims([]);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to retrieve claims register from campus security registry.');
      }
      setClaims([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter, appliedSearch]);

  useEffect(() => {
    fetchClaimsRegister();
  }, [fetchClaimsRegister]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(searchQuery.trim());
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setAppliedSearch('');
  };

  const handleInspectVault = async (itemId: string) => {
    setVaultModal({
      isOpen: true,
      itemId,
      content: null,
      summary: [],
      isLoading: true,
      error: null,
    });

    try {
      const res = await apiClient.viewPrivateVault(itemId);
      setVaultModal((prev) => ({
        ...prev,
        isLoading: false,
        content: res.decryptedContent,
        summary: res.fieldsSummary || [],
      }));
    } catch (err) {
      setVaultModal((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof ApiClientError ? err.message : 'Failed to decrypt private vault.',
      }));
    }
  };

  const handleDecisionSubmit = async () => {
    if (!decisionModal.claim) return;

    setIsSubmittingDecision(true);
    setDecisionError(null);

    try {
      await apiClient.reviewClaim(decisionModal.claim.id, {
        action: decisionModal.action,
        reviewNotes: decisionNotes.trim(),
        rejectionReason: decisionModal.action === 'REJECT' ? decisionNotes.trim() : undefined,
      });

      setDecisionModal({ isOpen: false, claim: null, action: 'APPROVE' });
      setDecisionNotes('');
      // Refresh real claims register
      fetchClaimsRegister();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDecisionError(err.message);
      } else {
        setDecisionError('Failed to record adjudication decision.');
      }
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const getStatusBadge = (status: string, handoverStatus?: string | null) => {
    if (status === 'COMPLETED' || handoverStatus === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-3 w-3" />
          Completed Handover
        </span>
      );
    }
    if (status === 'APPROVED' || handoverStatus === 'AWAITING_COLLECTION' || handoverStatus === 'READY_FOR_HANDOVER') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
          <PackageCheck className="h-3 w-3" />
          {handoverStatus === 'AWAITING_COLLECTION' ? 'Awaiting Collection' : 'Approved (Ready)'}
        </span>
      );
    }
    if (status === 'UNDER_REVIEW') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
          <Clock className="h-3 w-3" />
          Under Review
        </span>
      );
    }
    if (status === 'CHALLENGE_REQUIRED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
          <AlertCircle className="h-3 w-3" />
          More Info Required
        </span>
      );
    }
    if (status === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        <Clock className="h-3 w-3" />
        Pending Review
      </span>
    );
  };

  return (
    <DashboardLayout
      title="Ownership Claims Register"
      subtitle="Searchable registry for campus security officers to review, adjudicate, and audit student ownership claims."
      role="SECURITY_PERSONNEL"
    >
      {/* Anti-Conflict / Anti-Self-Approval Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-2xs">
        <div className="flex items-center gap-2 font-bold mb-1">
          <ShieldAlert className="h-4 w-4 text-amber-700" />
          <span>Security Integrity &amp; Anti-Self-Approval Enforcement:</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Officers are systematically blocked from reviewing claims submitted by their own account or on items they personally ingested. Approving a claim generates an expiring single-use handover OTP and automatically resolves competing claims on the item.
        </p>
      </div>

      {/* Search and Filters Bar */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Claim ID (CLM-...), Item Ref, Title, Claimant Name or Reg No..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#20B5AD] focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#192B4A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#203a63] transition-colors shadow-2xs"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
            </button>
            <button
              type="button"
              onClick={fetchClaimsRegister}
              disabled={isLoading}
              title="Refresh Register"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </form>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar border-t border-slate-100 pt-3">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-1" />
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  isActive
                    ? 'bg-[#192B4A] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <LoadingState message="Retrieving claims register from campus security registry..." />
        </div>
      )}

      {/* Error Notice */}
      {!isLoading && errorMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={fetchClaimsRegister}
            className="font-semibold text-amber-900 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Claims Register List */}
      {!isLoading && (
        <div className="space-y-4">
          {claims.length > 0 ? (
            claims.map((claim) => {
              const claimRef = claim.claimReference || `CLM-${claim.id.slice(0, 8).toUpperCase()}`;
              const itemRef = claim.item?.referenceNumber || claim.itemReference || 'N/A';
              const itemTitle = claim.item?.title || claim.itemTitle || 'Campus Property';
              const isActionable = ['SUBMITTED', 'UNDER_REVIEW', 'CHALLENGE_REQUIRED'].includes(claim.claimStatus);

              return (
                <div
                  key={claim.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 hover:border-slate-300 transition-colors"
                >
                  {/* Top Bar: References & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#192B4A] bg-slate-100 px-2 py-0.5 rounded-md">
                        {claimRef}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="font-mono text-xs text-slate-500 font-semibold">
                        Item: {itemRef}
                      </span>
                      {getStatusBadge(claim.claimStatus, claim.handoverStatus)}
                    </div>

                    <div className="flex items-center gap-2">
                      {(claim.item?.id || claim.itemId) && (
                        <button
                          type="button"
                          onClick={() => handleInspectVault(claim.item?.id || claim.itemId!)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100/60 transition-colors shadow-2xs"
                        >
                          <Lock className="h-3.5 w-3.5 text-red-700" />
                          <span>Inspect Vault</span>
                        </button>
                      )}

                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>{formatDisplayDateTime(claim.submittedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Item Description */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {itemTitle}
                    </h3>
                    {claim.item?.publicDescription && (
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                        {claim.item.publicDescription}
                      </p>
                    )}
                  </div>

                  {/* Claimant & Officer Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-400" /> Claimant Student
                      </span>
                      <p className="font-semibold text-slate-900 mt-0.5">
                        {claim.claimant?.fullName || 'Verified Student'}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        Reg: {claim.claimant?.registrationNumber || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                        <FileText className="h-3 w-3 text-slate-400" /> Official Contact
                      </span>
                      <p className="text-slate-700 mt-0.5 truncate font-medium">
                        {claim.claimant?.email || 'N/A'}
                      </p>
                      {claim.claimant?.phone && (
                        <p className="text-[11px] text-slate-500 font-mono">
                          Phone: {claim.claimant.phone}
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" /> Adjudication &amp; Handover
                      </span>
                      <p className="text-slate-800 mt-0.5 font-medium">
                        Officer: {claim.reviewedBy?.fullName || 'Unassigned / Pending'}
                      </p>
                      {claim.handoverCompletedAt ? (
                        <p className="text-[11px] text-emerald-700 font-medium">
                          Completed: {formatDisplayDateTime(claim.handoverCompletedAt)}
                        </p>
                      ) : claim.handoverStatus ? (
                        <p className="text-[11px] text-teal-700 font-medium">
                          Handover: {claim.handoverStatus}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Handover not completed
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Statement of Ownership */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700">Student Ownership Statement:</span>
                      <p className="mt-1 rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 leading-relaxed italic">
                        &quot;{claim.statement}&quot;
                      </p>
                    </div>

                    {/* Verification Challenges Answered */}
                    {claim.challengeAnswers && claim.challengeAnswers.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                          <Lock className="h-3.5 w-3.5 text-red-700" />
                          <span>Private Verification Challenge Response:</span>
                          {claim.verificationAttemptsCount !== undefined && (
                            <span className="text-slate-400 text-[10px] font-normal">
                              ({claim.verificationAttemptsCount} attempt{claim.verificationAttemptsCount === 1 ? '' : 's'})
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {claim.challengeAnswers.map((ca, idx) => (
                            <div
                              key={idx}
                              className={`rounded-lg border p-2.5 font-mono text-[11px] flex items-center justify-between ${
                                ca.isCorrect
                                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                                  : 'border-amber-200 bg-amber-50/50 text-amber-950'
                              }`}
                            >
                              <div className="truncate max-w-[70%]">
                                {ca.questionText && (
                                  <span className="text-slate-500 font-sans block text-[10px]">
                                    {ca.questionText}
                                  </span>
                                )}
                                <span>Provided: &quot;{ca.providedAnswer}&quot;</span>
                              </div>
                              <span className="font-bold flex items-center gap-1 shrink-0">
                                {ca.isCorrect ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    <span className="text-emerald-700 text-[10px]">HASH VERIFIED</span>
                                  </>
                                ) : (
                                  <span className="text-amber-700 text-[10px]">MISMATCH</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Review Notes or Rejection Reason if any */}
                    {(claim.reviewNotes || claim.rejectionReason) && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 text-[11px]">
                        <span className="font-semibold text-slate-700 block mb-0.5">
                          {claim.claimStatus === 'REJECTED' ? 'Rejection Reason:' : 'Adjudication Review Notes:'}
                        </span>
                        <p className="text-slate-600">
                          {claim.rejectionReason || claim.reviewNotes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Decision Action Buttons for Security */}
                  {isActionable && (
                    <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setDecisionModal({ isOpen: true, claim, action: 'REJECT' });
                          setDecisionError(null);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        Reject Claim
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDecisionModal({ isOpen: true, claim, action: 'APPROVE' });
                          setDecisionError(null);
                        }}
                        className="rounded-lg bg-[#20B5AD] hover:bg-[#1ca19a] px-4 py-1.5 text-xs font-bold text-white transition-colors shadow-2xs"
                      >
                        Approve &amp; Generate Handover OTP
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <EmptyState
              title="No ownership claims found"
              description={
                appliedSearch
                  ? `No claims matched your search query "${appliedSearch}". Try clearing filters or searching another keyword.`
                  : activeFilter !== 'ALL'
                  ? `There are currently no claims with status "${activeFilter}".`
                  : 'There are currently no ownership claims recorded in the campus security registry.'
              }
              actionText={appliedSearch || activeFilter !== 'ALL' ? 'Clear Filters' : 'Inspect Custody Desk'}
              onAction={() => {
                if (appliedSearch || activeFilter !== 'ALL') {
                  setActiveFilter('ALL');
                  setSearchQuery('');
                  setAppliedSearch('');
                } else {
                  router.push('/security/custody');
                }
              }}
            />
          )}
        </div>
      )}

      {/* Private Vault Decryption Inspection Modal */}
      {vaultModal.isOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setVaultModal((prev) => ({ ...prev, isOpen: false }))} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-red-200 z-10 animate-fade-in space-y-4">
            <button
              type="button"
              onClick={() => setVaultModal((prev) => ({ ...prev, isOpen: false }))}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-red-700" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                  AES-256-GCM Decrypted Records
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Campus Private Vault Records
                </h3>
              </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-[11px] text-red-900">
              <p>
                <strong>Security Officer Notice:</strong> Accessing this confidential record has been audited to your registration number with timestamp and IP address.
              </p>
            </div>

            {vaultModal.isLoading && (
              <div className="py-6 text-center text-xs text-slate-500">
                Decrypting private vault ciphertext with master key...
              </div>
            )}

            {!vaultModal.isLoading && vaultModal.error && (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
                {vaultModal.error}
              </div>
            )}

            {!vaultModal.isLoading && vaultModal.content && (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-700">Confidential Identifying Details:</span>
                  <div className="mt-1 rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 leading-relaxed whitespace-pre-wrap">
                    {vaultModal.content}
                  </div>
                </div>

                {vaultModal.summary.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span>Enclosed field types:</span>
                    <span className="font-semibold text-slate-700">{vaultModal.summary.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setVaultModal((prev) => ({ ...prev, isOpen: false }))}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close Vault Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Confirmation Dialog */}
      {decisionModal.isOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setDecisionModal({ ...decisionModal, isOpen: false })} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {decisionModal.action === 'APPROVE' ? 'Approve Ownership Claim?' : 'Reject Ownership Claim'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {decisionModal.action === 'APPROVE'
                ? `Authorizing this claim will cryptographically generate an expiring OTP for ${decisionModal.claim?.claimant?.fullName || 'the student'} to collect property at this post. Competing claims on this item will be automatically resolved.`
                : 'State the specific reason for rejecting this claim (e.g., failed challenge verification, missing proof).'}
            </p>

            {decisionError && (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-700" />
                <span>{decisionError}</span>
              </div>
            )}

            <textarea
              rows={3}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder={decisionModal.action === 'APPROVE' ? 'Review notes (optional)...' : 'Mandatory rejection reason...'}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#20B5AD] focus:outline-none"
              required={decisionModal.action === 'REJECT'}
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDecisionModal({ ...decisionModal, isOpen: false })}
                disabled={isSubmittingDecision}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecisionSubmit}
                disabled={isSubmittingDecision || (decisionModal.action === 'REJECT' && !decisionNotes.trim())}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs disabled:opacity-60 ${
                  decisionModal.action === 'APPROVE' ? 'bg-[#20B5AD] hover:bg-[#1ca19a]' : 'bg-rose-700 hover:bg-rose-800'
                }`}
              >
                {isSubmittingDecision
                  ? 'Authorizing...'
                  : decisionModal.action === 'APPROVE'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function SecurityClaimsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Claims Queue...</div>}>
      <SecurityClaimsContent />
    </Suspense>
  );
}
