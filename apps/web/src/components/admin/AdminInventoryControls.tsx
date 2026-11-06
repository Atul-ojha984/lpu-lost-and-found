'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Clock3, Edit3, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  apiClient,
  ApiClientError,
  type AdminInventoryLocker,
  type AdminInventorySnapshot,
} from '@/lib/api-client';
import { formatDisplayDateTime } from '@/lib/formatters';

type LockerForm = { lockerNumber: string; location: string; is_active: boolean };
const EMPTY_FORM: LockerForm = { lockerNumber: '', location: '', is_active: true };

export function AdminInventoryControls() {
  const [snapshot, setSnapshot] = useState<AdminInventorySnapshot>({ items: [], lockers: [], recentUpdates: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocker, setEditingLocker] = useState<AdminInventoryLocker | null>(null);
  const [form, setForm] = useState<LockerForm>(EMPTY_FORM);
  const requestInFlight = useRef(false);
  const isMounted = useRef(false);

  const loadInventory = useCallback(async (showLoading = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (showLoading && isMounted.current) setLoading(true);
    try {
      const data = await apiClient.getAdminInventory();
      if (!isMounted.current) return;
      setSnapshot({
        items: Array.isArray(data.items) ? data.items : [],
        lockers: Array.isArray(data.lockers) ? data.lockers : [],
        recentUpdates: Array.isArray(data.recentUpdates) ? data.recentUpdates : [],
      });
      setError('');
    } catch (err) {
      if (isMounted.current) setError(err instanceof ApiClientError ? err.message : 'Could not load security inventory.');
    } finally {
      requestInFlight.current = false;
      if (showLoading && isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    isMounted.current = true;
    const firstLoad = window.setTimeout(() => {
      if (active) void loadInventory(true);
    }, 0);
    const interval = window.setInterval(() => {
      if (active && document.visibilityState === 'visible') void loadInventory();
    }, 10000);
    return () => {
      active = false;
      isMounted.current = false;
      window.clearTimeout(firstLoad);
      window.clearInterval(interval);
    };
  }, [loadInventory]);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = useMemo(() => snapshot.items.filter((item) => {
    if (!normalizedSearch) return true;
    return [
      item.id,
      item.title,
      item.referenceNumber,
      item.category?.name,
      item.category?.code,
      item.status,
      item.currentCustodyDesk,
      item.lockerStorageReference,
    ]
      .some((value) => value?.toLowerCase().includes(normalizedSearch));
  }), [normalizedSearch, snapshot.items]);
  const visibleLockers = useMemo(() => snapshot.lockers.filter((locker) => {
    if (!normalizedSearch) return true;
    return [locker.lockerNumber, locker.location, locker.currentItemTitle, locker.currentItem?.referenceNumber]
      .some((value) => value?.toLowerCase().includes(normalizedSearch));
  }), [normalizedSearch, snapshot.lockers]);

  const openCreate = () => {
    setEditingLocker(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
    setError('');
    setNotice('');
  };

  const openEdit = (locker: AdminInventoryLocker) => {
    setEditingLocker(locker);
    setForm({ lockerNumber: locker.lockerNumber, location: locker.location, is_active: locker.is_active });
    setModalOpen(true);
    setError('');
    setNotice('');
  };

  const saveLocker = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingLocker) {
        await apiClient.updateLocker(editingLocker.id, form);
        setNotice(`Locker ${form.lockerNumber.trim()} updated.`);
      } else {
        await apiClient.createLocker({ lockerNumber: form.lockerNumber.trim(), location: form.location.trim() });
        setNotice(`Locker ${form.lockerNumber.trim()} added to the inventory register.`);
      }
      setModalOpen(false);
      setEditingLocker(null);
      setForm(EMPTY_FORM);
      await loadInventory();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save this locker.');
    } finally {
      setSaving(false);
    }
  };

  const deleteLocker = async (locker: AdminInventoryLocker) => {
    if (!locker.canDelete) return;
    const confirmed = window.confirm(
      `Delete empty locker ${locker.lockerNumber}? This cannot be undone.`
    );
    if (!confirmed) return;
    setError('');
    setNotice('');
    try {
      await apiClient.deleteLocker(locker.id);
      setNotice(`Locker ${locker.lockerNumber} deleted.`);
      await loadInventory();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not delete this locker.');
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#283442]">Security Inventory &amp; Locker Register</h2>
          <p className="mt-1 text-xs text-slate-500">Live custody snapshot, locker occupancy, and recent officer movements.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item or locker"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-red-600 focus:outline-none sm:w-56"
              aria-label="Search security inventory"
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add Locker
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Items in custody</span>
          <strong className="mt-1 block text-lg text-slate-900">{loading ? '…' : snapshot.items.length}</strong>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active lockers</span>
          <strong className="mt-1 block text-lg text-slate-900">{loading ? '…' : snapshot.lockers.filter((locker) => locker.is_active).length}</strong>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Occupied lockers</span>
          <strong className="mt-1 block text-lg text-slate-900">{loading ? '…' : snapshot.lockers.filter((locker) => locker.occupied).length}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-800">Items currently held by Security</div>
          <div className="max-h-[28rem] overflow-auto">
            {visibleItems.length === 0 ? (
              <p className="p-4 text-xs text-slate-500">{loading ? 'Loading inventory…' : 'No custody items match this search.'}</p>
            ) : visibleItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                {item.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.primaryImageUrl} alt="" className="h-11 w-11 rounded-lg border border-slate-200 object-cover" />
                ) : <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Archive className="h-4 w-4" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500">{item.referenceNumber} · {item.status}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">Locker: {item.lockerStorageReference || 'Not assigned'} · {item.currentCustodyDesk || 'Desk not recorded'}</div>
                </div>
                <div className="hidden shrink-0 text-right text-[10px] text-slate-500 md:block">
                  <Clock3 className="ml-auto mb-1 h-3 w-3" />
                  {item.updatedAt ? formatDisplayDateTime(item.updatedAt) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-800">Registered lockers</div>
          <div className="max-h-[28rem] overflow-auto">
            {visibleLockers.length === 0 ? (
              <p className="p-4 text-xs text-slate-500">{loading ? 'Loading lockers…' : 'No lockers match this search.'}</p>
            ) : visibleLockers.map((locker) => (
              <div key={locker.id} className="border-b border-slate-100 p-4 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-mono text-xs text-slate-900">{locker.lockerNumber}</strong>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${locker.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {locker.is_active ? 'Enabled' : 'Disabled'}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {locker.occupied ? 'Occupied' : 'Available'}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{locker.location}</div>
                    {locker.currentItem && (
                      <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-700">
                        {locker.currentItem.title} · {locker.currentItem.referenceNumber} · {locker.currentItem.status}
                      </div>
                    )}
                    <div className="mt-2 text-[10px] text-slate-400">Updated {formatDisplayDateTime(locker.updatedAt)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => openEdit(locker)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label={`Edit ${locker.lockerNumber}`}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => void deleteLocker(locker)} disabled={!locker.canDelete} title={locker.canDelete ? 'Delete empty locker' : locker.deleteBlockedReason} className="rounded-lg border border-slate-200 p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Delete ${locker.lockerNumber}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-800">
          <span>Recent custody and locker updates</span>
          <button type="button" onClick={() => void loadInventory()} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 hover:text-slate-900">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0">
          {snapshot.recentUpdates.slice(0, 12).map((update) => (
            <div key={update.id} className="flex items-center justify-between gap-4 border-slate-100 px-4 py-3 text-[10px] md:border-b">
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-800">{update.itemReference} · {update.itemTitle}</div>
                <div className="mt-0.5 text-slate-500">{update.action} · {update.previousLockerReference || '—'} → {update.lockerReference || update.toLocation || '—'}</div>
                <div className="mt-0.5 text-slate-500">Officer: {update.officerName || update.handledBy?.fullName || 'Not recorded'}</div>
              </div>
              <time className="shrink-0 text-right text-slate-400">{formatDisplayDateTime(update.timestamp)}</time>
            </div>
          ))}
          {snapshot.recentUpdates.length === 0 && <p className="p-4 text-xs text-slate-500">No custody movement has been recorded yet.</p>}
        </div>
      </div>

      {modalOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="admin-locker-heading" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="admin-locker-heading" className="text-base font-bold text-slate-900">{editingLocker ? 'Edit Locker Configuration' : 'Add Inventory Locker'}</h3>
                <p className="mt-1 text-xs text-slate-500">One locker can hold one item. Custody history is preserved when a locker is disabled.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close locker form">×</button>
            </div>
            <form onSubmit={saveLocker} className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700">
                Locker number
                <input required maxLength={100} value={form.lockerNumber} onChange={(event) => setForm((current) => ({ ...current, lockerNumber: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-slate-900 focus:border-red-600 focus:outline-none" placeholder="LOCKER-B12" />
              </label>
              <label className="block font-semibold text-slate-700">
                Security office / location
                <input required maxLength={150} value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-slate-900 focus:border-red-600 focus:outline-none" placeholder="Main Security Vault" />
              </label>
              {editingLocker && (
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-red-700 focus:ring-red-600" />
                  Enabled for new item assignments
                </label>
              )}
              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-50">{saving ? 'Saving…' : editingLocker ? 'Save Locker' : 'Add Locker'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
