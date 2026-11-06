'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Search,
  FilePlus2, 
  HelpCircle, 
  ShieldAlert, 
  ClipboardCheck, 
  PackageCheck, 
  Users, 
  BarChart3, 
  LogOut, 
  Clock, 
  User as UserIcon, 
  Shield, 
  MapPin, 
  Sliders, 
  FileText,
  Package
} from 'lucide-react';
import { LPULogo } from '@/components/branding/LPULogo';
import { apiClient } from '@/lib/api-client';

interface SidebarProps {
  currentRole?: 'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN' | 'SYSTEM_ADMIN';
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole: propRole,
  onCloseMobile,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState<'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN' | 'SYSTEM_ADMIN'>(
    propRole || 'STUDENT_STAFF'
  );
  const [userName, setUserName] = useState<string>('');
  const [userIdentifier, setUserIdentifier] = useState<string>('');

  useEffect(() => {
    // Determine active role from current user session
    apiClient.getCurrentUser()
      .then((data) => {
        const u = data?.user || data;
        if (u) {
          if (u.role) {
            setUserRole(u.role);
          }
          if (u.fullName) {
            setUserName(u.fullName);
          }
          if (u.registrationNumber) {
            setUserIdentifier(u.registrationNumber);
          } else if (u.email) {
            setUserIdentifier(u.email);
          }
        }
      })
      .catch(() => {
        if (propRole) {
          setUserRole(propRole);
        } else {
          setUserRole('STUDENT_STAFF');
        }
      });
  }, [pathname, propRole]);

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // ignore
    }
    router.push('/login');
  };

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

  // 1. Student / Campus-user navigation items
  const studentNavItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/board', label: 'Campus Listings', icon: Search },
    { href: '/report?type=LOST', label: 'Report Lost Item', icon: FilePlus2 },
    { href: '/report?type=FOUND', label: 'Report Found Item', icon: Package },
    { href: '/dashboard/my-reports', label: 'My Reports', icon: FileText },
    { href: '/dashboard/my-claims', label: 'My Claims', icon: HelpCircle },
    { href: '/dashboard/history', label: 'Recovery History', icon: Clock },
    { href: '/dashboard/profile', label: 'My Profile', icon: UserIcon },
  ];

  // 2. Security officer navigation items
  const securityNavItems: NavItem[] = [
    { href: '/security', label: 'Security Dashboard', icon: LayoutDashboard },
    { href: '/report?type=FOUND', label: 'Register Found Item', icon: Package },
    { href: '/security/custody', label: 'Items in Custody', icon: ShieldAlert },
    { href: '/security/claims', label: 'Claims to Verify', icon: ClipboardCheck, badge: 'Review' },
    { href: '/security/handovers', label: 'Approved Handovers', icon: PackageCheck },
    { href: '/security/history', label: 'Custody History', icon: Clock },
    { href: '/security/profile', label: 'Profile', icon: UserIcon },
  ];

  // 3. Administrator navigation items
  const adminNavItems: NavItem[] = [
    { href: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'User Management', icon: Users },
    { href: '/admin/items', label: 'Lost & Found Reports', icon: FileText },
    { href: '/admin/claims', label: 'Claim Management', icon: ClipboardCheck },
    { href: '/admin/officers', label: 'Security Officer Management', icon: Shield },
    { href: '/admin/locations', label: 'Custody Locations', icon: MapPin },
    { href: '/admin/audit', label: 'Audit Logs', icon: Clock },
    { href: '/admin/analytics', label: 'Reports and Analytics', icon: BarChart3 },
    { href: '/admin/settings', label: 'Settings', icon: Sliders },
  ];

  // Pick ONLY the active role's navigation list
  const activeNavItems = 
    userRole === 'SECURITY_PERSONNEL'
      ? securityNavItems
      : userRole === 'CAMPUS_ADMIN' || userRole === 'SYSTEM_ADMIN'
      ? adminNavItems
      : studentNavItems;

  const roleTitle = 
    userRole === 'SECURITY_PERSONNEL'
      ? 'Security Officer'
      : userRole === 'CAMPUS_ADMIN' || userRole === 'SYSTEM_ADMIN'
      ? 'Administrator'
      : 'Campus User';

  const roleCodeBadge = 
    userRole === 'SECURITY_PERSONNEL'
      ? 'SEC'
      : userRole === 'CAMPUS_ADMIN' || userRole === 'SYSTEM_ADMIN'
      ? 'ADM'
      : 'STU';

  const isActive = (href: string) => {
    if (href.includes('?')) {
      const [path, query] = href.split('?');
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const [qKey, qVal] = query.split('=');
        return pathname === path && params.get(qKey) === qVal;
      }
      return pathname === path;
    }
    return pathname === href;
  };

  return (
    <aside className="portal-sidebar flex h-full w-64 flex-col justify-between border-r border-[#3A4B5E] bg-[#283442] text-white shadow-md">
      {/* Top Branding Section */}
      <div className="p-4 sm:p-5">
        <Link 
          href="/" 
          onClick={onCloseMobile}
          className="flex items-center gap-2 mb-5 focus:outline-none"
        >
          <LPULogo size="sm" showSubtitle={true} wordmarkVariant="stacked-system" inverted={false} />
        </Link>

        {/* Authenticated Role Identification Pill */}
        <div className="rounded-xl border border-[#3A4B5E] bg-[#3A4B5E]/60 p-3 mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#F58220]">
              Authenticated Scope
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#F58220] bg-[#F58220]/15 px-1.5 py-0.5 rounded">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F58220] animate-pulse" />
              Verified
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F58220] text-xs font-black text-[#283442] shadow-xs">
              {roleCodeBadge}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">
                {userName || roleTitle}
              </p>
              <p className="text-[10px] text-slate-300 font-mono truncate">
                {userIdentifier || 'Authorized Account'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Heading */}
        <div className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
          {roleTitle} Navigation
        </div>

        {/* Dynamic Navigation Links based exclusively on authenticated role */}
        <nav className="space-y-1">
          {activeNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[#F58220]/20 text-white font-bold shadow-xs border-l-3 border-[#F58220]'
                    : 'text-slate-300 hover:bg-[#3A4B5E] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#F58220]' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="rounded-full bg-[#F58220] px-1.5 py-0.2 text-[9px] font-bold text-[#283442]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Session & Sign Out Actions */}
      <div className="border-t border-[#3A4B5E] p-4 space-y-1.5 bg-[#162540]">
        <Link
          href="/board"
          onClick={onCloseMobile}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#3A4B5E] hover:text-white transition-colors"
        >
          <Search className="h-3.5 w-3.5 text-[#F58220]" />
          <span>Search Campus Listings</span>
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 transition-colors text-left"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
