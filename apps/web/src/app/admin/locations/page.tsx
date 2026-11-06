'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Edit2,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient, ApiClientError, type CustodyLocationRecord } from '@/lib/api-client';
import { formatDisplayDateTime } from '@/lib/formatters';

type LocationForm = { code: string; name: string; description: string };
type LockerForm = { lockerNumber: string; custodyLocationId: string; is_active: boolean };

const emptyLocation: LocationForm = { code: '', name: '', description: '' };
const emptyLocker: LockerForm = { lockerNumber: '', custodyLocationId: '', is_active: true };

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<CustodyLocationRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [locationForm, setLocationForm] = useState<LocationForm>(emptyLocation);
  const [editingLocationId, setEditingLocationId] = useState('');
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [lockerForm, setLockerForm] = useState<LockerForm>(emptyLocker);
  const [editingLockerId, setEditingLockerId] = useState('');
  const [lockerFormOpen, setLockerFormOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const latestRequest = useRef(0);

  const refreshLocations = useCallback(async (showLoading = false) => {
    const requestId = ++latestRequest.current;
    if (showLoading) setLoading(true);
    try {
      const result = await apiClient.getCustodyLocations(true);
      if (requestId === latestRequest.current) {
        setLocations(Array.isArray(result) ? result : []);
        setError('');
      }
    } catch (err) {
      if (requestId === latestRequest.current) {
        setError(err instanceof ApiClientError ? err.message : 'Unable to load custody locations.');
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshLocations(true), 0);
    const timer = window.setInterval(() => void refreshLocations(), 5000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [refreshLocations]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return locations;
    return locations.filter((location) =>
      [location.name, location.code, location.description, ...location.lockers.map((locker) => locker.lockerNumber)]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [locations, searchTerm]);

  const activeLocations = locations.filter((location) => location.isActive);
  const totalLockers = locations.reduce((total, location) => total + location.lockersTotal, 0);
  const totalOccupied = locations.reduce((total, location) => total + location.lockersOccupied, 0);
  const totalItems = locations.reduce((total, location) => total + location.itemsStored, 0);

  const resetLocationForm = () => {
    setLocationForm(emptyLocation);
    setEditingLocationId('');
    setLocationFormOpen(false);
  };

  const resetLockerForm = () => {
    setLockerForm(emptyLocker);
    setEditingLockerId('');
    setLockerFormOpen(false);
  };

  const saveLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (editingLocationId) {
        await apiClient.updateCustodyLocation(editingLocationId, locationForm);
        setMessage('Custody location updated.');
      } else {
        await apiClient.createCustodyLocation(locationForm);
        setMessage('Custody location created and available to Security.');
      }
      resetLocationForm();
      await refreshLocations();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save this custody location.');
    } finally {
      setBusy(false);
    }
  };

  const editLocation = (location: CustodyLocationRecord) => {
    setEditingLocationId(location.id);
    setLocationForm({ code: location.code, name: location.name, description: location.description });
    setLocationFormOpen(true);
    setLockerFormOpen(false);
  };

  const setLocationActive = async (location: CustodyLocationRecord) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiClient.updateCustodyLocation(location.id, { isActive: !location.isActive });
      setMessage(location.isActive ? 'Custody location disabled.' : 'Custody location enabled.');
      await refreshLocations();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update custody location status.');
    } finally {
      setBusy(false);
    }
  };

  const deleteLocation = async (location: CustodyLocationRecord) => {
    if (!window.confirm(`Delete or archive custody location “${location.name}”? Historical locations are retained.`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiClient.deleteCustodyLocation(location.id);
      setMessage(result.archived ? 'Location archived to preserve custody history.' : 'Unused custody location deleted.');
      await refreshLocations();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete this custody location.');
    } finally {
      setBusy(false);
    }
  };

  const openNewLocker = (locationId = '') => {
    setLockerForm({ ...emptyLocker, custodyLocationId: locationId || (activeLocations[0]?.id ?? '') });
    setEditingLockerId('');
    setLockerFormOpen(true);
    setLocationFormOpen(false);
  };

  const editLocker = (locker: CustodyLocationRecord['lockers'][number]) => {
    setLockerForm({ lockerNumber: locker.lockerNumber, custodyLocationId: locker.locationId, is_active: locker.is_active });
    setEditingLockerId(locker.id);
    setLockerFormOpen(true);
    setLocationFormOpen(false);
  };

  const saveLocker = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (editingLockerId) {
        await apiClient.updateLocker(editingLockerId, lockerForm);
        setMessage('Locker updated.');
      } else {
        await apiClient.createLocker({
          lockerNumber: lockerForm.lockerNumber,
          custodyLocationId: lockerForm.custodyLocationId,
        });
        setMessage('Locker created and available to Security.');
      }
      resetLockerForm();
      await refreshLocations();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save this locker.');
    } finally {
      setBusy(false);
    }
  };

  const setLockerActive = async (locker: CustodyLocationRecord['lockers'][number]) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiClient.updateLocker(locker.id, { is_active: !locker.is_active });
      setMessage(locker.is_active ? 'Locker disabled.' : 'Locker enabled.');
      await refreshLocations();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update locker status.');
    } finally {
      setBusy(false);
    }
  };

  const deleteLocker = async (locker: CustodyLocationRecord['lockers'][number]) => {
    if (!window.confirm(`Delete or archive locker ${locker.lockerNumber}? Historical movements are retained.`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiClient.deleteLocker(locker.id);
      setMessage(result.archived ? 'Locker archived to preserve custody history.' : 'Unused locker deleted.');
      await refreshLocations();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete this locker.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout
      title="Custody Locations & Security Desks"
      subtitle="Manage physical custody locations, lockers, occupancy, and the latest responsible officer."
      role="CAMPUS_ADMIN"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Active Custody Locations</span>
          <p className="mt-2 text-2xl font-black text-[#283442]">{loading ? '...' : activeLocations.length}</p>
          <span className="text-[11px] font-semibold text-emerald-700">Shared with active Security sessions</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Locker Utilization</span>
          <p className="mt-2 text-2xl font-black text-[#283442]">{loading ? '...' : `${totalOccupied} / ${totalLockers}`}</p>
          <span className="text-[11px] font-semibold text-[#356DE8]">Single-occupancy locker register</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Items in Custody</span>
          <p className="mt-2 text-2xl font-black text-[#283442]">{loading ? '...' : totalItems}</p>
          <span className="text-[11px] text-slate-500">Current item count by managed location</span>
        </div>
      </div>

      {(message || error) && (
        <div role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {error || message}
        </div>
      )}

      {(locationFormOpen || lockerFormOpen) && (
        <form onSubmit={locationFormOpen ? saveLocation : saveLocker} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#283442]">{locationFormOpen ? (editingLocationId ? 'Edit Custody Location' : 'Add Custody Location') : (editingLockerId ? 'Edit Locker' : 'Add Locker')}</h2>
            <button type="button" onClick={() => { resetLocationForm(); resetLockerForm(); }} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Cancel</button>
          </div>
          {locationFormOpen ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-600">Location code
                <input required maxLength={50} value={locationForm.code} onChange={(event) => setLocationForm({ ...locationForm, code: event.target.value.toUpperCase() })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" placeholder="SECURITY-CENTRAL" />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">Location name
                <input required maxLength={150} value={locationForm.name} onChange={(event) => setLocationForm({ ...locationForm, name: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" placeholder="Central Security Office" />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">Description
                <textarea maxLength={500} value={locationForm.description} onChange={(event) => setLocationForm({ ...locationForm, description: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" rows={2} />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-semibold text-slate-600">Locker identifier
                <input required maxLength={100} value={lockerForm.lockerNumber} onChange={(event) => setLockerForm({ ...lockerForm, lockerNumber: event.target.value.toUpperCase() })} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900" placeholder="LOCKER-A01" />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">Custody location
                <select required value={lockerForm.custodyLocationId} onChange={(event) => setLockerForm({ ...lockerForm, custodyLocationId: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900">
                  <option value="">Select an active location</option>
                  {(editingLockerId ? locations.filter((location) => location.isActive || location.id === lockerForm.custodyLocationId) : activeLocations).map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code}){location.isActive ? '' : ' · inactive'}</option>)}
                </select>
              </label>
              {editingLockerId && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 sm:col-span-3">
                  <input type="checkbox" checked={lockerForm.is_active} onChange={(event) => setLockerForm({ ...lockerForm, is_active: event.target.checked })} />
                  Locker active for new assignments
                </label>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="rounded-lg bg-[#283442] px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60">{busy ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by location, code, or locker number..."
              className="w-full rounded-xl border border-slate-200 bg-[#F5F5F5] py-2 pl-10 pr-4 text-xs font-medium text-[#17243B] focus:border-[#F58220] focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refreshLocations(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            <button type="button" onClick={() => { setLocationForm(emptyLocation); setEditingLocationId(''); setLocationFormOpen(true); setLockerFormOpen(false); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#F58220] px-3 py-2 text-xs font-bold text-white hover:bg-orange-600"><Plus className="h-3.5 w-3.5" /> Add Location</button>
            <button type="button" disabled={!activeLocations.length} onClick={() => openNewLocker()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#356DE8] px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Add Locker</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-slate-500">Loading custody locations and locker assignments...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">No custody locations found. Add a location to make it available to Security.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((location) => (
            <section key={location.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#FFF1E6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#E66F00]">{location.code}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${location.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>{location.isActive ? 'Active' : 'Inactive / Archived'}</span>
                  </div>
                  <h2 className="text-sm font-bold text-[#283442]">{location.name}</h2>
                  {location.description && <p className="mt-1 text-xs text-slate-500">{location.description}</p>}
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><MapPin className="h-3 w-3" /> {location.itemsStored} items currently stored</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => editLocation(location)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Edit2 className="h-3 w-3" /> Edit</button>
                  <button type="button" disabled={busy} onClick={() => void setLocationActive(location)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">{location.isActive ? 'Disable' : 'Enable'}</button>
                  <button type="button" disabled={busy} onClick={() => void deleteLocation(location)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3 w-3" /> Delete</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F5F5F5] p-3 text-[11px] sm:grid-cols-4">
                <div><span className="block text-slate-500">Lockers</span><strong className="text-[#283442]">{location.lockersTotal}</strong></div>
                <div><span className="block text-slate-500">Occupied</span><strong className="text-[#283442]">{location.lockersOccupied}</strong></div>
                <div><span className="block text-slate-500">Last updated</span><strong className="text-[#283442]">{formatDisplayDateTime(location.updatedAt)}</strong></div>
                <div><span className="block text-slate-500">Responsible</span><strong className="text-[#283442]">{location.updatedBy?.fullName || 'Not recorded'}{location.updatedBy?.role ? ` · ${location.updatedBy.role}` : ''}</strong></div>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><LockKeyhole className="h-3.5 w-3.5 text-[#356DE8]" /> Lockers</h3>
                  <button type="button" disabled={!location.isActive} onClick={() => openNewLocker(location.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-3 w-3" /> Add locker</button>
                </div>
                {location.lockers.length ? location.lockers.map((locker) => (
                  <div key={locker.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-800">{locker.lockerNumber}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${locker.is_active && locker.locationActive ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{locker.is_active && locker.locationActive ? 'Active' : 'Inactive'}</span>
                        <span className="text-[10px] text-slate-500">{locker.occupied ? 'Occupied' : 'Available'}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-slate-600">{locker.currentItemTitle ? `Item: ${locker.currentItemTitle} · ${locker.currentItemId}` : 'No assigned item'}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Updated {formatDisplayDateTime(locker.updatedAt)} · {locker.updatedBy?.fullName || 'Not recorded'}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => editLocker(locker)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                      <button type="button" disabled={busy || !location.isActive} onClick={() => void setLockerActive(locker)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{locker.is_active ? 'Disable' : 'Enable'}</button>
                      <button type="button" disabled={busy} onClick={() => void deleteLocker(locker)} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50">Delete</button>
                    </div>
                  </div>
                )) : <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">No lockers assigned to this location.</p>}
              </div>
              <p className="flex items-center gap-1 text-[10px] text-slate-400"><CheckCircle2 className="h-3 w-3" /> Updates are shared with Security through the existing 5-second refresh cycle.</p>
            </section>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
