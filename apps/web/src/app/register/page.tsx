'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Mail, 
  Lock, 
  Phone, 
  CreditCard, 
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { apiClient, ApiClientError } from '@/lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: '',
    registrationNumber: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    agreedToTerms: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.fullName.trim() || !formData.registrationNumber.trim() || !formData.email.trim()) {
      setError('Please fill in your name, registration number, and university email.');
      return;
    }

    const rawEmail = formData.email.trim();
    const emailParts = rawEmail.split('@');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail) || emailParts.length !== 2 || emailParts[1].toLowerCase() !== 'lpu.in' || !emailParts[0]) {
      setError('Please register using your @lpu.in email address.');
      return;
    }
    const emailNorm = `${emailParts[0].toLowerCase()}@lpu.in`;

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!formData.agreedToTerms) {
      setError('Please accept the campus property recovery verification terms.');
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.register({
        fullName: formData.fullName.trim(),
        registrationNumber: formData.registrationNumber.trim().toUpperCase(),
        email: emailNorm,
        phone: formData.phone.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });

      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to register campus recovery account. Please check your details.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8 selection:bg-[#20B5AD]/20 selection:text-[#192B4A]">
      {/* Top Branding */}
      <div className="flex flex-col items-center mb-6 text-center">
        <Link href="/" className="inline-block focus:outline-none mb-3">
          <LPULogo size="md" showSubtitle={false} />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black tracking-wider text-[#192B4A] uppercase">
            LOST &amp; FOUND
          </span>
          <span className="text-xs font-bold tracking-widest text-[#20B5AD] uppercase">
            MANAGEMENT SYSTEM
          </span>
        </div>
      </div>

      {/* Main White Registration Card */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-[0_10px_30px_rgba(25,43,74,0.06)] border border-[#E2E8F0] p-7 sm:p-9 relative z-10">
        <div className="text-left mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-[#192B4A] tracking-tight">
            Register Recovery Account
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Create an authenticated campus user account to file property reports and receive collection OTPs.
          </p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900 animate-fade-in" role="alert">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#192B4A] uppercase tracking-wider mb-1.5">
              Full Legal / Campus Name *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Aarav Sharma"
                required
                disabled={isLoading}
                className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-xs font-medium lpu-portal-input focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#192B4A] uppercase tracking-wider mb-1.5">
                Registration Number *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                  <CreditCard className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={formData.registrationNumber}
                  onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                  placeholder="e.g. 12108801"
                  required
                  disabled={isLoading}
                  className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-xs font-medium lpu-portal-input focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192B4A] uppercase tracking-wider mb-1.5">
                University Email *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="student.12108@lpu.in"
                  required
                  disabled={isLoading}
                  className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-xs font-medium lpu-portal-input focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192B4A] uppercase tracking-wider mb-1.5">
              Contact Phone (for Handover OTP alerts)
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                disabled={isLoading}
                className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-xs font-medium lpu-portal-input focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#192B4A] uppercase tracking-wider mb-1.5">
                Password *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 8 characters"
                  required
                  disabled={isLoading}
                  className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-xs font-medium lpu-portal-input focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192B4A] uppercase tracking-wider mb-1.5">
                Confirm Password *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Repeat password"
                  required
                  disabled={isLoading}
                  className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-xs font-medium lpu-portal-input focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600 leading-normal select-none">
              <input
                type="checkbox"
                checked={formData.agreedToTerms}
                onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#20B5AD] focus:ring-[#20B5AD]"
              />
              <span className="text-[11px]">
                I agree that all property reports and ownership claims submitted through my university registration are truthful and subject to campus property recovery verification.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-bold text-white lpu-btn-primary disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20B5AD] transition-all"
          >
            {isLoading ? (
              <span>Registering Account...</span>
            ) : (
              <>
                <span>Create Recovery Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-500">
          <span>Already registered? </span>
          <Link
            href="/login"
            className="font-bold text-[#20B5AD] hover:text-[#16A89F] hover:underline"
          >
            Log in to Lost &amp; Found
          </Link>
        </div>
      </div>
    </div>
  );
}
