'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, PlusCircle, Search } from 'lucide-react';
import { Sidebar } from '@/components/navigation/Sidebar';
import { LPULogo } from '@/components/branding/LPULogo';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  role?: 'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN';
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
  const [activeRole, setActiveRole] = useState<'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN'>(role);

  return (
    <div className="flex min-h-screen bg-slate-50/70 text-slate-900">
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar
          currentRole={activeRole}
          onRoleChange={setActiveRole}
        />
      </div>

      {/* Mobile Slide-over Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
            <div className="absolute right-3 top-4">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar
              currentRole={activeRole}
              onRoleChange={setActiveRole}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/90 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <div className="flex lg:hidden">
              <LPULogo size="sm" showSubtitle={false} />
            </div>

            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/board"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span>Public Board</span>
            </Link>

            {actionButton || (
              <Link
                href="/report"
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-800 transition-colors"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Report Item</span>
              </Link>
            )}
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* Header for small screens */}
            <div className="sm:hidden">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
