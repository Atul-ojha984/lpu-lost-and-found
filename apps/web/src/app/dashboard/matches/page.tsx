'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Sparkles, 
  MapPin, 
  Clock, 
  Tag, 
  ArrowRight, 
  CheckCircle2, 
  X,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { DEMO_MATCHES } from '@/lib/mock-data';
import { MatchSuggestion, PublicItem } from '@/types';

function MatchesContent() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchSuggestion[]>([]);
  const [userItems, setUserItems] = useState<PublicItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load user's items and their match suggestions
  const fetchMatches = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const reports = await apiClient.getMyReports();
      setUserItems(reports);

      const allMatches: MatchSuggestion[] = [];

      for (const item of reports) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const itemMatches: any[] = await apiClient.getMatchesForItem(item.id);
          if (Array.isArray(itemMatches)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            itemMatches.forEach((m: any) => {
              allMatches.push({
                id: m.id,
                lostItemId: m.lostItem?.id || '',
                lostItemTitle: m.lostItem?.title || 'Reported Lost Property',
                foundItemId: m.foundItem?.id || '',
                foundItemTitle: m.foundItem?.title || 'Candidate Found Property',
                matchScore: m.matchScore,
                confidence: m.confidence,
                explanation: m.explanation,
                createdAt: m.createdAt,
              });
            });
          }
        } catch {
          // Non-blocking item match fetch failure
        }
      }

      // If user has no reports yet, fall back to demo matches for demonstration
      if (allMatches.length === 0 && reports.length === 0) {
        setMatches(DEMO_MATCHES);
      } else {
        setMatches(allMatches);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to matching service. Loading standard demonstration candidates.');
        setMatches(DEMO_MATCHES);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadMatches() {
      try {
        const reports = await apiClient.getMyReports();
        if (!isMounted) return;
        setUserItems(reports);

        const allMatches: MatchSuggestion[] = [];

        for (const item of reports) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const itemMatches: any[] = await apiClient.getMatchesForItem(item.id);
            if (Array.isArray(itemMatches)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              itemMatches.forEach((m: any) => {
                allMatches.push({
                  id: m.id,
                  lostItemId: m.lostItem?.id || '',
                  lostItemTitle: m.lostItem?.title || 'Reported Lost Property',
                  foundItemId: m.foundItem?.id || '',
                  foundItemTitle: m.foundItem?.title || 'Candidate Found Property',
                  matchScore: m.matchScore,
                  confidence: m.confidence,
                  explanation: m.explanation,
                  createdAt: m.createdAt,
                });
              });
            }
          } catch {
            // Non-blocking item match fetch failure
          }
        }

        if (isMounted) {
          if (allMatches.length === 0 && reports.length === 0) {
            setMatches(DEMO_MATCHES);
          } else {
            setMatches(allMatches);
          }
        }
      } catch (err) {
        if (isMounted) {
          if (err instanceof ApiClientError) {
            setErrorMessage(err.message);
          } else {
            setErrorMessage('Failed to connect to matching service. Loading standard demonstration candidates.');
            setMatches(DEMO_MATCHES);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadMatches();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefreshEngine = async () => {
    setIsRefreshing(true);
    try {
      if (selectedItemId !== 'ALL') {
        await apiClient.refreshMatchesForItem(selectedItemId);
      } else if (userItems.length > 0) {
        for (const item of userItems) {
          await apiClient.refreshMatchesForItem(item.id);
        }
      }
      await fetchMatches();
    } catch {
      // Ignore refresh error
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDismiss = (id: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  };

  const filteredMatches = matches.filter((m) => {
    if (selectedItemId !== 'ALL') {
      return m.lostItemId === selectedItemId || m.foundItemId === selectedItemId;
    }
    return true;
  });

  return (
    <DashboardLayout
      title="Automated Match Suggestions"
      subtitle="Deterministic explainable matches computed across your reported properties and items logged on campus."
      role="STUDENT_STAFF"
    >
      {/* Algorithm Banner */}
      <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-xs text-purple-950">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
          <div className="flex items-center gap-2 font-bold">
            <Sparkles className="h-4 w-4 text-purple-700" />
            <span>Deterministic Scoring Formulation:</span>
          </div>

          <button
            type="button"
            onClick={handleRefreshEngine}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-100/50 transition-colors self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Recomputing...' : 'Refresh Suggestions'}</span>
          </button>
        </div>
        <p className="text-[11px] text-purple-800 leading-relaxed">
          The campus engine evaluates candidate pairs using calibrated deterministic weights: <strong>Description &amp; Keyword Token Overlap (40%)</strong>, <strong>Category Compatibility (25%)</strong>, <strong>Campus Zone Proximity (20%)</strong>, and <strong>Event-Time Proximity (15%)</strong>.
        </p>
        <p className="text-[10px] text-purple-700 font-semibold mt-1">
          * A suggested match never automatically transfers property or establishes ownership. A verified claim is strictly required.
        </p>
      </div>

      {/* Filter by User Item */}
      {userItems.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700">Filter for report:</span>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-purple-600 focus:outline-none"
          >
            <option value="ALL">All My Reported Items</option>
            {userItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.referenceNumber} — {item.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <LoadingState message="Evaluating algorithmic matching models across campus listings..." />
        </div>
      )}

      {/* Error Banner */}
      {!isLoading && errorMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Matches List */}
      {!isLoading && (
        <div className="space-y-6">
          {filteredMatches.length > 0 ? (
            filteredMatches.map((match) => {
              const isHigh = match.confidence === 'HIGH';

              return (
                <div
                  key={match.id}
                  className={`rounded-2xl border bg-white p-6 shadow-xs ${
                    isHigh ? 'border-purple-300 ring-2 ring-purple-500/10' : 'border-slate-200'
                  }`}
                >
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                          isHigh
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : match.confidence === 'MEDIUM'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Sparkles className="h-3 w-3 text-purple-700" />
                        {match.matchScore}% Match Score ({match.confidence} CONFIDENCE)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDismiss(match.id)}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Dismiss Candidate</span>
                    </button>
                  </div>

                  {/* Side-by-Side Comparison */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Reported Lost Item
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">
                        {match.lostItemTitle}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {match.lostItemId}</p>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Candidate Found Property
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">
                        {match.foundItemTitle}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {match.foundItemId}</p>
                    </div>
                  </div>

                  {/* Explainable Factor Breakdown */}
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Algorithmic Score Breakdown:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span><strong>Category (25%):</strong> {match.explanation.categoryMatch}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <MapPin className="h-3.5 w-3.5 text-red-600 shrink-0" />
                        <span><strong>Zone Proximity (20%):</strong> {match.explanation.locationProximity}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span><strong>Time Delta (15%):</strong> {match.explanation.timeDelta}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <Tag className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                        <span><strong>Matching Keywords (40%):</strong> {match.explanation.matchingTokens?.join(', ') || 'General attributes'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                    <Link
                      href={`/items/${match.foundItemId}`}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Inspect Candidate on Board
                    </Link>
                    <Link
                      href={`/items/${match.foundItemId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 transition-colors shadow-xs"
                    >
                      <span>Initiate Ownership Claim</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState
              title="No automated matches detected yet"
              description="Our deterministic engine scans continuously. When a high-confidence match is detected for your lost reports, it will appear here."
              actionText="Browse Campus Board"
              onAction={() => router.push('/board')}
            />
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

export default function MatchesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Matches...</div>}>
      <MatchesContent />
    </Suspense>
  );
}
