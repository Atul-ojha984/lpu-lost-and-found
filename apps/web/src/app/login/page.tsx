'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ArrowRight, 
  Smartphone, 
  CreditCard, 
  Key, 
  Briefcase, 
  ShieldCheck, 
  Search,
  HelpCircle,
  X
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { apiClient, ApiClientError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [regNo, setRegNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('session_expired') === '1') {
        setError('Your session has expired. Please sign in again with your credentials.');
      }
    }
  }, []);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);

    const query = regNo.trim();
    if (!query) {
      setError('Please provide your Registration Number or university ID.');
      return;
    }
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await apiClient.login({
        emailOrRegNo: query,
        registration_number: query,
        password,
      });

      const role = res.user?.role;
      const isSecurity = role === 'SECURITY_PERSONNEL';
      const isAdmin = role === 'CAMPUS_ADMIN' || role === 'SYSTEM_ADMIN';

      // Check safe redirect URL parameter if present
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const redirectTarget = urlParams?.get('redirect');

      if (
        redirectTarget &&
        redirectTarget.startsWith('/') &&
        !redirectTarget.startsWith('//') &&
        !redirectTarget.includes('\\')
      ) {
        if (redirectTarget.startsWith('/admin') && !isAdmin) {
          // Student/Security cannot access admin redirect
        } else if (redirectTarget.startsWith('/security') && !isSecurity && !isAdmin) {
          // Student cannot access security redirect
        } else {
          router.push(redirectTarget);
          return;
        }
      }

      // Route strictly based on backend-authenticated role
      if (isSecurity) {
        router.push('/security');
      } else if (isAdmin) {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.errorCode === 'NETWORK_ERROR' || err.statusCode === 0) {
          setError(
            'Cannot reach the authentication service at http://localhost:8000. Please ensure the Django backend server is running.'
          );
        } else if (err.statusCode >= 500) {
          setError(
            `Authentication service error (${err.statusCode}). Please try again later or contact campus administration.`
          );
        } else if (err.statusCode === 400 || err.statusCode === 401) {
          setError(
            err.message && !err.message.toLowerCase().includes('token not valid')
              ? err.message
              : 'Invalid credentials provided. Please check your registration number and password.'
          );
        } else {
          setError(
            err.message && !err.message.toLowerCase().includes('token not valid')
              ? err.message
              : 'Authentication failed. Please verify your details and retry.'
          );
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during authentication. Please retry.');
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="portal-login-page min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#F5F5F5] selection:bg-[#F58220]/20 selection:text-[#283442]">
      {/* =========================================================================
          LEFT BRANDING PANEL
          - Deep Navy to Royal Blue visual treatment
          - Exact uploaded logo with object-contain
          - Lost & Found heading & property recovery service overview
          - Clean glassmorphism feature cards in teal & royal blue accents
          ========================================================================= */}
      <div className="portal-login-brand relative hidden lg:flex lg:col-span-5 xl:col-span-6 flex-col justify-between p-10 xl:p-14 bg-gradient-to-br from-[#283442] via-[#1E355B] to-[#3A4B5E] text-white border-r border-[#283442]/50 overflow-hidden">
        {/* Subtle decorative teal and royal blue ambient glow shapes */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#F58220]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 w-[32rem] h-[32rem] rounded-full bg-[#356DE8]/15 blur-3xl" />
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.05]"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 800 800"
          fill="none"
        >
          <circle cx="700" cy="150" r="280" stroke="#F58220" strokeWidth="2.5" strokeDasharray="8 8" />
          <circle cx="700" cy="150" r="380" stroke="#356DE8" strokeWidth="1.5" />
          <path
            d="M-100 650 Q 200 500 500 700 T 900 600"
            stroke="#F58220"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M-50 720 Q 250 580 550 770 T 950 670"
            stroke="#356DE8"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Top: Uploaded Logo & Headline */}
        <div className="relative z-10">
          <Link href="/" className="inline-block focus:outline-none mb-8">
            <LPULogo size="lg" inverted={false} showSubtitle={false} />
          </Link>

          <div className="mt-4 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F58220]/15 border border-[#F58220]/30 text-[#F58220] text-xs font-semibold tracking-wide uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Campus Property Recovery System</span>
            </div>
            <h1 className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Lost &amp; Found Portal
            </h1>
            <p className="text-sm xl:text-base text-slate-300 max-w-lg leading-relaxed pt-1">
              Report lost belongings, browse found items, and coordinate verified physical handovers across the campus.
            </p>
          </div>
        </div>

        {/* Center: Secure Property Recovery Highlights */}
        <div className="relative z-10 my-8 py-2">
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {/* Feature Card 1 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 transition-all hover:bg-white/10 hover:border-[#F58220]/40">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#F58220]/20 text-[#F58220] flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#F58220] bg-[#F58220]/15 px-2 py-0.5 rounded-full border border-[#F58220]/30">
                  Secured
                </span>
              </div>
              <h3 className="text-xs font-bold text-white">Student Cards &amp; IDs</h3>
              <p className="text-[11px] text-slate-300 mt-0.5">Registration number indexing with encrypted verification.</p>
            </div>

            {/* Feature Card 2 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 transition-all hover:bg-white/10 hover:border-[#356DE8]/40">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#356DE8]/20 text-[#6894FF] flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6894FF] bg-[#356DE8]/15 px-2 py-0.5 rounded-full border border-[#356DE8]/30">
                  Protected
                </span>
              </div>
              <h3 className="text-xs font-bold text-white">Electronics &amp; Devices</h3>
              <p className="text-[11px] text-slate-300 mt-0.5">Private serial number vaults &amp; single-use OTP handovers.</p>
            </div>

            {/* Feature Card 3 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 transition-all hover:bg-white/10 hover:border-[#F58220]/40">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center">
                  <Briefcase className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-semibold text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">
                  Custody Desks
                </span>
              </div>
              <h3 className="text-xs font-bold text-white">Bags &amp; Essentials</h3>
              <p className="text-[11px] text-slate-300 mt-0.5">Centralized custody checkpoints with live tracking.</p>
            </div>

            {/* Feature Card 4 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 transition-all hover:bg-white/10 hover:border-[#356DE8]/40">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#F58220]/20 text-[#F58220] flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-semibold text-[#F58220] bg-[#F58220]/15 px-2 py-0.5 rounded-full">
                  Drop Points
                </span>
              </div>
              <h3 className="text-xs font-bold text-white">Keys &amp; Accessories</h3>
              <p className="text-[11px] text-slate-300 mt-0.5">Categorized by zone, block drop-point, and timestamp.</p>
            </div>
          </div>
        </div>

        {/* Bottom: Campus Recovery Network */}
        <div className="relative z-10 pt-4 border-t border-white/10 text-xs text-slate-300 flex items-center justify-between">
          <span>Campus Property Recovery System</span>
          <span className="font-semibold text-white">LPU Central Security</span>
        </div>
      </div>

      {/* =========================================================================
          RIGHT AUTHENTICATION PANEL
          - Light background (#F5F5F5)
          - Centered white login card with rounded corners and soft shadow
          - Input fields with teal focus ring
          - Primary teal login button (#F58220)
          ========================================================================= */}
      <div className="portal-login-form-panel col-span-1 lg:col-span-7 xl:col-span-6 bg-[#F5F5F5] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 relative min-h-screen">
        {/* Mobile Header Branding for small screens */}
        <div className="lg:hidden w-full max-w-md text-center mb-6">
          <Link href="/" className="inline-block focus:outline-none mb-3">
            <LPULogo size="md" showSubtitle={false} />
          </Link>
          <div className="flex flex-col items-center">
            <span className="text-sm font-extrabold tracking-wider text-[#283442] uppercase">
              LOST &amp; FOUND
            </span>
            <span className="text-xs font-bold tracking-widest text-[#F58220] uppercase">
              MANAGEMENT SYSTEM
            </span>
          </div>
        </div>

        {/* Desktop Right Panel Branding */}
        <div className="hidden lg:flex items-center gap-3.5 mb-7">
          <div className="relative flex items-center">
            <LPULogo size="md" showSubtitle={false} />
          </div>
          <div className="h-10 w-[2px] bg-[#E2E8F0]" />
          <div className="flex flex-col text-left">
            <span className="text-sm font-black tracking-wider text-[#283442] uppercase leading-tight font-sans">
              LOST &amp; FOUND
            </span>
            <span className="text-xs font-extrabold tracking-widest text-[#F58220] uppercase leading-tight">
              MANAGEMENT SYSTEM
            </span>
          </div>
        </div>

        {/* Main White Login Card */}
        <div className="portal-login-card w-full max-w-md bg-white rounded-2xl shadow-[0_10px_30px_rgba(25,43,74,0.06)] border border-[#E2E8F0] p-7 sm:p-9 relative z-10">
          <div className="text-left mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[#283442] tracking-tight">
              Welcome Back
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Sign in to access the Lost &amp; Found portal.
            </p>
          </div>

          {/* Error Message Alert */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900 animate-fade-in" role="alert">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field 1: Registration Number / University ID */}
            <div>
              <label 
                htmlFor="login-regno" 
                className="block text-xs font-bold text-[#283442] uppercase tracking-wider mb-1.5"
              >
                Registration Number
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-regno"
                  type="text"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                  placeholder="e.g. 12108801 or name@lpu.in"
                  disabled={isLoading}
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] pl-10 pr-4 py-2.5 text-sm font-medium lpu-portal-input focus:outline-none"
                />
              </div>
            </div>

            {/* Field 2: Password */}
            <div>
              <label 
                htmlFor="login-password" 
                className="block text-xs font-bold text-[#283442] uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#356DE8]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-[#E2E8F0] pl-10 pr-10 py-2.5 text-sm font-medium lpu-portal-input focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-[#F58220] transition-colors focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Terminal & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1 pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-[#F58220] focus:ring-[#F58220]"
                />
                <span className="font-medium text-[11px]">Remember terminal</span>
              </label>

              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="font-semibold text-[11px] text-[#356DE8] hover:text-[#2756C2] hover:underline focus:outline-none"
              >
                Forgot password?
              </button>
            </div>

            {/* Primary Teal Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-bold text-white lpu-btn-primary disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F58220]"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>


          {/* Public Board & Registration Links */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col gap-2 text-center text-xs text-slate-500">
            <div>
              <span>Need an account? Contact an authorized campus administrator.</span>
            </div>
            <div>
              <Link
                href="/board"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#356DE8] hover:underline"
              >
                <Search className="w-3 h-3" />
                <span>Browse public lost &amp; found board without logging in</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Security & Confidentiality Notice below card */}
        <div className="mt-6 text-center text-[11px] text-slate-500 max-w-sm">
          <p>
            Official University Property Recovery System. All claim adjudications and physical handovers are logged with immutable audit timestamps.
          </p>
        </div>
      </div>

      {/* Forgot Password Recovery Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#FFF1E6] text-[#F58220] flex items-center justify-center">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#283442]">Account Password Recovery</h3>
                <p className="text-xs text-slate-500">Lost &amp; Found Portal Access</p>
              </div>
            </div>
            <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
              <p>
                To maintain physical property security and prevent fraudulent claim submissions, account credential resets require physical verification.
              </p>
              <div className="rounded-xl bg-[#F5F5F5] p-3 border border-slate-200 space-y-1.5">
                <div className="font-semibold text-[#283442]">Verification Options:</div>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>Visit the <strong>Gate 1 Main Security Desk</strong> with your physical Student/Staff ID.</li>
                  <li>Contact the Campus Recovery Desk: <code>lostandfound@lpu.co.in</code>.</li>
                  <li>Or submit an IT support ticket through University Central IT.</li>
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="mt-5 w-full py-2.5 rounded-xl lpu-btn-primary text-xs font-semibold"
            >
              Close Information
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
