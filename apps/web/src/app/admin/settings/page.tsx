'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  Sparkles, 
  CheckCircle2,
  Save
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';

export default function AdminSettingsPage() {
  const [retentionDays, setRetentionDays] = useState('90');
  const [otpExpiryMinutes, setOtpExpiryMinutes] = useState('15');
  const [matchScoreThreshold, setMatchScoreThreshold] = useState('75');
  const [autoExifScrubbing, setAutoExifScrubbing] = useState(true);
  const [vaultEncryption, setVaultEncryption] = useState(true);
  const [smsOtpAlerts, setSmsOtpAlerts] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <DashboardLayout
      title="Platform Governance &amp; Recovery Rules"
      subtitle="Configure statutory property retention, cryptographic vaults, and matching sensitivity."
      role="CAMPUS_ADMIN"
    >
      <div className="max-w-4xl space-y-6">
        {savedSuccess && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Platform operational settings updated successfully.</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Property Retention & Lifecycle */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-[#E6F8F7] text-[#20B5AD] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#192B4A]">Statutory Property Retention Policies</h3>
                <p className="text-xs text-slate-500">Legal holding duration for unclaimed campus property in security custody.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Unclaimed Retention Window (Days)
                </label>
                <input
                  type="number"
                  min="30"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] px-4 py-2.5 text-xs font-bold text-[#17243B] focus:bg-white focus:border-[#20B5AD] focus:outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Items unclaimed after {retentionDays} days transition to statutory audit queue.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Single-Use Handover OTP Validity (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={otpExpiryMinutes}
                  onChange={(e) => setOtpExpiryMinutes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] px-4 py-2.5 text-xs font-bold text-[#17243B] focus:bg-white focus:border-[#20B5AD] focus:outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Claimant collection token expires after {otpExpiryMinutes} minutes for physical security.
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Algorithmic Multi-Factor Matching */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-[#EBF1FD] text-[#356DE8] flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#192B4A]">Heuristic Matching Engine Thresholds</h3>
                <p className="text-xs text-slate-500">Cross-zone correlation parameters between lost reports and found items.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700">Minimum Match Confidence Score:</span>
                  <span className="font-mono font-bold text-[#20B5AD]">{matchScoreThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  value={matchScoreThreshold}
                  onChange={(e) => setMatchScoreThreshold(e.target.value)}
                  className="w-full accent-[#20B5AD]"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Alerts are issued to claimants only when category, location proximity, and timestamps score at or above {matchScoreThreshold}%.
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Security & Privacy Vault */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#16876A] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#192B4A]">Zero-Leak Privacy &amp; Cryptography</h3>
                <p className="text-xs text-slate-500">Protection against serial number leaks, lock-screen data exposure, and camera GPS tracking.</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-[#F5F8FC] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={vaultEncryption}
                  onChange={(e) => setVaultEncryption(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#20B5AD] focus:ring-[#20B5AD]"
                />
                <div className="text-xs">
                  <span className="font-bold text-[#192B4A] block">Fernet AES-128 Symmetric Vault Encryption</span>
                  <span className="text-slate-500">Private item identifiers (serial numbers, IMEIs, internal engravings) encrypted at rest in the Django database.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-[#F5F8FC] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={autoExifScrubbing}
                  onChange={(e) => setAutoExifScrubbing(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#20B5AD] focus:ring-[#20B5AD]"
                />
                <div className="text-xs">
                  <span className="font-bold text-[#192B4A] block">Pillow In-Memory EXIF &amp; GPS Scrubber</span>
                  <span className="text-slate-500">Automatically strip embedded GPS coordinates and camera hardware serials from uploaded property photos before saving.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-[#F5F8FC] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={smsOtpAlerts}
                  onChange={(e) => setSmsOtpAlerts(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#20B5AD] focus:ring-[#20B5AD]"
                />
                <div className="text-xs">
                  <span className="font-bold text-[#192B4A] block">Cryptographic Handover Receipts</span>
                  <span className="text-slate-500">Log immutable SHA-256 hashes of physical handover receipts into forensic audit logs.</span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl lpu-btn-primary px-6 py-2.5 text-xs font-bold shadow-xs hover:bg-[#16A89F] transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save Platform Settings</span>
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
