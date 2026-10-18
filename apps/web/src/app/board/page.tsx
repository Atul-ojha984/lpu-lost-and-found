'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/navigation/Navbar';
import { Footer } from '@/components/navigation/Footer';
import { ItemCard } from '@/components/items/ItemCard';
import { SearchFilters } from '@/components/items/SearchFilters';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { FormField } from '@/components/ui/FormField';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { PublicItem, ItemType, ItemCategory, LPUCampusZone, ItemStatus } from '@/types';
import { 
  ShieldCheck, 
  X, 
  Upload, 
  CheckCircle2, 
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Lock
} from 'lucide-react';

function BoardContent() {
  const searchParams = useSearchParams();

  // URL query parameter initial state
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = (searchParams.get('category') as ItemCategory) || 'ALL';
  const initialType = (searchParams.get('type') as ItemType) || 'ALL';

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedType, setSelectedType] = useState<ItemType | 'ALL'>(initialType);
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'ALL'>(initialCategory);
  const [selectedZone, setSelectedZone] = useState<LPUCampusZone | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<ItemStatus | 'ALL'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;

  // Board Data State
  const [items, setItems] = useState<PublicItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Current User Session
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  // Claim Modal State
  const [claimingItem, setClaimingItem] = useState<PublicItem | null>(null);
  const [claimStatement, setClaimStatement] = useState('');
  const [claimChallengeAnswer, setClaimChallengeAnswer] = useState('');
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  // Check auth session
  useEffect(() => {
    apiClient.getCurrentUser()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null));
  }, []);

  // Fetch items from Django REST API
  const fetchBoardItems = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.getItems({
        search: searchQuery,
        itemType: selectedType,
        category: selectedCategory,
        campusZone: selectedZone,
        status: selectedStatus,
        page: currentPage,
        limit: pageSize,
      });

      setItems(res.items);
      setTotalItems(res.pagination.totalItems);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to campus property registry. Please verify the API server.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedType, selectedCategory, selectedZone, selectedStatus, currentPage]);

  useEffect(() => {
    let isMounted = true;

    async function loadBoardItems() {
      try {
        const res = await apiClient.getItems({
          search: searchQuery,
          itemType: selectedType,
          category: selectedCategory,
          campusZone: selectedZone,
          status: selectedStatus,
          page: currentPage,
          limit: pageSize,
        });

        if (isMounted) {
          setItems(res.items);
          setTotalItems(res.pagination.totalItems);
          setTotalPages(res.pagination.totalPages);
        }
      } catch (err) {
        if (isMounted) {
          if (err instanceof ApiClientError) {
            setErrorMessage(err.message);
          } else {
            setErrorMessage('Failed to connect to campus property registry. Please verify the API server.');
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadBoardItems();

    return () => {
      isMounted = false;
    };
  }, [searchQuery, selectedType, selectedCategory, selectedZone, selectedStatus, currentPage, pageSize]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedType('ALL');
    setSelectedCategory('ALL');
    setSelectedZone('ALL');
    setSelectedStatus('ALL');
    setCurrentPage(1);
  };

  const handleClaimTrigger = (item: PublicItem) => {
    if (!currentUser) {
      setAuthPromptOpen(true);
    } else {
      setClaimingItem(item);
    }
  };

  const handleClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimStatement.trim()) return;

    setIsSubmittingClaim(true);
    setTimeout(() => {
      setIsSubmittingClaim(false);
      setClaimSuccess(true);
      setTimeout(() => {
        setClaimSuccess(false);
        setClaimingItem(null);
        setClaimStatement('');
        setClaimChallengeAnswer('');
      }, 2000);
    }, 700);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <Navbar />

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700">
                <ShieldCheck className="h-4 w-4" />
                <span>Sanitized Public Search Board</span>
              </div>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Campus Property Listings
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Browse lost and found items with redacted public descriptions across Lovely Professional University.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/report?type=LOST"
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-red-800 transition-colors"
              >
                Report Lost Item
              </Link>
              <Link
                href="/report?type=FOUND"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Report Found Item
              </Link>
            </div>
          </div>

          {/* Filter Controls */}
          <SearchFilters
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q);
              setCurrentPage(1);
            }}
            selectedType={selectedType}
            onTypeChange={(t) => {
              setSelectedType(t);
              setCurrentPage(1);
            }}
            selectedCategory={selectedCategory}
            onCategoryChange={(c) => {
              setSelectedCategory(c);
              setCurrentPage(1);
            }}
            selectedZone={selectedZone}
            onZoneChange={(z) => {
              setSelectedZone(z);
              setCurrentPage(1);
            }}
            selectedStatus={selectedStatus}
            onStatusChange={(s) => {
              setSelectedStatus(s);
              setCurrentPage(1);
            }}
            onReset={handleResetFilters}
            totalResults={totalItems}
          />

          {/* Loading State */}
          {isLoading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-xs">
              <LoadingState message="Loading campus property records from central registry..." />
            </div>
          )}

          {/* Error State with Retry */}
          {!isLoading && errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-white p-12 text-center shadow-xs space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Registry Connection Issue</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">{errorMessage}</p>
              <button
                type="button"
                onClick={fetchBoardItems}
                className="rounded-lg bg-red-700 px-5 py-2 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
              >
                Retry Search
              </button>
            </div>
          )}

          {/* Item Grid & Pagination */}
          {!isLoading && !errorMessage && (
            <>
              {items.length > 0 ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onClaim={handleClaimTrigger}
                      />
                    ))}
                  </div>

                  {/* Server-Side Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-6">
                      <p className="text-xs text-slate-500">
                        Showing page <span className="font-semibold text-slate-800">{currentPage}</span> of{' '}
                        <span className="font-semibold text-slate-800">{totalPages}</span> ({totalItems} total records)
                      </p>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Previous</span>
                        </button>

                        <div className="flex items-center gap-1 px-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setCurrentPage(pageNum)}
                              className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                                pageNum === currentPage
                                  ? 'bg-red-700 text-white'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <span>Next</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  title="No campus items match your filters"
                  description="Try adjusting your keyword query, switching between Lost and Found, or clearing category restrictions."
                  actionText="Reset All Filters"
                  onAction={handleResetFilters}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Auth Prompt Dialog (When Unauthenticated User Clicks Claim) */}
      {authPromptOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setAuthPromptOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 animate-fade-in text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Authentication Required
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              To verify property ownership and prevent fraudulent claims, please sign in with your Lovely Professional University student or staff account.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAuthPromptOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <Link
                href="/login?redirect=/board"
                className="rounded-lg bg-red-700 px-5 py-2 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
              >
                Log In Now
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Ownership Claim Modal (When Authenticated) */}
      {claimingItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setClaimingItem(null)}
          />

          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 z-10 animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setClaimingItem(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">
                Verified Recovery Claim
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                Claim: {claimingItem.title}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Ref: {claimingItem.referenceNumber} • Desk: {claimingItem.currentCustodyDesk || 'Main Security Post'}
              </p>
            </div>

            {claimSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <h4 className="text-sm font-bold text-emerald-900">Ownership Claim Submitted</h4>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Your claim and confidential verification proof have been forwarded to the campus security post. Track progress under &quot;My Claims&quot;.
                </p>
              </div>
            ) : (
              <form onSubmit={handleClaimSubmit} className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <ShieldCheck className="h-4 w-4 text-red-600" />
                    <span>Anti-Fraud Notice:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    You must provide identifying details that only the true owner would know. False claims will be escalated to University Vigilance.
                  </p>
                </div>

                <FormField
                  id="claim-statement"
                  label="Statement of Ownership"
                  required
                  helperText="Describe how and where you misplaced this item."
                >
                  <textarea
                    id="claim-statement"
                    rows={3}
                    value={claimStatement}
                    onChange={(e) => setClaimStatement(e.target.value)}
                    placeholder="E.g., I accidentally left this on the study table on the 2nd floor of Central Library after my evening revision session..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    required
                  />
                </FormField>

                <FormField
                  id="claim-challenge"
                  label="Private Identifying Details (Challenge Response)"
                  required
                  helperText="Serial numbers, lock-screen image, stickers, engravings, or contents."
                >
                  <textarea
                    id="claim-challenge"
                    rows={2}
                    value={claimChallengeAnswer}
                    onChange={(e) => setClaimChallengeAnswer(e.target.value)}
                    placeholder="E.g., The phone wallpaper is a landscape photo, or the laptop has an octocat sticker on bottom-left..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    required
                  />
                </FormField>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Supporting Proof (Invoice / Purchase Receipt / Photo)
                  </label>
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center cursor-pointer hover:bg-slate-100/60 transition-colors">
                    <Upload className="h-6 w-6 text-slate-400 mb-1" />
                    <span className="text-xs font-medium text-slate-700">Upload receipt or ID card photo</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, PDF up to 5MB</span>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setClaimingItem(null)}
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
                    {isSubmittingClaim ? 'Submitting Claim...' : 'Submit Ownership Claim'}
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

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Campus Board...</div>}>
      <BoardContent />
    </Suspense>
  );
}
