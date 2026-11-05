'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Menu, 
  X, 
  PlusCircle, 
  Bell, 
  User as UserIcon, 
  LogOut, 
  Search, 
  ShieldCheck, 
  ChevronDown,
  ClipboardCheck,
  CheckCircle2
} from 'lucide-react';
import { Sidebar } from '@/components/navigation/Sidebar';
import { LPULogo } from '@/components/branding/LPULogo';
import { apiClient } from '@/lib/api-client';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  role?: 'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN' | 'SYSTEM_ADMIN';
  actionButton?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  title,
  subtitle,
  role = 'STUDENT_STAFF',
  actionButton,
}) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let isMounted = true;
    apiClient.getCurrentUser()
      .then((data) => {
        if (!isMounted) return;
        const u = data?.user || data;
        if (u && (u.id || u._id || u.email)) {
          const userRole = u.role || 'STUDENT_STAFF';
          const isSecurity = userRole === 'SECURITY_PERSONNEL';
          const isAdmin = userRole === 'CAMPUS_ADMIN' || userRole === 'SYSTEM_ADMIN';

          // Strictly enforce RBAC by path
          if (pathname.startsWith('/admin') && !isAdmin) {
            router.replace(isSecurity ? '/security' : '/dashboard');
            return;
          }
          if (pathname.startsWith('/security') && !isSecurity && !isAdmin) {
            router.replace('/dashboard');
            return;
          }

          setCurrentUser(u);
          setIsCheckingAuth(false);
        } else {
          // Unauthenticated: redirect to login
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      });

    return () => {
      isMounted = false;
    };
  }, [pathname, router]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // ignore
    }
    router.push('/login');
  };

  const getProfileLink = () => {
    const r = currentUser?.role || role;
    if (r === 'SECURITY_PERSONNEL') return '/security/profile';
    return '/dashboard/profile';
  };

  const activeRoleLabel = 
    (currentUser?.role || role) === 'SECURITY_PERSONNEL'
      ? 'Security Officer'
      : (currentUser?.role || role) === 'CAMPUS_ADMIN' || (currentUser?.role || role) === 'SYSTEM_ADMIN'
      ? 'Administrator'
      : 'Student / Campus User';

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <LPULogo size="md" showSubtitle={false} />
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#F58220]/30 border-t-[#F58220] rounded-full animate-spin" />
            <span className="text-xs font-semibold text-[#283442]">Verifying portal access permissions...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-dashboard-shell flex min-h-screen bg-[#F5F5F5] text-[#17243B]">
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar currentRole={currentUser?.role || role} />
      </div>

      {/* Mobile Slide-over Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#283442]/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
            <div className="absolute right-3 top-4 z-10">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar
              currentRole={currentUser?.role || role}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* =========================================================================
            SHARED HEADER
            - Uploaded logo & Lost & Found Management branding
            - Relevant notifications in teal/navy
            - Authenticated user's name and profile menu in the top-right corner
            - Profile and Sign Out actions
            ========================================================================= */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#E2E8F0] bg-white px-4 sm:px-6 lg:px-8 shadow-xs">
          {/* Left: Mobile Toggle & Page Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-xl p-2 text-slate-600 hover:bg-[#F5F5F5] lg:hidden focus:outline-none"
              aria-label="Open mobile navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <div className="flex lg:hidden">
              <LPULogo size="sm" showSubtitle={false} />
            </div>

            <div className="hidden sm:block">
              <h1 className="text-sm sm:text-base font-bold text-[#283442] tracking-tight">{title}</h1>
              {subtitle && <p className="text-[11px] text-slate-500 leading-tight">{subtitle}</p>}
            </div>
          </div>

          {/* Right Header Controls: Search, Notifications, Profile Menu, Action Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/board"
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-[#F5F5F5] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white hover:border-[#F58220]/40 transition-colors"
            >
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span>Public Board</span>
            </Link>

            {/* Notifications Menu */}
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative rounded-xl p-2 text-slate-600 hover:bg-[#F5F5F5] hover:text-[#F58220] transition-colors focus:outline-none"
                aria-label="View notifications"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#F58220] ring-2 ring-white" />
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white shadow-xl border border-slate-200 p-4 z-50 animate-fade-in">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#283442]">
                      Recovery Notifications
                    </span>
                    <span className="text-[10px] font-bold text-[#F58220] bg-[#FFF1E6] px-2 py-0.5 rounded-full">
                      2 Unread
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 mt-2 text-xs">
                    <div className="py-2.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[#16876A] font-semibold text-[11px]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Claim Approved • Handover Ready</span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-tight">
                        Your claim for Casio Scientific Calculator was approved at Block 38 Security Desk.
                      </p>
                      <span className="text-[10px] text-slate-400">15m ago</span>
                    </div>

                    <div className="py-2.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[#356DE8] font-semibold text-[11px]">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        <span>Custody Intake Logged</span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-tight">
                        Security Desk updated custody status for recent campus property.
                      </p>
                      <span className="text-[10px] text-slate-400">1h ago</span>
                    </div>
                  </div>

                  <Link
                    href="/dashboard/my-reports"
                    onClick={() => setNotificationsOpen(false)}
                    className="mt-3 block text-center rounded-xl bg-[#F5F5F5] py-1.5 text-[11px] font-bold text-[#F58220] hover:bg-[#FFF1E6] transition-colors"
                  >
                    View All Activity
                  </Link>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 sm:px-2.5 sm:py-1.5 hover:bg-[#F5F5F5] transition-colors focus:outline-none"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#283442] text-xs font-bold text-white">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-bold text-[#283442] max-w-[130px] truncate leading-tight">
                    {currentUser?.fullName || 'Campus User'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium leading-tight">
                    {activeRoleLabel}
                  </span>
                </div>
                <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-slate-400" />
              </button>

              {/* Profile Dropdown */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-xl border border-slate-200 p-3 z-50 animate-fade-in">
                  <div className="p-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-[#283442]">
                      {currentUser?.fullName || 'Campus User'}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      {currentUser?.email || 'user@lpu.in'}
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-[#F58220] bg-[#FFF1E6] px-2 py-0.5 rounded-md">
                      {activeRoleLabel}
                    </span>
                  </div>

                  <div className="py-1">
                    <Link
                      href={getProfileLink()}
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F5F5F5] hover:text-[#F58220] transition-colors"
                    >
                      <UserIcon className="h-3.5 w-3.5 text-slate-400" />
                      <span>My Profile</span>
                    </Link>

                    {((currentUser?.role || role) === 'CAMPUS_ADMIN' || (currentUser?.role || role) === 'SYSTEM_ADMIN') && (
                      <Link
                        href="/admin/audit"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F5F5F5] transition-colors"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span>Security Audit Trail</span>
                      </Link>
                    )}
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors text-left"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action Button */}
            {actionButton || (
              <Link
                href="/report"
                className="inline-flex items-center gap-1.5 rounded-xl lpu-btn-primary px-3.5 py-1.5 text-xs font-bold shadow-xs hover:bg-[#E66F00] transition-colors"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Report Item</span>
                <span className="sm:hidden">Report</span>
              </Link>
            )}
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="portal-dashboard-content mx-auto max-w-6xl space-y-6">
            {/* Header for small screens */}
            <div className="sm:hidden">
              <h1 className="text-base font-bold text-[#283442] tracking-tight">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
