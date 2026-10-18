'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Mail, 
  Lock, 
  Hash, 
  Building, 
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { FormField } from '@/components/ui/FormField';
import { apiClient, ApiClientError } from '@/lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: '',
    registrationNumber: '',
    email: '',
    department: 'School of Computer Science & Engineering',
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
      setError('Please fill in all mandatory university details.');
      return;
    }

    if (!formData.email.endsWith('@lpu.in') && !formData.email.endsWith('@lpu.co.in')) {
      setError('Please use your official university email domain (@lpu.in or @lpu.co.in).');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!formData.agreedToTerms) {
      setError('Please accept the campus property recovery code of conduct.');
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.register({
        fullName: formData.fullName.trim(),
        registrationNumber: formData.registrationNumber.trim(),
        email: formData.email.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        department: formData.department,
      });

      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to register campus account. Please check your details or network connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center justify-center focus-visible:outline-none mb-6">
          <LPULogo size="md" showSubtitle={true} />
        </Link>

        <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Register Student / Staff Account
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Create an authenticated recovery profile with your official LPU identity.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField id="reg-name" label="Full Name" required>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="reg-name"
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Aarav Sharma"
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                  disabled={isLoading}
                />
              </div>
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="reg-id" label="Registration / Employee No." required>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-id"
                    type="text"
                    value={formData.registrationNumber}
                    onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                    placeholder="12108492"
                    className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    disabled={isLoading}
                  />
                </div>
              </FormField>

              <FormField id="reg-email" label="University Email" required>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="name@lpu.in"
                    className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    disabled={isLoading}
                  />
                </div>
              </FormField>
            </div>

            <FormField id="reg-dept" label="School / Faculty" required>
              <div className="relative">
                <Building className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  id="reg-dept"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                  disabled={isLoading}
                >
                  <option value="School of Computer Science & Engineering">School of Computer Science &amp; Engineering</option>
                  <option value="School of Mechanical Engineering">School of Mechanical Engineering</option>
                  <option value="Mittal School of Business">Mittal School of Business</option>
                  <option value="School of Bioengineering & Biosciences">School of Bioengineering &amp; Biosciences</option>
                  <option value="School of Law">School of Law</option>
                  <option value="Campus Security & Staff">Campus Security &amp; Administrative Staff</option>
                </select>
              </div>
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="reg-pass" label="Password" required helperText="At least 8 chars">
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-pass"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    disabled={isLoading}
                  />
                </div>
              </FormField>

              <FormField id="reg-confirm-pass" label="Confirm Password" required>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="reg-confirm-pass"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    disabled={isLoading}
                  />
                </div>
              </FormField>
            </div>

            <div className="pt-1">
              <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-600 leading-normal">
                <input
                  type="checkbox"
                  checked={formData.agreedToTerms}
                  onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                  className="rounded border-slate-300 text-red-700 focus:ring-red-600 mt-0.5"
                />
                <span>
                  I certify that all property reports and ownership claims submitted by my account are truthful and subject to campus disciplinary policies.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-red-800 transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              {isLoading ? (
                <span>Registering Account...</span>
              ) : (
                <>
                  <span>Create Campus Account</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            <span>Already have an account? </span>
            <Link
              href="/login"
              className="font-semibold text-red-700 hover:text-red-800 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
