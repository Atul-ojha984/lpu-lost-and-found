'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  FileText, 
  HelpCircle, 
  Sparkles, 
  ShieldAlert, 
  ClipboardCheck, 
  Package, 
  Users, 
  BarChart3, 
  LogOut,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';

interface SidebarProps {
  currentRole?: 'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN';
  onRoleChange?: (role: 'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN') => void;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole = 'STUDENT_STAFF',
  onRoleChange,
  onCloseMobile,
}) => {
  const pathname = usePathname();

  const studentLinks = [
    { href: '/dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
    { href: '/dashboard/my-reports', label: 'My Reported Items', icon: FileText },
    { href: '/dashboard/my-claims', label: 'My Submitted Claims', icon: HelpCircle },
    { href: '/dashboard/matches', label: 'Match Suggestions', icon: Sparkles, badge: 'New' },
  ];

  const securityLinks = [
    { href: '/security', label: 'Intake & Reception', icon: ShieldAlert },
    { href: '/security/claims', label: 'Claims Verification', icon: ClipboardCheck, badge: '3 Pending' },
    { href: '/security/custody', label: 'Custody & Handover OTP', icon: Package },
  ];

  const adminLinks = [
    { href: '/admin', label: 'Governance Overview', icon: LayoutDashboard },
    { href: '/admin/items', label: 'Campus Inventory & Ageing', icon: Package },
    { href: '/admin/users', label: 'Role Permissions', icon: Users },
    { href: '/admin/analytics', label: 'Operational Metrics', icon: BarChart3 },
    { href: '/admin/audit', label: 'Audit Trail Explorer', icon: ClipboardCheck },
  ];

  return (
    <aside className="flex h-full w-64 flex-col justify-between border-r border-slate-200 bg-white">
      {/* Top Branding Section */}
      <div className="p-5">
        <Link 
          href="/" 
          onClick={onCloseMobile}
          className="flex items-center gap-2 mb-6 focus-visible:outline-none"
        >
          <LPULogo size="sm" showSubtitle={false} />
        </Link>

        {/* Persona / Role Context Pill */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Active Portal
            </span>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-700 text-xs font-bold text-white">
              {currentRole === 'STUDENT_STAFF' ? 'ST' : currentRole === 'SECURITY_PERSONNEL' ? 'SC' : 'AD'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {currentRole === 'STUDENT_STAFF' 
                  ? 'Student Portal' 
                  : currentRole === 'SECURITY_PERSONNEL' 
                  ? 'Security Station' 
                  : 'Campus Admin'}
              </p>
              <p className="text-[10px] text-slate-500 font-mono truncate">
                {currentRole === 'STUDENT_STAFF' ? 'ID: 12108492' : currentRole === 'SECURITY_PERSONNEL' ? 'POST: Gate 1' : 'DSW Office'}
              </p>
            </div>
          </div>

          {/* Quick Portal Switcher */}
          {onRoleChange && (
            <div className="mt-3 grid grid-cols-3 gap-1 pt-2 border-t border-slate-200/80">
              <button
                type="button"
                onClick={() => onRoleChange('STUDENT_STAFF')}
                className={`rounded py-1 text-[10px] font-medium transition-colors ${
                  currentRole === 'STUDENT_STAFF'
                    ? 'bg-red-700 text-white font-bold'
                    : 'bg-white text-slate-600 hover:bg-slate-200'
                }`}
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => onRoleChange('SECURITY_PERSONNEL')}
                className={`rounded py-1 text-[10px] font-medium transition-colors ${
                  currentRole === 'SECURITY_PERSONNEL'
                    ? 'bg-blue-700 text-white font-bold'
                    : 'bg-white text-slate-600 hover:bg-slate-200'
                }`}
              >
                Security
              </button>
              <button
                type="button"
                onClick={() => onRoleChange('CAMPUS_ADMIN')}
                className={`rounded py-1 text-[10px] font-medium transition-colors ${
                  currentRole === 'CAMPUS_ADMIN'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'bg-white text-slate-600 hover:bg-slate-200'
                }`}
              >
                Admin
              </button>
            </div>
          )}
        </div>

        {/* Nav Links Based on Role */}
        <div className="space-y-6">
          {/* Section 1: Student Portal */}
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Student / Staff
            </div>
            <nav className="space-y-1">
              {studentLinks.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-red-50 text-red-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${active ? 'text-red-700' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-800">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Section 2: Security Desk */}
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Security Operations
            </div>
            <nav className="space-y-1">
              {securityLinks.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${active ? 'text-blue-700' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Section 3: Campus Governance */}
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Campus Governance
            </div>
            <nav className="space-y-1">
              {adminLinks.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-slate-100 text-slate-900 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${active ? 'text-slate-900' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Bottom User Session / Quick Return */}
      <div className="border-t border-slate-200 p-4 space-y-2">
        <Link
          href="/board"
          className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            Public Search Board
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        </Link>

        <Link
          href="/login"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Switch Account / Sign Out</span>
        </Link>
      </div>
    </aside>
  );
};
