'use client';

import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Search, 
  CheckCircle2 
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';

interface CustodyDeskRecord {
  id: string;
  name: string;
  zone: string;
  building: string;
  lockersTotal: number;
  lockersOccupied: number;
  officerOnDuty: string;
  intakeActive: boolean;
}

export default function AdminLocationsPage() {
  const [desks, setDesks] = useState<CustodyDeskRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    async function fetchLocations() {
      try {
        const locs = await apiClient.getAdminLocations(true);
        if (!isSubscribed) return;
        if (Array.isArray(locs) && locs.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setDesks(locs.map((l: any, idx: number) => ({
            id: String(l.id || l._id || `desk-${idx}`),
            name: l.name || 'Campus Custody Desk',
            zone: l.campusZone || 'Campus Central',
            building: l.building || l.name,
            lockersTotal: l.lockersTotal || 24,
            lockersOccupied: l.lockersOccupied || 0,
            officerOnDuty: l.officerOnDuty || 'Campus Security Personnel',
            intakeActive: l.isActive !== false,
          })));
        } else {
          setDesks([]);
        }
      } catch {
        if (isSubscribed) setDesks([]);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }
    fetchLocations();
    return () => {
      isSubscribed = false;
    };
  }, []);

  const filtered = desks.filter((d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.zone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.building.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalLockers = desks.reduce((acc, curr) => acc + curr.lockersTotal, 0) || 1;
  const totalOccupied = desks.reduce((acc, curr) => acc + curr.lockersOccupied, 0);

  return (
    <DashboardLayout
      title="Custody Locations & Security Desks"
      subtitle="Physical property intake checkpoints, secure locker clusters, and campus drop points."
      role="CAMPUS_ADMIN"
    >
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Active Intake Checkpoints
          </span>
          <p className="mt-2 text-2xl font-black text-[#192B4A]">
            {loading ? '...' : desks.length}
          </p>
          <span className="text-[11px] text-emerald-700 font-semibold">100% operational stations</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Locker Utilization
          </span>
          <p className="mt-2 text-2xl font-black text-[#192B4A]">
            {loading ? '...' : `${totalOccupied} / ${totalLockers}`}
          </p>
          <span className="text-[11px] text-[#356DE8] font-semibold">
            {loading ? '...' : `${Math.round((totalOccupied / totalLockers) * 100)}% capacity utilized`}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Covered Campus Desks
          </span>
          <p className="mt-2 text-2xl font-black text-[#192B4A]">
            {loading ? '...' : `${desks.length} Posts`}
          </p>
          <span className="text-[11px] text-slate-500">600+ acre university campus</span>
        </div>
      </div>

      {/* Search Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search custody desks by post name, campus zone, or building..."
            className="w-full rounded-xl border border-slate-200 bg-[#F5F8FC] pl-10 pr-4 py-2 text-xs font-medium text-[#17243B] focus:bg-white focus:border-[#20B5AD] focus:outline-none"
          />
        </div>
      </div>

      {/* Custody Desks Cards */}
      {loading ? (
        <div className="p-10 text-center text-xs text-slate-500">
          Loading campus custody locations...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-500">
          No custody locations found matching your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((desk) => {
            const occupancyRate = Math.round((desk.lockersOccupied / (desk.lockersTotal || 1)) * 100);
            return (
              <div key={desk.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#16A89F] bg-[#E6F8F7] px-2 py-0.5 rounded">
                      {desk.zone}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Intake Open
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[#192B4A]">{desk.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {desk.building}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F5F8FC] p-3 text-xs space-y-2 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Secure Storage Lockers:</span>
                    <span className="font-bold text-[#192B4A]">
                      {desk.lockersOccupied} of {desk.lockersTotal}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#20B5AD] rounded-full transition-all"
                      style={{ width: `${occupancyRate}%` }}
                    />
                  </div>
                  <div className="pt-1 text-[11px] text-slate-600">
                    Duty Officer: <strong className="text-slate-800">{desk.officerOnDuty}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
