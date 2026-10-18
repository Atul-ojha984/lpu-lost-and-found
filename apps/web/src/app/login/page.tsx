'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { FormField } from '@/components/ui/FormField';

import { apiClient, ApiClientError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please provide your registered LPU email or student ID.');
      return;
    }
    if (!password) {
      setError('Please provide your account password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await apiClient.login({
        emailOrRegNo: email.trim(),
        password,
      });

      // Check for redirect param
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const redirectTarget = urlParams?.get('redirect');

      if (redirectTarget && redirectTarget.startsWith('/')) {
        router.push(redirectTarget);
        return;
      }

      // Route based on authenticated role
      const role = res.user?.role;
      if (role === 'SECURITY_PERSONNEL') {
        router.push('/security');
      } else if (role === 'CAMPUS_ADMIN' || role === 'SYSTEM_ADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to authenticate. Please check your credentials or network connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoFill = (role: 'student' | 'security' | 'admin') => {
    if (role === 'student') {
      setEmail('aarav.sharma.12108@lpu.in');
      setPassword('DemoStudent2026!');
      setDemoNotice('Populated demo Student credentials (Aarav Sharma - CSE).');
    } else if (role === 'security') {
      setEmail('rajesh.verma.sec@lpu.in');
      setPassword('DemoSecurity2026!');
      setDemoNotice('Populated demo Campus Security credentials (Gate 1 Post).');
    } else {
      setEmail('sunita.admin@lpu.in');
      setPassword('DemoAdmin2026!');
      setDemoNotice('Populated demo Campus Administrator credentials (DSW Office).');
    }
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <Link href="/" className="inline-flex items-center justify-center focus-visible:outline-none mb-6">
          <LPULogo size="md" showSubtitle={true} />
        </Link>

        <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Sign in to your Campus Portal
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Enter your university credentials to manage reports and track claims.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
          {/* Demo Persona Quick-Fill Selector */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
            <span className="font-semibold text-slate-700 block mb-2">
              Explore Demo Personas:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickDemoFill('student')}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemoFill('security')}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
              >
                Security
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemoFill('admin')}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                Admin
              </button>
            </div>
            {demoNotice && (
              <p className="mt-2 text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                {demoNotice}
              </p>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              id="login-email"
              label="University Email / Registration No."
              required
              helperText="E.g., 12108492 or name@lpu.in"
            >
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student.12108@lpu.in"
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                  disabled={isLoading}
                />
              </div>
            </FormField>

            <FormField id="login-password" label="Account Password" required>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-red-700 focus:ring-red-600"
                />
                <span>Remember this terminal</span>
              </label>

              <a
                href="#forgot-password"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Password recovery: Please contact university IT support or your department coordinator.');
                }}
                className="font-medium text-red-700 hover:text-red-800"
              >
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-red-800 transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              {isLoading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Registration Link */}
          <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            <span>First time using the recovery platform? </span>
            <Link
              href="/register"
              className="font-semibold text-red-700 hover:text-red-800 transition-colors"
            >
              Register student account
            </Link>
          </div>
        </div>

        {/* Prototype Architecture Notice */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white/70 p-3 text-center text-[11px] text-slate-500">
          <p>
            <strong>Prototype Note:</strong> Simulates client-side authentication and role-based routing. Backend HttpOnly JWT cookie sessions will connect in Phase 2.
          </p>
        </div>
      </div>
    </div>
  );
}
