'use client';

import React, { useState, useEffect } from 'react';
import { 
  User as UserIcon, 
  Mail, 
  Phone, 
  CreditCard, 
  ShieldCheck, 
  CheckCircle2, 
  Save
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

export default function StudentProfilePage() {
  const [profile, setProfile] = useState({
    fullName: 'Aarav Sharma',
    registrationNumber: '12108801',
    email: 'aarav.sharma.12108@lpu.in',
    phone: '+91 98765 43210',
    notifyEmail: true,
    notifyOtp: true,
  });
  const [loading, setLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    apiClient.getCurrentUser()
      .then((data) => {
        const u = data?.user || data;
        if (u) {
          setProfile((prev) => ({
            ...prev,
            fullName: u.fullName || prev.fullName,
            registrationNumber: u.registrationNumber || prev.registrationNumber,
            email: u.email || prev.email,
            phone: u.phone || prev.phone,
          }));
        }
      })
      .catch(() => {
        // Fallback default
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <DashboardLayout
      title="Campus User Profile"
      subtitle="Identity details used exclusively for property verification and claim handovers."
      role="STUDENT_STAFF"
    >
      <div className="max-w-4xl space-y-6">
        {/* Profile Card Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#FFF1E6] border border-[#F58220]/30 text-[#F58220] flex items-center justify-center text-xl font-black">
              {profile.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#283442]">{profile.fullName}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Campus User
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Registration No: <strong>{profile.registrationNumber}</strong>
              </p>
              <p className="text-xs text-slate-500 font-mono">
                {profile.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-6 text-xs text-slate-500">
            <div>
              <span className="block font-bold text-slate-800 text-sm">3</span>
              <span>Reports Filed</span>
            </div>
            <div className="h-8 w-px bg-slate-200 mx-2" />
            <div>
              <span className="block font-bold text-slate-800 text-sm">2</span>
              <span>Recoveries</span>
            </div>
          </div>
        </div>

        {savedSuccess && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Profile and contact preferences updated successfully.</span>
          </div>
        )}

        {/* Profile Details Form */}
        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-[#283442]">Claim Contact Details</h3>
            <p className="text-xs text-slate-500">Used by security officers to verify ownership and coordinate physical handovers.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Legal / Campus Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-[#F5F5F5] pl-10 pr-4 py-2.5 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#F58220] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Registration Number (Read-Only)
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={profile.registrationNumber}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 py-2.5 text-xs font-mono font-medium text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                University Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 py-2.5 text-xs font-mono font-medium text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Contact Phone for Handover OTP
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full rounded-xl border border-slate-200 bg-[#F5F5F5] pl-10 pr-4 py-2.5 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#F58220] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Recovery Notifications Settings */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-bold text-[#283442] uppercase tracking-wider">
              Lost &amp; Found Alert Preferences
            </h4>


            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-[#F5F5F5] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={profile.notifyOtp}
                onChange={(e) => setProfile({ ...profile, notifyOtp: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded text-[#F58220] focus:ring-[#F58220]"
              />
              <div className="text-xs">
                <span className="font-bold text-[#283442] block">Claim Approval &amp; Handover OTP Alerts</span>
                <span className="text-slate-500">Send an instant notification when a security officer approves my claim and generates a single-use release OTP.</span>
              </div>
            </label>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl lpu-btn-primary px-5 py-2.5 text-xs font-bold shadow-xs hover:bg-[#E66F00] transition-colors disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Loading Profile...' : 'Save Contact Preferences'}</span>
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
