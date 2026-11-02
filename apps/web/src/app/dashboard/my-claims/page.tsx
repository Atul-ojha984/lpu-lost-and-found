'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { 
  KeyRound, 
  Clock, 
  ShieldCheck, 
  MapPin, 
  AlertCircle, 
  CheckCircle2, 
  Lock,
  Upload,
  FileText,
  Loader2,
  Paperclip
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Claim } from '@/types';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/formatters';

function MyClaimsContent() {
  const router = useRouter();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Evidence upload state
  const [uploadingClaimId, setUploadingClaimId] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ claimId: string; isSuccess: boolean; message: string } | null>(null);

  // Verification Challenge Box State
  const [activeChallengeClaimId, setActiveChallengeClaimId] = useState<string | null>(null);
  const [challengeItemQuestions, setChallengeItemQuestions] = useState<Array<{ id: string; questionText: string; hint?: string; maxAttempts: number }>>([]);
  const [challengeAnswerInput, setChallengeAnswerInput] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState<{ isSuccess: boolean; message: string } | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isSubscribed = true;
    async function loadClaims() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawClaims: any[] = await apiClient.getMyClaims();
        if (!isSubscribed) return;

        if (Array.isArray(rawClaims)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mappedClaims: Claim[] = rawClaims.map((c: any) => ({
            id: c._id || c.id,
            itemId: c.itemId,
            itemTitle: c.itemTitle || (c.item && c.item.title) || 'Unknown Item',
            itemReference: c.itemReference || (c.item && c.item.referenceNumber) || 'REF-LPU',
            itemType: c.itemType || (c.item && c.item.itemType) || 'FOUND',
            claimantName: 'Me',
            claimantRegNo: '',
            claimantEmail: '',
            claimStatus: c.claimStatus,
            statement: c.statement,
            evidenceCount: (c.privateEvidenceProofUrls && c.privateEvidenceProofUrls.length) || c.challengeAnswersCount || 0,
            privateEvidenceProofUrls: c.privateEvidenceProofUrls || [],
            submittedAt: c.submittedAt || c.createdAt,
            handoverOtp: c.handoverOtp,
            handoverOtpExpiresAt: c.handoverOtpExpiresAt,
            reviewedBy: typeof c.reviewedBy === 'object' ? c.reviewedBy?.name : c.reviewedBy,
            reviewedAt: c.reviewedAt,
            reviewNotes: c.reviewNotes,
            rejectionReason: c.rejectionReason,
          }));
          setClaims(mappedClaims);
        } else {
          setClaims([]);
        }
      } catch (err) {
        if (!isSubscribed) return;
        if (err instanceof ApiClientError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Failed to connect to claims registry. Please try again.');
        }
        setClaims([]);
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }

    loadClaims();
    return () => {
      isSubscribed = false;
    };
  }, [refreshKey]);

  const handleFileUpload = async (claimId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be selected again if needed
    event.target.value = '';

    // Validate extension
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    if (!allowedExts.includes(ext)) {
      setUploadFeedback({
        claimId,
        isSuccess: false,
        message: 'Invalid file type. Allowed formats: PDF, JPG, PNG, WEBP (Max 5MB).',
      });
      return;
    }

    // Validate size (< 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadFeedback({
        claimId,
        isSuccess: false,
        message: 'File size exceeds maximum permitted limit (5MB). Please upload a smaller file.',
      });
      return;
    }

    setUploadingClaimId(claimId);
    setUploadFeedback(null);

    try {
      const response = await apiClient.uploadClaimEvidence(claimId, file);
      setUploadFeedback({
        claimId,
        isSuccess: true,
        message: response.message || 'Evidence document uploaded securely.',
      });
      // Refresh claims list to show updated evidence count/list
      setRefreshKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUploadFeedback({ claimId, isSuccess: false, message: err.message });
      } else {
        setUploadFeedback({ claimId, isSuccess: false, message: 'Upload failed. Allowed formats: PDF, JPG, PNG, WEBP (Max 5MB).' });
      }
    } finally {
      setUploadingClaimId(null);
    }
  };

  const handleOpenChallengeBox = async (claim: Claim) => {
    setActiveChallengeClaimId(claim.id);
    setAnswerFeedback(null);
    setChallengeAnswerInput('');

    try {
      const challenges = await apiClient.getItemChallenges(claim.itemId);
      setChallengeItemQuestions(challenges);
    } catch {
      setChallengeItemQuestions([]);
    }
  };

  const handleChallengeSubmit = async (e: React.FormEvent, claimId: string, challengeId: string) => {
    e.preventDefault();
    if (!challengeAnswerInput.trim()) return;

    setIsAnswering(true);
    setAnswerFeedback(null);

    try {
      const res = await apiClient.answerChallenge(claimId, challengeId, challengeAnswerInput.trim());

      if (res.isCorrect) {
        setAnswerFeedback({
          isSuccess: true,
          message: 'Challenge answer verified successfully! Claim promoted to UNDER_REVIEW.',
        });
        setRefreshKey((k) => k + 1);
      } else {
        setAnswerFeedback({
          isSuccess: false,
          message: `Answer does not match records. Remaining attempts: ${res.remainingAttempts}`,
        });
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setAnswerFeedback({ isSuccess: false, message: err.message });
      } else {
        setAnswerFeedback({ isSuccess: false, message: 'Failed to verify answer. Please retry.' });
      }
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <DashboardLayout
      title="My Ownership Claims"
      subtitle="Track review status by campus security, respond to verification challenges, and retrieve handover OTPs."
      role="STUDENT_STAFF"
    >
      {/* Loading State */}
      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <LoadingState message="Loading your submitted claims and verification status..." />
        </div>
      )}

      {/* Error Notice */}
      {!isLoading && errorMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Claims List */}
      {!isLoading && (
        <div className="space-y-6">
          {claims.length > 0 ? (
            claims.map((claim) => {
              const isApproved = claim.claimStatus === 'APPROVED';
              const isUnderReview = claim.claimStatus === 'UNDER_REVIEW';
              const isChallengeRequired = claim.claimStatus === 'CHALLENGE_REQUIRED';
              const isRejected = claim.claimStatus === 'REJECTED';

              return (
                <div
                  key={claim.id}
                  className={`rounded-2xl border bg-white p-6 shadow-xs transition-all ${
                    isApproved
                      ? 'border-emerald-300 ring-2 ring-emerald-500/10'
                      : isChallengeRequired
                      ? 'border-amber-300 ring-2 ring-amber-500/10'
                      : isRejected
                      ? 'border-rose-200'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Claim Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-500 font-semibold">{claim.itemReference}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isApproved
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : isUnderReview
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : isChallengeRequired
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : isRejected
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {claim.claimStatus.replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-1">{claim.itemTitle}</h3>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>Submitted {formatDisplayDateTime(claim.submittedAt)}</span>
                    </div>
                  </div>

                  {/* CHALLENGE REQUIRED: Verification Action */}
                  {isChallengeRequired && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                          <Lock className="h-4 w-4 text-amber-700" />
                          <span>Private Ownership Challenge Required</span>
                        </div>
                        {activeChallengeClaimId !== claim.id && (
                          <button
                            type="button"
                            onClick={() => handleOpenChallengeBox(claim)}
                            className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors shadow-2xs"
                          >
                            Answer Challenge Question
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Security requires you to answer a confidential attribute challenge (e.g., hidden sticker, engraving, or accessory) before this claim can be approved.
                      </p>

                      {/* Expanded Challenge Form */}
                      {activeChallengeClaimId === claim.id && (
                        <div className="pt-2 border-t border-amber-200/80 space-y-3">
                          {challengeItemQuestions.length > 0 ? (
                            challengeItemQuestions.map((ch) => (
                              <form
                                key={ch.id}
                                onSubmit={(e) => handleChallengeSubmit(e, claim.id, ch.id)}
                                className="space-y-2 bg-white rounded-xl border border-amber-200 p-4"
                              >
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                    Verification Question:
                                  </span>
                                  <p className="text-xs font-semibold text-slate-900">{ch.questionText}</p>
                                  {ch.hint && (
                                    <p className="text-[11px] text-slate-500 italic">Hint: {ch.hint}</p>
                                  )}
                                </div>

                                <FormField id={`challenge-ans-${ch.id}`} label="Your Answer" required>
                                  <input
                                    id={`challenge-ans-${ch.id}`}
                                    type="text"
                                    value={challengeAnswerInput}
                                    onChange={(e) => setChallengeAnswerInput(e.target.value)}
                                    placeholder="Type exact answer (e.g. sticker name or keychain)..."
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                                    required
                                  />
                                </FormField>

                                {answerFeedback && (
                                  <div
                                    className={`rounded-lg p-2.5 text-xs flex items-center gap-1.5 ${
                                      answerFeedback.isSuccess
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                                    }`}
                                  >
                                    {answerFeedback.isSuccess ? (
                                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                    ) : (
                                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                                    )}
                                    <span>{answerFeedback.message}</span>
                                  </div>
                                )}

                                <div className="flex items-center justify-end gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => setActiveChallengeClaimId(null)}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                                  >
                                    Close
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={isAnswering}
                                    className="rounded-lg bg-amber-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-800 transition-colors disabled:opacity-60"
                                  >
                                    {isAnswering ? 'Evaluating...' : 'Submit Challenge Answer'}
                                  </button>
                                </div>
                              </form>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">Loading challenge questions...</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* APPROVED HIGHLIGHT: Supervised OTP Pass */}
                  {isApproved && claim.handoverOtp && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
                            <KeyRound className="h-4 w-4 text-emerald-700" />
                            <span>Supervised Handover Verification Pass</span>
                          </div>
                          <p className="text-xs text-emerald-900">
                            Present this single-use OTP along with your physical LPU Student ID card at the security desk to collect your property:
                          </p>
                          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-950 pt-1">
                            <MapPin className="h-3.5 w-3.5 text-emerald-700" />
                            <span>Central Security Station (Ref: Locker Vault)</span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-emerald-300 bg-white px-6 py-3 text-center shadow-2xs shrink-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Handover OTP
                          </span>
                          <p className="font-mono text-3xl font-extrabold tracking-widest text-emerald-700">
                            {claim.handoverOtp}
                          </p>
                          <span className="text-[10px] text-emerald-600 font-medium">
                            Valid for 48 Hours
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* REJECTED NOTICE */}
                  {isRejected && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-1">
                      <p className="font-bold">Claim Decided: Rejected</p>
                      <p className="text-[11px] leading-relaxed">
                        Reason: {claim.rejectionReason || 'Ownership challenge proof could not be verified by campus vigilance.'}
                      </p>
                    </div>
                  )}

                  {/* Statement of Ownership */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700">Your Statement of Ownership:</span>
                      <p className="mt-0.5 text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
                        &quot;{claim.statement}&quot;
                      </p>
                    </div>

                    {/* Ownership Evidence & Proof Documents */}
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                            <Paperclip className="h-3.5 w-3.5 text-lpu-primary" />
                            Ownership Proof & Verification Documents
                          </span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Upload bills, warranty cards, purchase receipts, or photos proving rightful ownership.
                          </p>
                        </div>

                        {!isRejected && (
                          <div>
                            <label
                              htmlFor={`evidence-upload-${claim.id}`}
                              className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer ${
                                uploadingClaimId === claim.id ? 'opacity-60 pointer-events-none' : ''
                              }`}
                            >
                              {uploadingClaimId === claim.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-lpu-primary" />
                                  <span>Uploading Proof...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="h-3.5 w-3.5 text-lpu-primary" />
                                  <span>Upload Evidence</span>
                                </>
                              )}
                            </label>
                            <input
                              id={`evidence-upload-${claim.id}`}
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg,.webp"
                              className="hidden"
                              disabled={uploadingClaimId === claim.id}
                              onChange={(e) => handleFileUpload(claim.id, e)}
                            />
                          </div>
                        )}
                      </div>

                      {/* Upload Feedback */}
                      {uploadFeedback && uploadFeedback.claimId === claim.id && (
                        <div
                          className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                            uploadFeedback.isSuccess
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {uploadFeedback.isSuccess ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                          )}
                          <span>{uploadFeedback.message}</span>
                        </div>
                      )}

                      {/* List of Uploaded Documents */}
                      {claim.privateEvidenceProofUrls && claim.privateEvidenceProofUrls.length > 0 ? (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Attached Files ({claim.privateEvidenceProofUrls.length}):
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {claim.privateEvidenceProofUrls.map((url, idx) => {
                              const filename = url.split('/').filter(Boolean).pop() || `Evidence Document ${idx + 1}`;
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2 text-xs"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <FileText className="h-4 w-4 shrink-0 text-lpu-primary" />
                                    <span className="truncate font-mono text-[11px] text-slate-700" title={filename}>
                                      {filename}
                                    </span>
                                  </div>
                                  <span className="shrink-0 text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                                    Stored Securely
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          No supplemental proof documents attached yet. Click &ldquo;Upload Evidence&rdquo; to attach proof.
                        </p>
                      )}
                    </div>

                    {claim.reviewedBy && (
                      <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                          Reviewed by: {claim.reviewedBy}
                        </span>
                        {claim.reviewedAt && (
                          <span>Decided on {formatDisplayDate(claim.reviewedAt)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState
              title="No ownership claims logged"
              description="When you find an item matching your lost property on the campus board, you can submit an ownership claim to initiate recovery."
              actionText="Browse Campus Board"
              onAction={() => router.push('/board')}
            />
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

export default function MyClaimsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Claims...</div>}>
      <MyClaimsContent />
    </Suspense>
  );
}
