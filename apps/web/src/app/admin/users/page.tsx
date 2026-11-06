'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search,
  UserCheck,
  Edit,
  X,
  UserX,
  UserPlus,
  Trash2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/constants';
import { normalizeIndianMobileInput } from '@/lib/indian-mobile';
import { UserRole, UserType } from '@/types';

interface CampusUser {
  _id: string;
  registrationNumber: string;
  email: string;
  fullName: string;
  role: UserRole;
  userType: UserType;
  department?: string;
  securityPost?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
}

const USER_TYPE_LABELS: Record<UserType, string> = {
  STUDENT: 'Student',
  STAFF: 'Staff',
  SECURITY_OFFICER: 'Security Officer',
  CAMPUS_ADMIN: 'Campus Administrator',
  SYSTEM_ADMIN: 'System Administrator',
  UNSPECIFIED: 'Unspecified Student / Staff',
};

const EMPTY_NEW_USER = {
  fullName: '',
  registrationNumber: '',
  email: '',
  userType: 'STUDENT' as 'STUDENT' | 'STAFF' | 'SECURITY_OFFICER',
  password: '',
  department: '',
  securityPost: '',
  phone: '',
  isActive: true,
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<CampusUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<CampusUser | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit Modal form state
  const [editUserType, setEditUserType] = useState<UserType>('UNSPECIFIED');
  const [editSecurityPost, setEditSecurityPost] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [listFeedback, setListFeedback] = useState('');

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await apiClient.getAdminUsers({
        role: roleFilter !== 'ALL' ? roleFilter : undefined,
        search: search.trim() || undefined,
      });

      if (Array.isArray(res)) {
        setUsers(res);
      } else {
        setUsers([]);
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function fetchUsers() {
      try {
        const res = await apiClient.getAdminUsers({
          role: roleFilter !== 'ALL' ? roleFilter : undefined,
          search: search.trim() || undefined,
        });

        if (isMounted) {
          if (Array.isArray(res)) {
            setUsers(res);
          } else {
            setUsers([]);
          }
        }
      } catch {
        // Safe fallback
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [roleFilter, search]);

  useEffect(() => {
    let active = true;
    apiClient.getCurrentUser().then((user) => {
      if (active) setCurrentUserId(String(user?.id || user?._id || ''));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  function openEditModal(user: CampusUser) {
    setSelectedUser(user);
    setEditUserType(user.userType || 'UNSPECIFIED');
    setEditSecurityPost(user.securityPost || '');
    setEditDepartment(user.department || '');
    setEditPhone(user.phone || '');
    setEditIsActive(user.isActive);
    setErrorMsg('');
    setSuccessMsg('');
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;

    const phoneChanged = editPhone.trim() !== (selectedUser.phone || '').trim();
    const normalizedPhone = phoneChanged ? normalizeIndianMobileInput(editPhone) : undefined;
    if (phoneChanged && normalizedPhone === null) {
      setErrorMsg('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await apiClient.updateAdminUser(selectedUser._id, {
        userType: editUserType,
        securityPost: editSecurityPost.trim() || undefined,
        department: editDepartment.trim() || undefined,
        phone: normalizedPhone ?? undefined,
        isActive: editIsActive,
      });

      setSuccessMsg(`Permissions updated for ${selectedUser.fullName}.`);
      setTimeout(() => {
        setSelectedUser(null);
        loadUsers();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    const normalizedPhone = normalizeIndianMobileInput(newUser.phone);
    if (normalizedPhone === null) {
      setCreateError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setCreating(true);
    setCreateError('');

    try {
      await apiClient.createAdminUser({
        ...newUser,
        fullName: newUser.fullName.trim(),
        registrationNumber: newUser.registrationNumber.trim().toUpperCase(),
        email: newUser.email.trim().toLowerCase(),
        department: newUser.department.trim(),
        securityPost: newUser.securityPost.trim(),
        phone: normalizedPhone,
      });
      setIsCreateModalOpen(false);
      setNewUser(EMPTY_NEW_USER);
      await loadUsers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create campus account.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUser(user: CampusUser) {
    if (user._id === currentUserId) {
      setListFeedback('You cannot delete the account currently signed in.');
      return;
    }
    const confirmed = window.confirm(
      `Delete ${user.fullName} (${user.registrationNumber})? Accounts linked to reports, claims, custody, handovers, audit, or notifications will be deactivated so their history is preserved. This also revokes their existing sessions.`
    );
    if (!confirmed) return;

    setDeletingUserId(user._id);
    setListFeedback('');
    try {
      const result = await apiClient.deleteAdminUser(user._id);
      setListFeedback(result.message || (result.deactivated ? 'Account deactivated; history preserved.' : 'Account deleted.'));
      await loadUsers();
    } catch (err: unknown) {
      setListFeedback(err instanceof Error ? err.message : 'Could not delete this account.');
    } finally {
      setDeletingUserId('');
    }
  }

  return (
    <DashboardLayout
      title="User Roles &amp; Security Permissions"
      subtitle="Role-Based Access Control (RBAC) governance, security post stations, and account statuses."
      role="CAMPUS_ADMIN"
    >
      {/* RBAC Policy Summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs text-xs space-y-3">
        <div className="flex items-center gap-2 font-bold text-slate-900 uppercase tracking-wider">
          <ShieldCheck className="h-4 w-4 text-red-700" />
          <span>Role Permissions Matrix (Active Campus Hierarchy)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-slate-600">
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <span className="font-bold text-slate-900 block mb-1">Student / Staff</span>
            <p className="text-[11px] leading-relaxed">
              Report items, submit claims, challenge private responses, and receive verified OTPs.
            </p>
          </div>
          <div className="rounded-lg bg-blue-50/60 p-3 border border-blue-100">
            <span className="font-bold text-blue-900 block mb-1">Campus Security</span>
            <p className="text-[11px] text-blue-950 leading-relaxed">
              Log intake, manage lockers, review claims (anti-self-approval), execute OTP handovers.
            </p>
          </div>
          <div className="rounded-lg bg-amber-50/60 p-3 border border-amber-100">
            <span className="font-bold text-amber-900 block mb-1">Campus Admin</span>
            <p className="text-[11px] text-amber-950 leading-relaxed">
              Operational oversight, retention periods, statutory disposal board, audit inspection.
            </p>
          </div>
          <div className="rounded-lg bg-red-50/60 p-3 border border-red-100">
            <span className="font-bold text-red-900 block mb-1">System Admin</span>
            <p className="text-[11px] text-red-950 leading-relaxed">
              Role assignment, security post stations, rate limit controls, system parameters.
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
            placeholder="Search by student name, registration no., or email..."
            className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            <option value="STUDENT_STAFF">Student / Staff</option>
            <option value="SECURITY_PERSONNEL">Security Personnel</option>
            <option value="CAMPUS_ADMIN">Campus Admin</option>
            <option value="SYSTEM_ADMIN">System Admin</option>
          </select>
          <button
            type="button"
            onClick={loadUsers}
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            Filter
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateError('');
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create User
          </button>
        </div>
      </div>

      {listFeedback && <div role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">{listFeedback}</div>}

      {/* Users Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">User &amp; Registration No.</th>
              <th className="px-4 py-3">Official Email</th>
              <th className="px-4 py-3">Department / Post</th>
              <th className="px-4 py-3">Assigned Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  Loading campus user accounts...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  No users found matching the filter criteria.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const roleConfig = ROLE_LABELS[user.role] || {
                  label: user.role,
                  badgeClass: 'bg-slate-100 text-slate-800',
                };
                const accountTypeLabel = USER_TYPE_LABELS[user.userType] || roleConfig.label;

                return (
                  <tr key={user._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-900 block">{user.fullName}</span>
                      <span className="font-mono text-[10px] text-slate-500">{user.registrationNumber}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-slate-800 font-medium block">
                        {user.securityPost || user.department || 'General Campus'}
                      </span>
                      {user.securityPost && (
                        <span className="text-[10px] text-blue-700 font-semibold">
                          Stationed Guard Post
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${roleConfig.badgeClass}`}
                      >
                        {accountTypeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <UserCheck className="h-3 w-3" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                          <UserX className="h-3 w-3" />
                          <span>Deactivated</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
                        >
                          <Edit className="h-3 w-3" />
                          <span>Manage</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(user)}
                          disabled={user._id === currentUserId || deletingUserId === user._id}
                          title={user._id === currentUserId ? 'You cannot delete the signed-in account' : 'Delete or deactivate account'}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 shadow-xs hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{deletingUserId === user._id ? 'Processing' : 'Delete'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Campus User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create Campus Account</h3>
                <p className="text-xs text-slate-500">Set the account type and initial login password.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close create account dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200" role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Full Name *</label>
                  <input
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                    required
                    maxLength={150}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Registration Number *</label>
                  <input
                    value={newUser.registrationNumber}
                    onChange={(e) => setNewUser({ ...newUser, registrationNumber: e.target.value })}
                    required
                    maxLength={30}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Official @lpu.in Email *</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Account Type *</label>
                  <select
                    value={newUser.userType}
                    onChange={(e) => setNewUser({ ...newUser, userType: e.target.value as typeof newUser.userType })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="STAFF">Staff</option>
                    <option value="SECURITY_OFFICER">Security Officer</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Initial Password *</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">At least 8 characters. Share it with the user securely.</span>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Department</label>
                  <input
                    value={newUser.department}
                    onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                    maxLength={150}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  />
                </div>
                {newUser.userType === 'SECURITY_OFFICER' && (
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Security Post</label>
                    <input
                      value={newUser.securityPost}
                      onChange={(e) => setNewUser({ ...newUser, securityPost: e.target.value })}
                      maxLength={150}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    maxLength={20}
                    inputMode="tel"
                    placeholder="10-digit or +91 number"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={newUser.isActive}
                  onChange={(e) => setNewUser({ ...newUser, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-red-700 focus:ring-red-600"
                />
                Account Active &amp; Authorized
              </label>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white shadow-xs hover:bg-red-800 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role & Security Post Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Manage Campus User Permissions</h3>
                <p className="text-xs text-slate-500">
                  {selectedUser.fullName} ({selectedUser.registrationNumber})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Type &amp; Role</label>
                <select
                  value={editUserType}
                  onChange={(e) => setEditUserType(e.target.value as UserType)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                >
                  <option value="STUDENT">Student</option>
                  <option value="STAFF">Staff</option>
                  <option value="SECURITY_OFFICER">Security Officer</option>
                  <option value="CAMPUS_ADMIN">Campus Administrator</option>
                  <option value="SYSTEM_ADMIN">System Administrator</option>
                  <option value="UNSPECIFIED">Unspecified Student / Staff</option>
                </select>
              </div>

              {editUserType === 'SECURITY_OFFICER' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Security Post Station Assignment
                  </label>
                  <input
                    type="text"
                    value={editSecurityPost}
                    onChange={(e) => setEditSecurityPost(e.target.value)}
                    placeholder="e.g. Uni-Mall Security Post, Block 34 Desk, Main Gate"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Designates the physical desk for custody intakes and OTP handovers.
                  </span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  placeholder="e.g. Division of Student Welfare or School of Computer Science"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="tel"
                  inputMode="tel"
                  maxLength={20}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="10-digit or +91 number"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-red-700 focus:ring-red-600"
                />
                <label htmlFor="isActiveToggle" className="font-semibold text-slate-800">
                  Account Active &amp; Authorized
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white shadow-xs hover:bg-red-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Save Privileges'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
