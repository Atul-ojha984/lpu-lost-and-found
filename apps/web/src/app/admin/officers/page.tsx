'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Shield, 
  MapPin, 
  Phone, 
  UserCheck, 
  Search, 
  Clock 
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface OfficerRecord {
  id: string;
  name: string;
  badgeId: string;
  email: string;
  phone: string;
  assignedDesk: string;
  shift: string;
  custodyCount: number;
  status: 'ACTIVE_DUTY' | 'OFF_DUTY';
}

export default function AdminOfficersPage() {
  const [officers, setOfficers] = useState<OfficerRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    async function fetchOfficers() {
      try {
        const users = await apiClient.getAdminUsers({ role: 'SECURITY_PERSONNEL' });
        if (!isSubscribed) return;
        if (Array.isArray(users)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setOfficers(users.map((u: any, idx: number) => ({
            id: String(u.id || u._id || `sec-${idx}`),
            name: u.fullName || 'Security Officer',
            badgeId: u.registrationNumber || `LPU-SEC-${idx + 1}`,
            email: u.email || 'officer@lpu.in',
            phone: u.phone || 'Not provided',
            assignedDesk: u.securityPost || 'Main Security Control Post',
            shift: 'Active Roster (Day / Rotating)',
            custodyCount: 0,
            status: u.isActive !== false ? 'ACTIVE_DUTY' : 'OFF_DUTY',
          })));
        } else {
          setOfficers([]);
        }
      } catch {
        if (isSubscribed) setOfficers([]);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }
    fetchOfficers();
    return () => {
      isSubscribed = false;
    };
  }, []);

  const filtered = officers.filter((o) =>
    o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.badgeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.assignedDesk.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout
      title="Security Officer Management"
      subtitle="Supervise campus security personnel roster, custody post deployments, and handover permissions."
      role="CAMPUS_ADMIN"
      actionButton={
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 rounded-xl lpu-btn-primary px-3.5 py-1.5 text-xs font-bold"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Provision Security Role</span>
        </Link>
      }
    >
      {/* Search Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search security officers by name, badge ID, or assigned checkpoint..."
            className="w-full rounded-xl border border-slate-200 bg-[#F5F5F5] pl-10 pr-4 py-2 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#F58220] focus:outline-none"
          />
        </div>
      </div>

      {/* Officers Grid */}
      {loading ? (
        <div className="p-10 text-center text-xs text-slate-500">
          Loading security officer directory...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-500">
          No security officers registered or matching search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((officer) => (
            <div key={officer.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#FFF1E6] text-[#E66F00] flex items-center justify-center font-bold text-sm">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#283442]">{officer.name}</h4>
                    <span className="font-mono text-xs text-[#356DE8] font-bold">
                      Badge: {officer.badgeId}
                    </span>
                  </div>
                </div>

                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  officer.status === 'ACTIVE_DUTY'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {officer.status.replace('_', ' ')}
                </span>
              </div>

              <div className="rounded-xl bg-[#F5F5F5] p-3 text-xs space-y-2 border border-slate-100">
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Station: <strong>{officer.assignedDesk}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Shift: {officer.shift}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Contact: {officer.phone}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-500">
                  Custody Items Held: <strong className="text-[#283442]">{officer.custodyCount}</strong>
                </span>

                <Link
                  href={`/admin/audit?search=${officer.badgeId}`}
                  className="text-xs font-semibold text-[#356DE8] hover:underline"
                >
                  View Officer Actions &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
