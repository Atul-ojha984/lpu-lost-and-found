'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldAlert, 
  Lock, 
  Clock, 
  AlertCircle,
  X,
  Check
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { DEMO_CLAIMS } from '@/lib/mock-data';
import { formatDisplayDateTime } from '@/lib/formatters';

interface PendingClaimItem {
  id: string;
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
  challengeAnswers: Array<{
    challengeId: string;
    providedAnswer: string;
    isCorrect?: boolean;
  }>;
  verificationAttemptsCount: number;
  submittedAt: string;
}

function SecurityClaimsContent() {
  const router = useRouter();
  const [claims, setClaims] = useState<PendingClaimItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    claim: PendingClaimItem | null;
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

  const fetchPendingClaims = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const queue = await apiClient.getPendingClaimsQueue();
      if (Array.isArray(queue) && queue.length > 0) {
        setClaims(queue);
      } else {
        // If queue is empty in database, fall back to mock queue for demonstration
        setClaims(
          DEMO_CLAIMS.map((dc) => ({
            id: dc.id,
            item: {
              id: dc.itemId,
              referenceNumber: dc.itemReference,
              title: dc.itemTitle,
              publicDescription: 'Found item recorded in security registry.',
              status: 'CLAIM_IN_REVIEW',
            },
            claimant: {
              id: 'mock-user-1',
              fullName: dc.claimantName,
              registrationNumber: dc.claimantRegNo,
              email: dc.claimantEmail,
            },
            claimStatus: dc.claimStatus,
            statement: dc.statement,
            challengeAnswers: dc.challengeAnswer
              ? [{ challengeId: 'ch-1', providedAnswer: dc.challengeAnswer, isCorrect: true }]
              : [],
            verificationAttemptsCount: 1,
            submittedAt: dc.submittedAt,
          }))
        );
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to security queue. Showing demonstration queue.');
      }
      setClaims(
        DEMO_CLAIMS.map((dc) => ({
          id: dc.id,
          item: {
            id: dc.itemId,
            referenceNumber: dc.itemReference,
            title: dc.itemTitle,
            publicDescription: 'Found item recorded in security registry.',
            status: 'CLAIM_IN_REVIEW',
          },
          claimant: {
            id: 'mock-user-1',
            fullName: dc.claimantName,
            registrationNumber: dc.claimantRegNo,
            email: dc.claimantEmail,
          },
          claimStatus: dc.claimStatus,
          statement: dc.statement,
          challengeAnswers: dc.challengeAnswer
            ? [{ challengeId: 'ch-1', providedAnswer: dc.challengeAnswer, isCorrect: true }]
            : [],
          verificationAttemptsCount: 1,
          submittedAt: dc.submittedAt,
        }))
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingClaims();
  }, [fetchPendingClaims]);

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

      // Remove or update claim locally
      setClaims((prev) => prev.filter((c) => c.id !== decisionModal.claim?.id));
      setDecisionModal({ isOpen: false, claim: null, action: 'APPROVE' });
      setDecisionNotes('');
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

  return (
    <DashboardLayout
      title="Ownership Claims Adjudication Queue"
      subtitle="Verify student ownership challenges, inspect private vault records, and authorize property releases."
      role="SECURITY_PERSONNEL"
    >
      {/* Anti-Conflict / Anti-Self-Approval Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
        <div className="flex items-center gap-2 font-bold mb-1">
          <ShieldAlert className="h-4 w-4 text-amber-700" />
          <span>Security Integrity &amp; Anti-Self-Approval Enforcement:</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Officers are systematically blocked from reviewing claims submitted by their own account or on items they personally ingested. Approving a claim generates an expiring single-use handover OTP and automatically resolves competing claims on the item.
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <LoadingState message="Retrieving pending claims from campus security registry..." />
        </div>
      )}

      {/* Error Notice */}
      {!isLoading && errorMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Claims Queue */}
      {!isLoading && (
        <div className="space-y-6">
          {claims.length > 0 ? (
            claims.map((claim) => (
              <div
                key={claim.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500 font-semibold">
                        {claim.item?.referenceNumber || 'REF: UNKNOWN'}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          claim.claimStatus === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : claim.claimStatus === 'UNDER_REVIEW'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {claim.claimStatus.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {claim.item?.title || 'Unknown Campus Property'}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {claim.item?.id && (
                      <button
                        type="button"
                        onClick={() => handleInspectVault(claim.item!.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100/60 transition-colors shadow-2xs"
                      >
                        <Lock className="h-3.5 w-3.5 text-red-700" />
                        <span>Inspect Private Vault</span>
                      </button>
                    )}

                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{formatDisplayDateTime(claim.submittedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Claimant Profile Info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Claimant Student</span>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {claim.claimant?.fullName || 'Verified Student'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Registration Number</span>
                    <p className="font-mono font-semibold text-slate-900 mt-0.5">
                      {claim.claimant?.registrationNumber || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Official Contact</span>
                    <p className="text-slate-700 mt-0.5 truncate">
                      {claim.claimant?.email || 'N/A'} {claim.claimant?.phone ? `• ${claim.claimant.phone}` : ''}
                    </p>
                  </div>
                </div>

                {/* Statement of Ownership */}
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700">Student Ownership Statement:</span>
                    <p className="mt-1 rounded-lg border border-slate-200 bg-white p-3 text-slate-600 leading-relaxed">
                      &quot;{claim.statement}&quot;
                    </p>
                  </div>

                  {/* Challenge Answers Submitted */}
                  {claim.challengeAnswers && claim.challengeAnswers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
                        <Lock className="h-3.5 w-3.5 text-red-700" />
                        <span>Private Challenge Response Submitted:</span>
                      </div>
                      <div className="space-y-2">
                        {claim.challengeAnswers.map((ca, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg border p-3 font-mono text-[11px] flex items-center justify-between ${
                              ca.isCorrect
                                ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                                : 'border-amber-200 bg-amber-50/50 text-amber-950'
                            }`}
                          >
                            <span>Provided: &quot;{ca.providedAnswer}&quot;</span>
                            <span className="font-bold flex items-center gap-1">
                              {ca.isCorrect ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  <span className="text-emerald-700">HASH VERIFIED (MATCH)</span>
                                </>
                              ) : (
                                <span className="text-amber-700">MISMATCH</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Decision Action Buttons */}
                <div className="mt-4 flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setDecisionModal({ isOpen: true, claim, action: 'REJECT' });
                      setDecisionError(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors"
                  >
                    Reject Claim
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecisionModal({ isOpen: true, claim, action: 'APPROVE' });
                      setDecisionError(null);
                    }}
                    className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs"
                  >
                    Approve &amp; Generate Handover OTP
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="Claims queue is clear"
              description="There are currently no pending ownership claims awaiting security adjudication."
              actionText="Inspect Custody Desk"
              onAction={() => router.push('/security/custody')}
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
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
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
                  decisionModal.action === 'APPROVE' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'
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
