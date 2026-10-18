'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search,
  UserCheck,
  Edit,
  X,
  UserX
} from 'lucide-react';
import { DashboardLayout } from '@/components/navigation/DashboardLayout';
import { apiClient } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/constants';
import { UserRole } from '@/types';

interface CampusUser {
  _id: string;
  registrationNumber: string;
  email: string;
  fullName: string;
  role: UserRole;
  department?: string;
  securityPost?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<CampusUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<CampusUser | null>(null);

  // Edit Modal form state
  const [editRole, setEditRole] = useState<UserRole>('STUDENT_STAFF');
  const [editSecurityPost, setEditSecurityPost] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
        // Fallback demo users
        setUsers([
          {
            _id: 'u1',
            fullName: 'Rajesh Verma',
            registrationNumber: 'SEC-8812',
            email: 'rajesh.sec@lpu.in',
            role: 'SECURITY_PERSONNEL',
            securityPost: 'Uni-Mall Security Post',
            department: 'Campus Security',
            isActive: true,
            createdAt: '2026-08-10T10:00:00.000Z',
          },
          {
            _id: 'u2',
            fullName: 'Harpreet Kaur',
            registrationNumber: 'SEC-8814',
            email: 'harpreet.sec@lpu.in',
            role: 'SECURITY_PERSONNEL',
            securityPost: 'Block 34 Security Desk',
            department: 'Campus Security',
            isActive: true,
            createdAt: '2026-08-12T10:00:00.000Z',
          },
          {
            _id: 'u3',
            fullName: 'Dr. Sorabh Lakhanpal',
            registrationNumber: 'ADM-1001',
            email: 'dean.dsw@lpu.in',
            role: 'CAMPUS_ADMIN',
            department: 'Division of Student Welfare (DSW)',
            isActive: true,
            createdAt: '2026-07-01T10:00:00.000Z',
          },
          {
            _id: 'u4',
            fullName: 'Aarav Sharma',
            registrationNumber: '12108492',
            email: 'aarav.12108492@lpu.in',
            role: 'STUDENT_STAFF',
            department: 'B.Tech CSE',
            isActive: true,
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ]);
      }
    } catch {
      // Safe fallback
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
            setUsers([
              {
                _id: 'u1',
                fullName: 'Rajesh Verma',
                registrationNumber: 'SEC-8812',
                email: 'rajesh.sec@lpu.in',
                role: 'SECURITY_PERSONNEL',
                securityPost: 'Uni-Mall Security Post',
                department: 'Campus Security',
                isActive: true,
                createdAt: '2026-08-10T10:00:00.000Z',
              },
              {
                _id: 'u2',
                fullName: 'Harpreet Kaur',
                registrationNumber: 'SEC-8814',
                email: 'harpreet.sec@lpu.in',
                role: 'SECURITY_PERSONNEL',
                securityPost: 'Block 34 Security Desk',
                department: 'Campus Security',
                isActive: true,
                createdAt: '2026-08-12T10:00:00.000Z',
              },
              {
                _id: 'u3',
                fullName: 'Dr. Sorabh Lakhanpal',
                registrationNumber: 'ADM-1001',
                email: 'dean.dsw@lpu.in',
                role: 'CAMPUS_ADMIN',
                department: 'Division of Student Welfare (DSW)',
                isActive: true,
                createdAt: '2026-07-01T10:00:00.000Z',
              },
              {
                _id: 'u4',
                fullName: 'Aarav Sharma',
                registrationNumber: '12108492',
                email: 'aarav.12108492@lpu.in',
                role: 'STUDENT_STAFF',
                department: 'B.Tech CSE',
                isActive: true,
                createdAt: '2026-09-01T10:00:00.000Z',
              },
            ]);
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

  function openEditModal(user: CampusUser) {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditSecurityPost(user.securityPost || '');
    setEditDepartment(user.department || '');
    setEditIsActive(user.isActive);
    setErrorMsg('');
    setSuccessMsg('');
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await apiClient.updateAdminUser(selectedUser._id, {
        role: editRole,
        securityPost: editSecurityPost.trim() || undefined,
        department: editDepartment.trim() || undefined,
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

        <div className="flex items-center gap-2">
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
        </div>
      </div>

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
                        {roleConfig.label}
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
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
                      >
                        <Edit className="h-3 w-3" />
                        <span>Manage</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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
                <label className="block font-semibold text-slate-700 mb-1">Assigned Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-red-600 focus:outline-none"
                >
                  <option value="STUDENT_STAFF">Student / Staff</option>
                  <option value="SECURITY_PERSONNEL">Security Personnel</option>
                  <option value="CAMPUS_ADMIN">Campus Administrator</option>
                  <option value="SYSTEM_ADMIN">System Administrator</option>
                </select>
              </div>

              {editRole === 'SECURITY_PERSONNEL' && (
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
