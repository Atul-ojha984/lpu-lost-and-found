'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { 
  MapPin, 
  Calendar, 
  ShieldCheck, 
  ArrowLeft, 
  PackageCheck, 
  AlertCircle, 
  CheckCircle2, 
  Lock, 
  X, 
  ExternalLink,
  Edit3
} from 'lucide-react';
import { Navbar } from '@/components/navigation/Navbar';
import { Footer } from '@/components/navigation/Footer';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FormField } from '@/components/ui/FormField';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { PublicItem } from '@/types';
import { CATEGORY_LABELS, CAMPUS_ZONE_LABELS } from '@/lib/constants';
import { formatDisplayDate } from '@/lib/formatters';

interface ItemDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ItemDetailPage({ params }: ItemDetailPageProps) {
  const resolvedParams = use(params);
  const itemId = resolvedParams.id;

  const [item, setItem] = useState<PublicItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authentication & Claim Modal State
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimStatement, setClaimStatement] = useState('');
  const [claimChallengeAnswer, setClaimChallengeAnswer] = useState('');
  const [challenges, setChallenges] = useState<Array<{ id: string; questionText: string; hint?: string; maxAttempts: number }>>([]);
  const [challengeAnswers, setChallengeAnswers] = useState<Record<string, string>>({});
  const [isLoadingChallenges, setIsLoadingChallenges] = useState(false);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimResultStatus, setClaimResultStatus] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [authRequiredPrompt, setAuthRequiredPrompt] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  const fetchItemData = () => {
    setIsLoading(true);
    setError(null);
    setReloadKey((prev) => prev + 1);
  };

  // Fetch item and check user session
  useEffect(() => {
    let isCancelled = false;

    async function loadItem() {
      try {
        const fetchedItem = await apiClient.getItemById(itemId);
        if (!isCancelled) {
          setItem(fetchedItem);
        }

        // Check current user session
        try {
          const user = await apiClient.getCurrentUser();
          if (!isCancelled && user) {
            setCurrentUser(user);
          }
        } catch {
          if (!isCancelled) {
            setCurrentUser(null);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          if (err instanceof ApiClientError) {
            setError(err.message);
          } else {
            setError('Failed to load item details. Please check your connection and retry.');
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    if (itemId) {
      loadItem();
    }

    return () => {
      isCancelled = true;
    };
  }, [itemId, reloadKey]);

  const handleClaimClick = async () => {
    if (!currentUser) {
      setAuthRequiredPrompt(true);
      return;
    }

    setIsClaimModalOpen(true);
    setClaimError(null);
    setClaimSuccess(false);

    // Fetch challenges for this item if any
    try {
      setIsLoadingChallenges(true);
      const loadedChallenges = await apiClient.getItemChallenges(itemId);
      setChallenges(loadedChallenges);
    } catch {
      // Challenges are optional
      setChallenges([]);
    } finally {
      setIsLoadingChallenges(false);
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimStatement.trim()) return;

    setIsSubmittingClaim(true);
    setClaimError(null);

    try {
      const formattedAnswers = challenges
        .map((ch) => ({
          challengeId: ch.id,
          providedAnswer: (challengeAnswers[ch.id] || '').trim(),
        }))
        .filter((ans) => ans.providedAnswer.length > 0);

      const fullStatement = claimChallengeAnswer.trim()
        ? `${claimStatement.trim()}\n\n[Additional Private Details]: ${claimChallengeAnswer.trim()}`
        : claimStatement.trim();

      const response = await apiClient.submitClaim({
        itemId,
        statement: fullStatement,
        challengeAnswers: formattedAnswers.length > 0 ? formattedAnswers : undefined,
      });

      setClaimResultStatus(response.claimStatus || 'SUBMITTED');
      setClaimSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setClaimError(err.message);
      } else {
        setClaimError('Failed to submit claim. Please try again.');
      }
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <Navbar />

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Back Navigation Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-500">
            <Link
              href="/board"
              className="inline-flex items-center gap-1.5 font-medium hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Campus Board</span>
            </Link>
            <span>/</span>
            <span className="font-mono text-slate-700 font-semibold truncate">
              {item ? item.referenceNumber : 'Item Details'}
            </span>
          </nav>

          {/* Loading State */}
          {isLoading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <LoadingState message="Retrieving sanitized campus listing from security registry..." />
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="rounded-2xl border border-red-200 bg-white p-10 text-center shadow-xs space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700">
                <AlertCircle className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Unable to Display Property Listing</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">{error}</p>
              <button
                type="button"
                onClick={fetchItemData}
                className="rounded-lg bg-red-700 px-5 py-2 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
              >
                Retry Loading
              </button>
            </div>
          )}

          {/* Main Item Content */}
          {!isLoading && !error && item && (
            <article className="space-y-6">
              {/* Owner Banner (if authenticated user filed this report) */}
              {item.isOwner && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-950">You reported this property incident</p>
                      <p className="text-[11px] text-emerald-800">
                        You have ownership authority to update this report while it remains open.
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/my-reports?edit=${item.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors shadow-2xs self-start sm:self-auto"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit Report</span>
                  </Link>
                </div>
              )}

              {/* Header Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold tracking-wider uppercase ${
                        item.itemType === 'FOUND'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {item.itemType === 'FOUND' ? (
                        <>
                          <PackageCheck className="h-3.5 w-3.5" />
                          <span>FOUND PROPERTY</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>LOST PROPERTY</span>
                        </>
                      )}
                    </span>

                    <span className="font-mono text-xs font-semibold text-slate-500">
                      REF: {item.referenceNumber}
                    </span>
                  </div>

                  <StatusBadge status={item.status} />
                </div>

                {/* Title */}
                <div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    {item.title}
                  </h1>
                  <p className="mt-1 text-xs text-slate-500 font-medium">
                    Category: {CATEGORY_LABELS[item.category]?.label || item.category}
                  </p>
                </div>

                {/* Key Facts Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-red-600" />
                      Broad Campus Location
                    </span>
                    <p className="font-medium text-slate-800">
                      {CAMPUS_ZONE_LABELS[item.campusZone]?.label || item.campusZone}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Spot: {item.specificLocation}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      Incident Date
                    </span>
                    <p className="font-medium text-slate-800">
                      {formatDisplayDate(item.eventDate)}
                    </p>
                    {item.currentCustodyDesk && (
                      <p className="text-[11px] text-blue-700 font-medium flex items-center gap-1 pt-0.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Custody: {item.currentCustodyDesk}
                      </p>
                    )}
                  </div>
                </div>

                {/* Photo Preview (if present) */}
                {item.primaryImageUrl && (
                  <div className="pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Photographic Record (Metadata Stripped)
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 max-w-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.primaryImageUrl}
                        alt={`Photo of ${item.title}`}
                        className="h-auto w-full max-h-80 object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* Redacted Description */}
                <div className="pt-2 space-y-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Public Description
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-white rounded-xl border border-slate-200 p-4">
                    {item.publicDescription}
                  </p>
                </div>

                {/* Privacy & Anti-Fraud Notice */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
                  <Lock className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    <strong>Zero-Leak Privacy Protocol:</strong> Private identifying details, serial numbers, and wallet contents have been encrypted into the campus vault and are strictly excluded from public display to prevent fraudulent claims.
                  </p>
                </div>

                {/* Claim Action Bar */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    <span>Logged on: {formatDisplayDate(item.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.itemType === 'FOUND' && item.status !== 'HANDED_OVER' && (
                      <button
                        type="button"
                        onClick={handleClaimClick}
                        className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-red-800 transition-colors"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>File Ownership Claim</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          )}
        </div>
      </main>

      {/* Authentication Prompt Modal (When Unauthenticated User Tries to Claim) */}
      {authRequiredPrompt && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setAuthRequiredPrompt(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 animate-fade-in text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700">
              <Lock className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              University Authentication Required
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              To verify item ownership and protect campus property against fraudulent claims, you must log in with your LPU student or staff credentials.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAuthRequiredPrompt(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <Link
                href={`/login?redirect=/items/${itemId}`}
                className="rounded-lg bg-red-700 px-5 py-2 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
              >
                Log In to Claim
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Authenticated Claim Submission Modal */}
      {isClaimModalOpen && item && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setIsClaimModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsClaimModalOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">
                LPU Verified Recovery Claim
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                Claim: {item.title}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Ref: {item.referenceNumber} • Logged by: {currentUser?.name || 'Verified Student'}
              </p>
            </div>

            {claimSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">Recovery Claim Successfully Filed</h4>
                  <p className="mt-1 text-xs text-emerald-800 leading-relaxed">
                    Your confidential ownership statement and verification proofs have been recorded.
                  </p>
                </div>

                <div className="rounded-lg bg-white border border-emerald-200 p-3 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-500">Initial Claim Status:</span>
                    <span className="font-bold text-emerald-700 uppercase tracking-wide">
                      {claimResultStatus?.replace('_', ' ')}
                    </span>
                  </div>
                  {claimResultStatus === 'CHALLENGE_REQUIRED' && (
                    <p className="mt-2 text-[11px] text-amber-700 text-left">
                      Notice: One or more ownership challenges require verification. You can answer them or view remaining attempts in your dashboard.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Link
                    href="/dashboard/my-claims"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
                  >
                    <span>View in My Claims</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setIsClaimModalOpen(false);
                      setClaimSuccess(false);
                      setClaimStatement('');
                      setClaimChallengeAnswer('');
                      setChallengeAnswers({});
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleClaimSubmit} className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <ShieldCheck className="h-4 w-4 text-amber-700" />
                    <span>Campus Vigilance Notice:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Provide verifiable details that only the true owner would know. False claims will result in immediate disciplinary escalation.
                  </p>
                </div>

                {claimError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{claimError}</span>
                  </div>
                )}

                <FormField
                  id="detail-claim-stmt"
                  label="Statement of Ownership"
                  required
                  helperText="Explain where and how you lost or misplaced this property."
                >
                  <textarea
                    id="detail-claim-stmt"
                    rows={3}
                    value={claimStatement}
                    onChange={(e) => setClaimStatement(e.target.value)}
                    placeholder="E.g., I mislaid this item on the study bench in Block 34 during lunch hour..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    required
                  />
                </FormField>

                {/* Verification Challenges Section */}
                {isLoadingChallenges ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <LoadingState message="Loading security verification challenges..." />
                  </div>
                ) : challenges.length > 0 ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-red-700" />
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Specific Item Verification Challenges
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Answer the confidential questions registered for this item. Answers are strictly verified on the server and never sent to claimants.
                    </p>

                    {challenges.map((challenge, index) => (
                      <div key={challenge.id} className="space-y-1.5 pt-2 border-t border-slate-200/60 first:border-0 first:pt-0">
                        <label className="block text-xs font-semibold text-slate-800">
                          Question {index + 1}: {challenge.questionText}
                        </label>
                        {challenge.hint && (
                          <p className="text-[11px] text-slate-500 italic">Hint: {challenge.hint}</p>
                        )}
                        <input
                          type="text"
                          value={challengeAnswers[challenge.id] || ''}
                          onChange={(e) => setChallengeAnswers({ ...challengeAnswers, [challenge.id]: e.target.value })}
                          placeholder="Enter your verification answer..."
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <FormField
                    id="detail-claim-challenge"
                    label="Private Identifying Details (Challenge Proof)"
                    helperText="Provide unique marks, lock-screen wallpapers, serial prefixes, or contents."
                  >
                    <textarea
                      id="detail-claim-challenge"
                      rows={2}
                      value={claimChallengeAnswer}
                      onChange={(e) => setClaimChallengeAnswer(e.target.value)}
                      placeholder="E.g., Serial number, distinctive scratch, wallpaper picture, contents inside..."
                      className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    />
                  </FormField>
                )}

                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsClaimModalOpen(false)}
                    disabled={isSubmittingClaim}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingClaim}
                    className="rounded-lg bg-red-700 px-5 py-2 text-xs font-semibold text-white hover:bg-red-800 transition-colors disabled:opacity-60"
                  >
                    {isSubmittingClaim ? 'Submitting...' : 'Submit Claim'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
