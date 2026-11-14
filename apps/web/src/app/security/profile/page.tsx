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
import { normalizeIndianMobileInput } from '@/lib/indian-mobile';

export default function SecurityProfilePage() {
  const [officer, setOfficer] = useState({
    fullName: '',
    badgeId: '',
    phone: '',
    assignedPost: '',
  });
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    let isMounted = true;

    apiClient.getCurrentUser()
      .then((data) => {
        const u = data?.user || data;
        if (!u) throw new Error('Profile data was unavailable.');
        if (isMounted) {
          setOfficer({
            fullName: u.fullName || '',
            badgeId: u.registrationNumber || '',
            phone: u.phone ?? '',
            assignedPost: u.securityPost || '',
          });
          setProfileLoaded(true);
        }
      })
      .catch(() => {
        if (isMounted) setProfileError('Your profile could not be loaded. Refresh the page and try again.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPhone = normalizeIndianMobileInput(officer.phone);
    if (normalizedPhone === null) {
      setProfileError('Enter a valid 10-digit Indian mobile number.');
      setSavedNotice(false);
      return;
    }

    setSaving(true);
    setProfileError('');
    setSavedNotice(false);
    try {
      const response = await apiClient.updateCurrentUserProfile(normalizedPhone);
      const user = response?.user;
      setOfficer((current) => ({ ...current, phone: user?.phone ?? normalizedPhone }));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (error: unknown) {
      setProfileError(error instanceof Error ? error.message : 'Could not save the contact phone.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="Security Officer Profile"
      subtitle="Operational identity and contact details for the assigned security post."
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
                  Security Personnel
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

        </div>

        {savedNotice && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Contact phone updated successfully.</span>
          </div>
        )}
        {profileError && (
          <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-semibold">
            {profileError}
          </div>
        )}

        {/* Only the contact phone is editable through the existing profile API. */}
        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-[#283442]">Security Contact Details</h3>
            <p className="text-xs text-slate-500">Your identity and assigned post are managed by administrators. Update the contact phone used for recovery coordination.</p>
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
                  value={officer.assignedPost || 'Not assigned'}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 py-2.5 text-xs font-medium text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Contact Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  inputMode="tel"
                  maxLength={20}
                  value={officer.phone}
                  onChange={(e) => setOfficer({ ...officer, phone: e.target.value })}
                  disabled={loading || saving || !profileLoaded}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full rounded-xl border border-slate-200 bg-[#F5F5F5] pl-10 pr-4 py-2.5 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#F58220] focus:outline-none disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FFF1E6] border border-[#F58220]/25 text-xs space-y-1">
            <span className="font-bold text-[#283442] block">Access Control:</span>
            <p className="text-slate-600 leading-relaxed">
              Security access is determined by this account&apos;s server-side permissions. Sensitive ownership details are available only through authorized review workflows.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || saving || !profileLoaded}
              className="inline-flex items-center gap-2 rounded-xl lpu-btn-primary px-5 py-2.5 text-xs font-bold shadow-xs hover:bg-[#E66F00] transition-colors disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Loading Profile...' : saving ? 'Saving...' : 'Save Contact Phone'}</span>
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
