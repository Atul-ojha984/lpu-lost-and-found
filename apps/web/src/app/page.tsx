'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  KeyRound,
  FilePlus2,
  Package,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Navbar } from '@/components/navigation/Navbar';
import { Footer } from '@/components/navigation/Footer';
import { ItemCard } from '@/components/items/ItemCard';
import { CATEGORY_LABELS } from '@/lib/constants';
import { ItemCategory, PublicItem } from '@/types';
import { apiClient } from '@/lib/api-client';

export default function HomePage() {
  const router = useRouter();
  const [heroSearch, setHeroSearch] = useState('');
  const [recentItems, setRecentItems] = useState<PublicItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);

  const fetchItems = () => {
    setIsLoadingItems(true);
    setItemsError(null);
    apiClient.getItems({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' })
      .then((res) => {
        setRecentItems(res.items);
        setIsLoadingItems(false);
      })
      .catch((err) => {
        setItemsError(err instanceof Error ? err.message : 'Unable to connect to campus property registry.');
        setIsLoadingItems(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    apiClient.getCurrentUser()
      .then((user) => { if (isMounted) setCurrentUser(user); })
      .catch(() => { if (isMounted) setCurrentUser(null); });

    apiClient.getItems({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' })
      .then((res) => {
        if (isMounted) {
          setRecentItems(res.items);
          setIsLoadingItems(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setItemsError(err instanceof Error ? err.message : 'Unable to connect to campus property registry.');
          setIsLoadingItems(false);
        }
      });

    return () => { isMounted = false; };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      router.push(`/board?search=${encodeURIComponent(heroSearch.trim())}`);
    } else {
      router.push('/board');
    }
  };

  const handleCategoryClick = (categoryKey: ItemCategory) => {
    router.push(`/board?category=${categoryKey}`);
  };

  const handleClaim = (item: PublicItem) => {
    if (!currentUser) {
      router.push(`/login?redirect=${encodeURIComponent('/items/' + item.id + '?claim=true')}`);
    } else {
      router.push(`/items/${item.id}?claim=true`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F8FC]">
      <Navbar />

      {/* Hero Section */}
      <section className="relative border-b border-[#E2E8F0] bg-white py-16 sm:py-24 overflow-hidden">
        {/* Subtle decorative background shapes matching Navy/Teal/Royal theme */}
        <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#20B5AD]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#356DE8]/10 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#20B5AD]/30 bg-[#E6F8F7] px-3.5 py-1 text-xs font-bold text-[#16A89F] shadow-2xs mb-6">
            <span className="flex h-2 w-2 rounded-full bg-[#20B5AD] animate-pulse" />
            <span>Lovely Professional University • Campus Property Recovery Portal</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-extrabold tracking-tight text-[#192B4A] sm:text-5xl lg:text-6xl">
            Lost something on campus? <br className="hidden sm:inline" />
            <span className="text-[#20B5AD]">Let&apos;s find it together.</span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-5 max-w-2xl text-sm sm:text-base text-slate-600 leading-relaxed">
            The dedicated, secure property recovery network for LPU. Report misplaced belongings, browse sanitized listings across campus zones, and recover property through verified security custody.
          </p>

          {/* Search Bar Form */}
          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-8 max-w-2xl"
          >
            <div className="flex flex-col sm:flex-row items-center gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-[#20B5AD] focus-within:ring-2 focus-within:ring-[#20B5AD]/20 transition-all">
              <div className="relative flex-1 w-full flex items-center">
                <Search className="absolute left-3.5 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  placeholder="Search by keywords, model, or campus block (e.g. MacBook, Titan wallet, Room 204)..."
                  className="w-full rounded-xl pl-11 pr-4 py-2.5 text-sm text-[#17243B] placeholder-slate-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl lpu-btn-primary px-6 py-3 text-sm font-bold text-white shadow-xs hover:bg-[#16A89F] transition-colors shrink-0"
              >
                <span>Search Listings</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Category Shortcuts */}
          <div className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-xs">
            <span className="font-bold text-slate-500 mr-1">Popular categories:</span>
            {[
              'ELECTRONICS',
              'STUDENT_ID_CARDS',
              'WALLETS_PURSE',
              'KEYS',
              'BAGS_BACKPACKS',
            ].map((catKey) => {
              const info = CATEGORY_LABELS[catKey as ItemCategory];
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => handleCategoryClick(catKey as ItemCategory)}
                  className="rounded-xl border border-slate-200 bg-[#F5F8FC] px-3 py-1 font-semibold text-slate-700 hover:border-[#20B5AD] hover:text-[#20B5AD] hover:bg-[#E6F8F7] transition-all"
                >
                  {info?.label || catKey}
                </button>
              );
            })}
          </div>

          {/* Direct Report Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/report?type=LOST"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-[#356DE8] bg-white px-5 py-2.5 text-xs font-bold text-[#356DE8] hover:bg-[#EBF1FD] transition-colors"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Report Lost Belonging</span>
            </Link>
            <Link
              href="/report?type=FOUND"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl lpu-btn-primary px-5 py-2.5 text-xs font-bold shadow-xs hover:bg-[#16A89F] transition-colors"
            >
              <Package className="w-4 h-4" />
              <span>Report Found Belonging</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Pillars: Security, Explainable Matching, Supervised OTP */}
      <section className="py-12 bg-white border-b border-[#E2E8F0]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-slate-200 bg-[#F5F8FC] p-6 space-y-3 hover:border-[#192B4A]/30 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#192B4A]/10 text-[#192B4A] flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#192B4A]">Confidential Item Vaults</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Device serials, student identity card numbers, and identifying marks are encrypted in a zero-trust cryptographic vault. Public listings never expose sensitive proof details.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-[#F5F8FC] p-6 space-y-3 hover:border-[#20B5AD]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#E6F8F7] text-[#20B5AD] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#192B4A]">Verified Custody Desks</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dedicated security checkpoints across all academic blocks, residential hostels, and libraries maintain chain of custody with live digital tracking.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-[#F5F8FC] p-6 space-y-3 hover:border-[#356DE8]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#EBF1FD] text-[#356DE8] flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#192B4A]">Supervised Handover with OTP</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Claims approved by security officers trigger a single-use 6-digit OTP delivered exclusively to the claimant. Property release occurs only after officer OTP confirmation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Public Listings Section */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-2">
            <div>
              <h2 className="text-xl font-bold text-[#192B4A] tracking-tight">
                Recent Campus Property Listings
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Public sanitized reports logged across university blocks and custody desks.
              </p>
            </div>
            <Link
              href="/board"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#20B5AD] hover:text-[#16A89F] hover:underline"
            >
              <span>Explore All Listings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {isLoadingItems && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-2xl border border-slate-200 bg-white p-5 animate-pulse space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-5 bg-slate-200 rounded w-3/4" />
                  <div className="h-12 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {!isLoadingItems && itemsError && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
              <AlertCircle className="mx-auto h-8 w-8 text-amber-700" />
              <p className="text-xs text-amber-800">{itemsError}</p>
              <button
                type="button"
                onClick={fetchItems}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100/50 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {!isLoadingItems && !itemsError && recentItems.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-xs text-slate-500">No active property reports logged at this moment.</p>
              <Link
                href="/report"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#20B5AD] hover:underline"
              >
                Report a lost or found item &rarr;
              </Link>
            </div>
          )}

          {!isLoadingItems && !itemsError && recentItems.length > 0 && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {recentItems.map((item) => (
                <ItemCard key={item.id} item={item} onClaim={handleClaim} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
