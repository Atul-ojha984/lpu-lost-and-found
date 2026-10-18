import React from 'react';
import Link from 'next/link';
import { ShieldCheck, MapPin } from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { DISCLAIMER_TEXT } from '@/lib/constants';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center">
              <LPULogo size="sm" showSubtitle={false} className="brightness-200" />
            </div>
            <p className="max-w-md text-xs text-slate-400 leading-relaxed">
              A privacy-conscious campus recovery system for Lovely Professional University. 
              Safeguarding misplaced property across academic blocks, residential hostels, and student commercial hubs with verified custody and explainable matching.
            </p>

            <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-3 text-xs text-slate-300">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed text-slate-300">
                  <strong>Zero-Leak Guarantee:</strong> Private identifiers (IMEIs, serial numbers, engraved texts) are encrypted in a zero-trust vault. Only verified security officers access item specifics during claim processing.
                </span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Campus Platform
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link href="/board" className="hover:text-white transition-colors">
                  Public Search Board
                </Link>
              </li>
              <li>
                <Link href="/report" className="hover:text-white transition-colors">
                  Report Misplaced Item
                </Link>
              </li>
              <li>
                <Link href="/dashboard/matches" className="hover:text-white transition-colors">
                  Automated Match Suggestions
                </Link>
              </li>
              <li>
                <Link href="/security" className="hover:text-white transition-colors">
                  Security Check-in Desks
                </Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-white transition-colors">
                  Administrative Governance
                </Link>
              </li>
            </ul>
          </div>

          {/* Major Campus Desks */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Campus Custody Hubs
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>Central Library Helpdesk (Ground Fl.)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>Uni-Mall Post #2 (Near Food Court)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>Block 38 Academic Support Desk</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>Gate 1 &amp; Gate 2 Main Security Posts</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>Shanti Devi Sports Complex Desk</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer & Bottom Bar */}
        <div className="mt-10 border-t border-slate-800 pt-6">
          <p className="text-[11px] text-slate-400 leading-normal text-center sm:text-left">
            {DISCLAIMER_TEXT}
          </p>

          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
            <span>
              &copy; 2026 LPU Lost &amp; Found Platform. Designed for campus property recovery.
            </span>
            <div className="flex items-center gap-4 text-xs">
              <span className="font-mono text-slate-400">v1.0.0 (Phase 1 Frontend)</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
