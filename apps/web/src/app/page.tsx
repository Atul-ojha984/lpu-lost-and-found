'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  PlusCircle, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  MapPin, 
  ArrowRight, 
  Lock, 
  FileCheck2, 
  KeyRound 
} from 'lucide-react';
import { Navbar } from '@/components/navigation/Navbar';
import { Footer } from '@/components/navigation/Footer';
import { ItemCard } from '@/components/items/ItemCard';
import { DEMO_ITEMS } from '@/lib/mock-data';
import { CATEGORY_LABELS } from '@/lib/constants';
import { ItemCategory } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [heroSearch, setHeroSearch] = useState('');

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

  // Recent 6 demo items
  const recentItems = DEMO_ITEMS.slice(0, 6);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/40">
      <Navbar />

      {/* Hero Section */}
      <section className="relative border-b border-slate-200/80 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50/80 px-3.5 py-1 text-xs font-semibold text-red-800 shadow-2xs mb-6">
            <span className="flex h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            <span>Lovely Professional University • Campus Property Recovery</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Lost something on campus? <br className="hidden sm:inline" />
            <span className="text-red-700">Let&apos;s find it.</span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-5 max-w-2xl text-sm sm:text-base text-slate-600 leading-relaxed">
            The secure, university-focused property recovery network. Report misplaced items, browse sanitized listings across academic blocks, and recover property through verified security custody.
          </p>

          {/* Search Bar Form */}
          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-8 max-w-2xl"
          >
            <div className="flex flex-col sm:flex-row items-center gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-red-600 focus-within:ring-2 focus-within:ring-red-600/20">
              <div className="relative flex-1 w-full flex items-center">
                <Search className="absolute left-3.5 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  placeholder="Search by keywords, model, or campus block (e.g. MacBook, Titan wallet, Room 204)..."
                  className="w-full rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-6 py-3 text-sm font-semibold text-white shadow-xs hover:bg-red-800 transition-colors shrink-0"
              >
                <span>Search Listings</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Category Shortcuts */}
          <div className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-xs">
            <span className="font-semibold text-slate-600 mr-1">Popular:</span>
            {[
              'ELECTRONICS',
              'STUDENT_ID_CARDS',
              'WALLETS_PURSE',
              'BAGS_BACKPACKS',
              'KEYS',
            ].map((catKey) => {
              const cat = CATEGORY_LABELS[catKey as ItemCategory];
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => handleCategoryClick(catKey as ItemCategory)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:border-slate-300 hover:bg-white transition-colors"
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/report?type=LOST"
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-6 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-red-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Report Lost Item</span>
            </Link>

            <Link
              href="/report?type=FOUND"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-800 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Report Found Item</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust & Zero-Trust Architecture Feature Strip */}
      <section className="border-b border-slate-200/80 bg-slate-50 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3.5 rounded-xl border border-slate-200/70 bg-white p-4 shadow-2xs">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-tight">Zero Data Leaks</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  IMEIs, serials, and wallet balances are encrypted in a restricted private vault.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-xl border border-slate-200/70 bg-white p-4 shadow-2xs">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-tight">Explainable Matches</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Automated scoring factoring category, campus zones, time windows, and tags.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-xl border border-slate-200/70 bg-white p-4 shadow-2xs">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-tight">Expiring OTP Handover</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Supervised release requires digital challenge response and one-time code.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-xl border border-slate-200/70 bg-white p-4 shadow-2xs">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-tight">Custody Timeline</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Indelible ledger recording every desk intake, locker movement, and transfer.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Public Listings Section */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
                <Clock className="h-3.5 w-3.5" />
                <span>Live Campus Activity</span>
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Recent Public Listings
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Redacted item summaries across academic blocks, Uni-Mall, and residential zones.
              </p>
            </div>

            <Link
              href="/board"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800 transition-colors"
            >
              <span>Explore All Listings</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Grid of Items */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recentItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/board"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <span>View Full Campus Board ({DEMO_ITEMS.length} Items Listed)</span>
              <ArrowRight className="ml-2 h-4 w-4 text-slate-400" />
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-t border-slate-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-700">
              Recovery Lifecycle
            </h2>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              How the LPU Recovery Platform Works
            </h3>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Designed to stop fraudulent claims and ensure rightful property returns across all campus blocks.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* Step 1 */}
            <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-700 text-sm font-bold text-white mb-4 shadow-xs">
                01
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">File a Report</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Submit public redacted details alongside private identifying marks stored in the encrypted vault.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white mb-4 shadow-xs">
                02
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Algorithmic Matching</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                The engine evaluates category, campus zone proximity, and timestamps to notify potential matches.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white mb-4 shadow-xs">
                03
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Security Verification</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Claimants provide challenge answers and proof. Campus security officers review evidence without bias.
              </p>
            </div>

            {/* Step 4 */}
            <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white mb-4 shadow-xs">
                04
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Supervised Handover</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Collect in person at the assigned security post using a single-use expiring OTP and student ID.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Campus Security Posts Map Callout */}
      <section className="border-t border-slate-200/80 bg-slate-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700">
                <MapPin className="h-4 w-4" />
                <span>Physical Custody Desks</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                Need to hand over a found item in person?
              </h3>
              <p className="max-w-xl text-xs text-slate-600 leading-relaxed">
                Security posts at Gate 1, Gate 2, Uni-Mall, Central Library, and Block 38 are equipped with secure storage lockers and digital intake terminals.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/security"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
              >
                <span>View Security Posts</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
