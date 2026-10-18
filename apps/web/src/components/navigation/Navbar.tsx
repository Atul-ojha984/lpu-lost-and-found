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
  AlertCircle
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { apiClient } from '@/lib/api-client';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; fullName: string; role: string; email: string } | null>(null);
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

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/board', label: 'Public Board' },
    { href: '/report', label: 'Report Item' },
    { href: '/dashboard', label: 'My Portal' },
    { href: '/security', label: 'Security Desk' },
    { href: '/admin', label: 'Admin' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
      {/* Top Disclaimer Strip */}
      <div className="bg-slate-900 px-4 py-1 text-center text-[11px] text-slate-300">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>
            <strong>Campus Property Recovery Platform:</strong> For Lovely Professional University. Independent campus initiative.
          </span>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded-lg">
          <LPULogo size="sm" showSubtitle={true} />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold tracking-tight transition-colors ${
                isActive(link.href)
                  ? 'bg-red-50 text-red-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Action Buttons */}
        <div className="hidden sm:flex items-center gap-2.5">
          <Link
            href="/report"
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Report Item</span>
          </Link>

          {currentUser ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-800">
                <UserIcon className="h-3.5 w-3.5 text-slate-500" />
                <span className="max-w-[120px] truncate">{currentUser.fullName || currentUser.email}</span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-red-700 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <LogIn className="h-3.5 w-3.5 text-slate-500" />
              <span>Sign In</span>
            </Link>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/report"
            className="rounded-lg bg-red-700 p-2 text-white hover:bg-red-800"
            aria-label="Report Item"
          >
            <PlusCircle className="h-4 w-4" />
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-slate-200 bg-white px-4 pt-2 pb-5 md:hidden space-y-1 shadow-lg animate-fade-in">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${
                isActive(link.href)
                  ? 'bg-red-50 text-red-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{link.label}</span>
            </Link>
          ))}

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {currentUser ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out ({currentUser.fullName || currentUser.email})</span>
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <LogIn className="h-4 w-4" />
                <span>Sign In to Account</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
