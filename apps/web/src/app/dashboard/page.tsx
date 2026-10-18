'use client';

import React from 'react';
import Link from 'next/link';
import { 
  FileText, 
  HelpCircle, 
  Sparkles, 
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DEMO_ITEMS, DEMO_CLAIMS, DEMO_MATCHES } from '@/lib/mock-data';

export default function StudentDashboardOverview() {
  // Mock student stats
  const activeReports = DEMO_ITEMS.filter((i) => i.reportedByRole === 'STUDENT_STAFF');
  const activeClaims = DEMO_CLAIMS;
  const matchAlerts = DEMO_MATCHES;

  return (
    <DashboardLayout
      title="Student / Staff Property Portal"
      subtitle="Track your reported items, verify active claims, and review match suggestions."
      role="STUDENT_STAFF"
    >
      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              My Active Reports
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{activeReports.length}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="text-emerald-600 font-semibold">1 item</span>
            <span>matched in custody</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Claims Filed
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <HelpCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{activeClaims.length}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="text-amber-600 font-semibold">1 approved</span>
            <span>ready for OTP collection</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Match Engine Alerts
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{matchAlerts.length}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="text-purple-600 font-semibold">92% score</span>
            <span>highest confidence match</span>
          </div>
        </div>
      </div>

      {/* Handover OTP Notice Banner (if any claim approved) */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Action Required • Collection Ready
              </span>
              <h3 className="text-sm font-bold text-emerald-950 mt-0.5">
                Claim Approved: Scientific Calculator Casio fx-991EX
              </h3>
              <p className="text-xs text-emerald-800/90 mt-0.5">
                Present your single-use OTP <strong>849102</strong> and Student ID Card at <strong>Block 38 Security Desk</strong> to collect your item.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/my-claims"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors shrink-0"
          >
            <span>View Handover Pass</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Section: Recent Reports & Potential Matches */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: My Reports */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">My Recent Property Reports</h3>
              <p className="text-xs text-slate-500">Items you logged across campus.</p>
            </div>
            <Link
              href="/dashboard/my-reports"
              className="text-xs font-semibold text-red-700 hover:text-red-800"
            >
              View All
            </Link>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {activeReports.slice(0, 3).map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">{item.referenceNumber}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-800 mt-1 truncate">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate">{item.specificLocation}</p>
                </div>

                <Link
                  href="/board"
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 shrink-0"
                >
                  Details
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Algorithmic Match Suggestions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Automated Match Suggestions</h3>
              <p className="text-xs text-slate-500">Explainable cross-zone algorithm.</p>
            </div>
            <Link
              href="/dashboard/matches"
              className="text-xs font-semibold text-red-700 hover:text-red-800"
            >
              Explore Matches
            </Link>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {matchAlerts.map((match) => (
              <div key={match.id} className="py-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                    <Sparkles className="h-3 w-3" />
                    {match.matchScore}% Match Score ({match.confidence})
                  </span>
                  <span className="text-[10px] text-slate-400">10m ago</span>
                </div>

                <div className="text-xs">
                  <span className="text-slate-500">Your Lost Item: </span>
                  <strong className="text-slate-900">{match.lostItemTitle}</strong>
                  <br />
                  <span className="text-slate-500">Found Candidate: </span>
                  <span className="text-red-700 font-medium">{match.foundItemTitle}</span>
                </div>

                <div className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600 font-mono">
                  {match.explanation.locationProximity} • {match.explanation.timeDelta}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
