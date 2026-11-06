'use client';

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  User, 
  Save
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

export default function SecurityProfilePage() {
  const [officer, setOfficer] = useState({
    fullName: 'Rajesh Verma',
    badgeId: 'LPU-SEC-001',
    email: 'rajesh.verma.sec@lpu.in',
    phone: '',
    assignedPost: 'Gate 1 Main Security Desk',
    shift: 'General Duty (08:00 – 17:00 IST)',
    stationExtension: 'Ext. 2018 (Control Room)',
  });
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    apiClient.getCurrentUser()
      .then((data) => {
        const u = data?.user || data;
        if (u) {
          setOfficer((prev) => ({
            ...prev,
            fullName: u.fullName || prev.fullName,
            badgeId: u.registrationNumber || prev.badgeId,
            email: u.email || prev.email,
            phone: u.phone ?? '',
            assignedPost: u.securityPost || prev.assignedPost,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <DashboardLayout
      title="Security Officer Profile"
      subtitle="Operational badge credentials, custody authorization levels, and station assignment."
      role="SECURITY_PERSONNEL"
    >
      <div className="max-w-4xl space-y-6">
        {/* Officer Credentials Badge */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#EBF1FD] border border-[#356DE8]/30 text-[#356DE8] flex items-center justify-center text-xl font-black">
              SEC
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#283442]">{officer.fullName}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF1FD] px-2 py-0.5 text-[10px] font-bold text-[#356DE8] border border-[#356DE8]/20">
                  <Shield className="w-3 h-3" />
                  Authorized Custody Officer
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Officer Badge: <strong>{officer.badgeId}</strong>
              </p>
              <p className="text-xs text-slate-500 font-mono">
                {officer.assignedPost}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-6 text-xs text-slate-500">
            <div>
              <span className="block font-bold text-slate-800 text-sm">48</span>
              <span>Intakes Logged</span>
            </div>
            <div className="h-8 w-px bg-slate-200 mx-2" />
            <div>
              <span className="block font-bold text-emerald-700 text-sm">34</span>
              <span>Handovers Executed</span>
            </div>
          </div>
        </div>

        {savedNotice && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Station contact extension updated.</span>
          </div>
        )}

        {/* Station Details Form */}
        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-[#283442]">Custody Post &amp; Shift Assignment</h3>
            <p className="text-xs text-slate-500">Assigned security desk responsible for property intake and OTP claim verification.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Officer Legal Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={officer.fullName}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 py-2.5 text-xs font-medium text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Badge Number (System Identifier)
              </label>
              <div className="relative">
                <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={officer.badgeId}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 py-2.5 text-xs font-mono font-medium text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Assigned Security Checkpoint
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={officer.assignedPost}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 py-2.5 text-xs font-medium text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Desk Intercom / Telephone Extension
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={officer.stationExtension}
                  onChange={(e) => setOfficer({ ...officer, stationExtension: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-[#F5F5F5] pl-10 pr-4 py-2.5 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#F58220] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FFF1E6] border border-[#F58220]/25 text-xs space-y-1">
            <span className="font-bold text-[#283442] block">Vault Authorization Matrix:</span>
            <p className="text-slate-600 leading-relaxed">
              This officer account is authorized for <strong>Level-2 Vault Decryption</strong> to cross-examine high-risk identifiers (IMEIs, serial numbers, engraved names) against claimant responses.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl lpu-btn-primary px-5 py-2.5 text-xs font-bold shadow-xs hover:bg-[#E66F00] transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Update Station Details</span>
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
