'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Menu, 
  X, 
  PlusCircle, 
  LogIn,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Search
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { apiClient } from '@/lib/api-client';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    apiClient.getCurrentUser()
      .then((data) => {
        const u = data?.user || data;
        if (u && (u.id || u._id || u.email)) {
          setCurrentUser(u);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null));
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // ignore
    }
    setCurrentUser(null);
    router.push('/login');
  };

  const userRole = currentUser?.role;
  const isSecurity = userRole === 'SECURITY_PERSONNEL';
  const isAdmin = userRole === 'CAMPUS_ADMIN' || userRole === 'SYSTEM_ADMIN';

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/board', label: 'Public Board' },
    { href: '/report', label: 'Report Item' },
  ];

  if (currentUser) {
    if (isAdmin) {
      navLinks.push({ href: '/admin', label: 'Admin Dashboard' });
      navLinks.push({ href: '/security', label: 'Security Desk' });
      navLinks.push({ href: '/dashboard', label: 'Student View' });
    } else if (isSecurity) {
      navLinks.push({ href: '/security', label: 'Security Desk' });
    } else {
      navLinks.push({ href: '/dashboard', label: 'My Portal' });
    }
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md shadow-2xs">
      {/* Top Banner Strip */}
      <div className="bg-[#192B4A] border-b border-[#22395D] px-4 py-1.5 text-center text-[11px] text-white/90">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-[#20B5AD] shrink-0" />
          <span>
            <strong className="text-white">Campus Property Recovery Network:</strong> Official Lost &amp; Found management portal for Lovely Professional University.
          </span>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo with Custom Wordmark */}
        <Link href="/" className="flex items-center gap-2 focus:outline-none">
          <LPULogo size="sm" showSubtitle={true} wordmarkVariant="stacked-system" />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-1.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold tracking-tight transition-colors ${
                isActive(link.href)
                  ? 'bg-[#E6F8F7] text-[#0E706A] font-bold border border-[#20B5AD]/25'
                  : 'text-slate-600 hover:bg-[#F5F8FC] hover:text-[#192B4A]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Action Buttons */}
        <div className="hidden sm:flex items-center gap-2.5">
          <Link
            href="/board"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-[#F5F8FC] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white hover:border-[#20B5AD]/40 hover:text-[#192B4A] transition-colors"
          >
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <span>Search Board</span>
          </Link>

          <Link
            href="/report"
            className="inline-flex items-center gap-1.5 rounded-xl lpu-btn-primary px-3.5 py-2 text-xs font-bold text-white transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Report Item</span>
          </Link>

          {currentUser ? (
            <div className="flex items-center gap-2 pl-1 border-l border-slate-200">
              <Link
                href={
                  currentUser.role === 'SECURITY_PERSONNEL'
                    ? '/security'
                    : currentUser.role === 'CAMPUS_ADMIN' || currentUser.role === 'SYSTEM_ADMIN'
                    ? '/admin'
                    : '/dashboard'
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#E6F8F7] border border-[#20B5AD]/30 px-2.5 py-1.5 text-xs font-bold text-[#0E706A]"
              >
                <UserIcon className="h-3.5 w-3.5 text-[#20B5AD]" />
                <span className="max-w-[120px] truncate">{currentUser.fullName || currentUser.email}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#192B4A]/20 bg-white px-3.5 py-2 text-xs font-bold text-[#192B4A] hover:bg-[#F5F8FC] hover:border-[#20B5AD] hover:text-[#20B5AD] transition-colors"
            >
              <LogIn className="h-3.5 w-3.5 text-[#20B5AD]" />
              <span>Login</span>
            </Link>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/report"
            className="rounded-xl lpu-btn-primary p-2 text-white"
            aria-label="Report Item"
          >
            <PlusCircle className="h-4 w-4" />
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="rounded-xl p-2 text-slate-600 hover:bg-[#F5F8FC] focus:outline-none"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white p-4 space-y-2 animate-fade-in">
          <nav className="flex flex-col space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                  isActive(link.href)
                    ? 'bg-[#E6F8F7] text-[#0E706A]'
                    : 'text-slate-600 hover:bg-[#F5F8FC]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {currentUser ? (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-50 py-2.5 text-xs font-bold text-rose-700"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out ({currentUser.fullName || currentUser.email})</span>
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl lpu-btn-primary py-2.5 text-xs font-bold text-white text-center"
              >
                <LogIn className="h-4 w-4" />
                <span>Login to Portal</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
