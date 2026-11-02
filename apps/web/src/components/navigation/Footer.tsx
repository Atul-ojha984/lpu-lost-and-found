import React from 'react';
import Link from 'next/link';
import { ShieldCheck, MapPin } from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { DISCLAIMER_TEXT } from '@/lib/constants';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-[#192B4A] bg-[#192B4A] text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center">
              <LPULogo size="sm" showSubtitle={true} inverted={true} />
            </div>
            <p className="max-w-md text-xs text-slate-300 leading-relaxed">
              Campus Property Recovery Platform for Lovely Professional University. 
              Safeguarding misplaced property across campus blocks, residential hostels, and student zones with verified security custody and supervised handovers.
            </p>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-xs text-slate-300 backdrop-blur-sm">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#20B5AD] shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed text-slate-300">
                  <strong className="text-white">Confidential Item Identification:</strong> Private identifiers (device serials, IDs, lock screen details) are encrypted in a zero-trust cryptographic vault. Only authorized security officers view decrypted details during physical claim verification.
                </span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Recovery Navigation
            </h4>
            <ul className="space-y-2 text-xs text-slate-300">
              <li>
                <Link href="/board" className="hover:text-[#20B5AD] transition-colors">
                  Public Search Board
                </Link>
              </li>
              <li>
                <Link href="/report?type=LOST" className="hover:text-[#20B5AD] transition-colors">
                  Report Lost Property
                </Link>
              </li>
              <li>
                <Link href="/report?type=FOUND" className="hover:text-[#20B5AD] transition-colors">
                  Report Found Property
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-[#20B5AD] transition-colors">
                  Student Portal
                </Link>
              </li>
              <li>
                <Link href="/dashboard/my-reports" className="hover:text-[#20B5AD] transition-colors">
                  My Reports &amp; Claims
                </Link>
              </li>
              <li>
                <Link href="/dashboard/history" className="hover:text-[#20B5AD] transition-colors">
                  Recovery History
                </Link>
              </li>
            </ul>
          </div>

          {/* Major Campus Desks */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Campus Custody Desks
            </h4>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#20B5AD] shrink-0" />
                <span>Central Library Helpdesk (Ground Fl.)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#20B5AD] shrink-0" />
                <span>Uni-Mall Post #2 (Near Food Court)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#20B5AD] shrink-0" />
                <span>Block 38 Academic Support Desk</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#20B5AD] shrink-0" />
                <span>Gate 1 &amp; Gate 2 Main Security Posts</span>
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#20B5AD] shrink-0" />
                <span>Shanti Devi Sports Complex Desk</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer & Bottom Bar */}
        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="text-[11px] text-slate-400 leading-normal text-center sm:text-left">
            {DISCLAIMER_TEXT}
          </p>

          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
            <span>
              &copy; 2026 Lovely Professional University • Lost &amp; Found Property Recovery System.
            </span>
            <div className="flex items-center gap-4 text-xs">
              <span className="font-mono text-slate-400">DRF + Next.js Platform</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
