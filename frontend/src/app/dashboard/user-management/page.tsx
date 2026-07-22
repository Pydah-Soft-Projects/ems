'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import {
  EmsRole,
  EmsUser,
  HrmsUserOption,
  PrivilegesCatalog,
} from '@/types/user-management';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { useToast } from '@/components/ui/Toast';

type Tab = 'users' | 'roles';

export default function UserManagementPage() {
  const toast = useToast();
  const me = getStoredUser();
  const canRead = can(me, ['users:read', 'roles:read']);
  const canWriteUsers = can(me, 'users:write');
  const canWriteRoles = can(me, 'roles:write');
  const canAssignSuper = can(me, 'users:super_admin') || !!me?.isSuperAdmin;

  const [tab, setTab] = useState<Tab>('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<EmsRole[]>([]);
  const [users, setUsers] = useState<EmsUser[]>([]);
  const [catalog, setCatalog] = useState<PrivilegesCatalog | null>(null);

  // Role form
  const [roleModal, setRoleModal] = useState<EmsRole | 'new' | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [rolePrivs, setRolePrivs] = useState<Set<string>>(new Set());
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [privSearch, setPrivSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // User form
  const [userModal, setUserModal] = useState(false);
  const [hrmsQuery, setHrmsQuery] = useState('');
  const [hrmsResults, setHrmsResults] = useState<HrmsUserOption[]>([]);
  const [selectedHrms, setSelectedHrms] = useState<HrmsUserOption | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | ''>('');
  const [userPrivs, setUserPrivs] = useState<Set<string>>(new Set());
  const [userPrivSearch, setUserPrivSearch] = useState('');
  const [userExpandedGroups, setUserExpandedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [superOnly, setSuperOnly] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [searchingHrms, setSearchingHrms] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roleList, userList, privs] = await Promise.all([
        api.getEmsRoles(),
        api.getEmsUsers({ limit: 200 }),
        api.getPrivilegeCatalog().catch(() => null),
      ]);
      setRoles(roleList);
      setUsers(userList.items);
      setCatalog(privs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const assignableRoles = useMemo(() => {
    return roles.filter((r) => {
      if (!r.isActive) return false;
      if (r.isSystemSuperAdmin && !canAssignSuper) return false;
      return true;
    });
  }, [roles, canAssignSuper]);

  const filteredGroups = useMemo(() => {
    const groups = catalog?.groups ?? [];
    const q = privSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        privileges: group.privileges.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            group.label.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.privileges.length > 0);
  }, [catalog, privSearch]);

  const totalPrivileges = useMemo(
    () =>
      (catalog?.groups ?? []).reduce(
        (sum, group) => sum + group.privileges.length,
        0,
      ),
    [catalog],
  );

  const filteredUserPrivilegeGroups = useMemo(() => {
    const groups = catalog?.groups ?? [];
    const q = userPrivSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        privileges: group.privileges.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            group.label.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.privileges.length > 0);
  }, [catalog, userPrivSearch]);

  function openNewRole() {
    setRoleModal('new');
    setRoleName('');
    setRoleDesc('');
    setRolePrivs(new Set());
    setRoleError('');
    setPrivSearch('');
    // Start with the first group open so the dialog doesn't feel empty
    setExpandedGroups(new Set(catalog?.groups?.[0] ? [catalog.groups[0].id] : []));
  }

  function openEditRole(role: EmsRole) {
    if (role.isSystemSuperAdmin) {
      toast.push('System Super Admin role cannot be edited', 'danger');
      return;
    }
    setRoleModal(role);
    setRoleName(role.name);
    setRoleDesc(role.description ?? '');
    setRolePrivs(new Set(role.privileges));
    setRoleError('');
    setPrivSearch('');
    // Open groups that already contain selected privileges
    const withSelection = (catalog?.groups ?? [])
      .filter((g) => g.privileges.some((p) => role.privileges.includes(p.key)))
      .map((g) => g.id);
    setExpandedGroups(new Set(withSelection));
  }

  function toggleGroupExpanded(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function togglePrivilege(key: string, checked: boolean) {
    setRolePrivs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setGroupPrivileges(keys: string[], checked: boolean) {
    setRolePrivs((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  async function saveRole() {
    if (!roleName.trim()) {
      setRoleError('Role name is required');
      return;
    }
    if (rolePrivs.size === 0) {
      setRoleError('Select at least one privilege');
      return;
    }
    setSavingRole(true);
    setRoleError('');
    try {
      const payload = {
        name: roleName.trim(),
        description: roleDesc.trim(),
        privileges: [...rolePrivs],
      };
      if (roleModal === 'new') {
        await api.createEmsRole(payload);
        toast.push('Role created');
      } else if (roleModal) {
        await api.updateEmsRole(roleModal.id, payload);
        toast.push('Role updated');
      }
      setRoleModal(null);
      await load();
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : 'Failed to save role');
    } finally {
      setSavingRole(false);
    }
  }

  async function removeRole(role: EmsRole) {
    if (!confirm(`Delete role “${role.name}”?`)) return;
    try {
      await api.deleteEmsRole(role.id);
      toast.push('Role deleted');
      await load();
    } catch (err) {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to delete role',
        'danger',
      );
    }
  }

  async function searchHrms() {
    setSearchingHrms(true);
    setError('');
    try {
      const res = await api.searchHrmsUsers({
        q: hrmsQuery,
        limit: 30,
        superAdminsOnly: superOnly,
      });
      setHrmsResults(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'HRMS search failed');
    } finally {
      setSearchingHrms(false);
    }
  }

  function openNewUser(opts?: { superOnly?: boolean }) {
    setUserModal(true);
    setHrmsQuery('');
    setHrmsResults([]);
    setSelectedHrms(null);
    setSelectedRoleId('');
    setUserPrivs(new Set());
    setUserPrivSearch('');
    setUserExpandedGroups(new Set());
    setSuperOnly(!!opts?.superOnly);
  }

  async function saveUser() {
    if (!selectedHrms) {
      setError('Select an HRMS user');
      return;
    }
    if (!selectedRoleId) {
      setError('Select an EMS role');
      return;
    }
    if (!superOnly && userPrivs.size === 0) {
      setError('Select at least one privilege for this user');
      return;
    }
    setSavingUser(true);
    setError('');
    try {
      await api.createEmsUser({
        hrmsUserId: selectedHrms.id,
        hrmsSource: selectedHrms.source,
        roleId: Number(selectedRoleId),
        privileges: [...userPrivs],
      });
      toast.push('EMS user created');
      setUserModal(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setSavingUser(false);
    }
  }

  function applyRoleTemplate(roleId: number | '') {
    setSelectedRoleId(roleId);
    if (!roleId) {
      setUserPrivs(new Set());
      setUserExpandedGroups(new Set());
      return;
    }
    const role = roles.find((entry) => entry.id === roleId);
    if (!role || role.isSystemSuperAdmin) {
      setUserPrivs(new Set());
      setUserExpandedGroups(new Set());
      return;
    }
    const next = new Set(role.privileges);
    setUserPrivs(next);
    const withSelection = (catalog?.groups ?? [])
      .filter((group) => group.privileges.some((p) => next.has(p.key)))
      .map((group) => group.id);
    setUserExpandedGroups(new Set(withSelection));
  }

  async function toggleUserActive(user: EmsUser) {
    try {
      await api.updateEmsUser(user.id, { isActive: !user.isActive });
      toast.push(user.isActive ? 'User deactivated' : 'User activated');
      await load();
    } catch (err) {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to update user',
        'danger',
      );
    }
  }

  async function changeUserRole(user: EmsUser, roleId: number) {
    try {
      await api.updateEmsUser(user.id, { roleId });
      toast.push('Role updated');
      await load();
    } catch (err) {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to update role',
        'danger',
      );
    }
  }

  if (!canRead) return <AccessDenied />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="User management"
        description="Create EMS roles as privilege templates, then provision HRMS people with their own editable privilege set. Runtime access uses each user's privileges."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            tab === 'users'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-white border border-[var(--border)] text-slate-700'
          }`}
        >
          Users ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            tab === 'roles'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-white border border-[var(--border)] text-slate-700'
          }`}
        >
          Roles ({roles.length})
        </button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : tab === 'roles' ? (
        <section className="space-y-3">
          <div className="flex justify-end">
            {canWriteRoles ? (
              <Button type="button" onClick={openNewRole}>
                New role
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Privileges</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{role.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {role.description || '—'}
                      </p>
                      {role.isSystemSuperAdmin ? (
                        <Badge variant="success">System Super Admin</Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">
                      {role.isSystemSuperAdmin
                        ? 'All privileges'
                        : `${role.privileges.length} privilege(s)`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={role.isActive ? 'success' : 'warning'}>
                        {role.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canWriteRoles && !role.isSystemSuperAdmin ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => openEditRole(role)}
                            >
                              Edit
                            </Button>
                            {!role.isSystem ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => void removeRole(role)}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            {canWriteUsers ? (
              <>
                <Button type="button" onClick={() => openNewUser()}>
                  Add user from HRMS
                </Button>
                {canAssignSuper ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => openNewUser({ superOnly: true })}
                  >
                    Add Super Admin
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Bootstrap Super Admin <strong>ravi@pydahsoft.in</strong> has
            unrestricted access without needing an EMS user row.
          </p>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">EMS role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-[var(--muted)]"
                    >
                      No EMS users yet. Add staff from HRMS.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {user.fullName || user.email}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {user.email}
                          {user.employeeNumber
                            ? ` · Employee #${user.employeeNumber}`
                            : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {canWriteUsers ? (
                          <select
                            className="rounded border border-[var(--border)] px-2 py-1 text-sm"
                            value={user.roleId}
                            onChange={(e) =>
                              void changeUserRole(
                                user,
                                parseInt(e.target.value, 10),
                              )
                            }
                          >
                            {assignableRoles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                            {user.role &&
                            !assignableRoles.some((r) => r.id === user.roleId) ? (
                              <option value={user.roleId}>
                                {user.role.name}
                              </option>
                            ) : null}
                          </select>
                        ) : (
                          user.role?.name ?? '—'
                        )}
                        {user.privileges?.length > 0 ? (
                          <p className="mt-1 text-[11px] font-medium text-[var(--primary)]">
                            {user.privileges.length} user privilege
                            {user.privileges.length === 1 ? '' : 's'}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={user.isActive ? 'success' : 'warning'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {canWriteUsers ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void toggleUserActive(user)}
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Role modal */}
      {roleModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {roleModal === 'new'
                    ? 'Create a new role'
                    : `Edit role — ${roleModal.name}`}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Name the role and pick its default privilege template.
                  Creating a user copies these privileges onto that user, where
                  they can still be edited independently.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setRoleModal(null)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="h-5 w-5"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {roleError ? <Alert tone="danger">{roleError}</Alert> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    Role name <span className="text-rose-500">*</span>
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                    placeholder="e.g. Examination Cell"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    autoFocus
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Description</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                    placeholder="What is this role for? (optional)"
                    value={roleDesc}
                    onChange={(e) => setRoleDesc(e.target.value)}
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Privileges
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Expand a module and tick the actions this role may perform.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      rolePrivs.size > 0
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {rolePrivs.size} of {totalPrivileges} selected
                  </span>
                </div>

                <div className="relative mb-3">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  >
                    <circle cx="9" cy="9" r="5.5" />
                    <path d="M13.5 13.5L17 17" />
                  </svg>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                    placeholder="Search privileges (e.g. exams, approve, fees)…"
                    value={privSearch}
                    onChange={(e) => setPrivSearch(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  {filteredGroups.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                      No privileges match “{privSearch}”.
                    </p>
                  ) : (
                    filteredGroups.map((group) => {
                      const groupKeys = group.privileges.map((p) => p.key);
                      const selectedCount = groupKeys.filter((k) =>
                        rolePrivs.has(k),
                      ).length;
                      const allSelected = selectedCount === groupKeys.length;
                      const isOpen =
                        privSearch.trim().length > 0 ||
                        expandedGroups.has(group.id);
                      return (
                        <div
                          key={group.id}
                          className={`overflow-hidden rounded-xl border transition ${
                            selectedCount > 0
                              ? 'border-[var(--primary)]/40 bg-[var(--primary)]/[0.03]'
                              : 'border-[var(--border)] bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => toggleGroupExpanded(group.id)}
                              className="flex flex-1 items-center gap-2 text-left"
                              aria-expanded={isOpen}
                            >
                              <svg
                                viewBox="0 0 20 20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                                  isOpen ? 'rotate-90' : ''
                                }`}
                              >
                                <path d="M7 5l6 5-6 5" />
                              </svg>
                              <span className="text-sm font-semibold text-slate-800">
                                {group.label}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  selectedCount > 0
                                    ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {selectedCount}/{groupKeys.length}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setGroupPrivileges(groupKeys, !allSelected)
                              }
                              className="shrink-0 text-xs font-semibold text-[var(--primary)] hover:underline"
                            >
                              {allSelected ? 'Clear all' : 'Select all'}
                            </button>
                          </div>
                          {isOpen ? (
                            <div className="grid gap-1.5 border-t border-[var(--border)]/70 px-3 py-3 sm:grid-cols-2">
                              {group.privileges.map((p) => {
                                const checked = rolePrivs.has(p.key);
                                return (
                                  <label
                                    key={p.key}
                                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                                      checked
                                        ? 'border-[var(--primary)]/50 bg-[var(--primary)]/[0.06]'
                                        : 'border-transparent hover:bg-slate-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                                      checked={checked}
                                      onChange={(e) =>
                                        togglePrivilege(p.key, e.target.checked)
                                      }
                                    />
                                    <span>
                                      <span className="font-medium text-slate-800">
                                        {p.label}
                                      </span>
                                      <span className="block font-mono text-[10px] text-[var(--muted)]">
                                        {p.key}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-slate-50 px-6 py-4">
              <p className="text-xs text-[var(--muted)]">
                {rolePrivs.size === 0
                  ? 'Select at least one privilege to save.'
                  : `This role grants ${rolePrivs.size} privilege${rolePrivs.size === 1 ? '' : 's'}.`}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRoleModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveRole()}
                  disabled={savingRole || !roleName.trim() || rolePrivs.size === 0}
                >
                  {savingRole
                    ? 'Saving…'
                    : roleModal === 'new'
                      ? 'Create role'
                      : 'Save changes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* User modal */}
      {userModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {superOnly
                    ? 'Add EMS Super Admin from HRMS'
                    : 'Add EMS user from HRMS'}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Search and select a person on the left, then set their EMS
                  privileges on the right.
                </p>
                {superOnly ? (
                  <p className="mt-1 text-xs text-amber-800">
                    Only HRMS Super Admin accounts are listed. This grants
                    unrestricted EMS access.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setUserModal(false)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="h-5 w-5"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-2">
              {/* Left: select person + details */}
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b border-[var(--border)] p-5 lg:border-b-0 lg:border-r">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Select person
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Search by employee number, name, or email.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                    placeholder="e.g. 2144"
                    value={hrmsQuery}
                    onChange={(e) => setHrmsQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void searchHrms();
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    onClick={() => void searchHrms()}
                    disabled={searchingHrms}
                  >
                    {searchingHrms ? 'Searching…' : 'Search'}
                  </Button>
                </div>

                <ul className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-slate-50/50 p-2">
                  {hrmsResults.length === 0 ? (
                    <li className="px-2 py-6 text-center text-sm text-[var(--muted)]">
                      Enter an employee number to search HRMS.
                    </li>
                  ) : (
                    hrmsResults.map((u) => {
                      const disabled =
                        u.alreadyProvisioned || u.isBootstrap || !u.isActive;
                      const selected =
                        selectedHrms?.id === u.id &&
                        selectedHrms?.source === u.source;
                      return (
                        <li key={`${u.source}:${u.id}`}>
                          <label
                            className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                              selected
                                ? 'bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30'
                                : 'hover:bg-white'
                            } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <input
                              type="radio"
                              name="hrmsUser"
                              className="mt-1"
                              disabled={disabled}
                              checked={selected}
                              onChange={() => setSelectedHrms(u)}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900">
                                {u.name || u.email}
                              </span>
                              <span className="block truncate text-xs text-[var(--muted)]">
                                {u.employeeNumber
                                  ? `#${u.employeeNumber} · `
                                  : ''}
                                {u.email}
                              </span>
                              {(u.department || u.division || u.designation) && (
                                <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                                  {[u.designation, u.department, u.division]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>

                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                    Selected person details
                  </p>
                  {selectedHrms ? (
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Full name
                        </dt>
                        <dd className="text-sm font-semibold text-slate-900">
                          {selectedHrms.name || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Employee number
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.employeeNumber || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Status
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.isActive ? 'Active' : 'Inactive'}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Email
                        </dt>
                        <dd className="break-all text-sm font-medium text-slate-800">
                          {selectedHrms.email || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Phone
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.phone || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Gender
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.gender || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Division
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.division || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Department
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.department || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Designation
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.designation || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Date of joining
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.dateOfJoining
                            ? new Date(
                                selectedHrms.dateOfJoining,
                              ).toLocaleDateString()
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          Location
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.location || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          HRMS source
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.source === 'user'
                            ? 'Login user'
                            : 'Employee record'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium text-[var(--muted)]">
                          HRMS role
                        </dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {selectedHrms.isHrmsSuperAdmin
                            ? 'Super Admin'
                            : selectedHrms.role ||
                              selectedHrms.roles?.[0] ||
                              '—'}
                        </dd>
                      </div>
                      {(selectedHrms.alreadyProvisioned ||
                        selectedHrms.isBootstrap) && (
                        <div className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {selectedHrms.isBootstrap
                            ? 'Bootstrap account — already has unrestricted EMS access.'
                            : 'Already provisioned in EMS.'}
                        </div>
                      )}
                    </dl>
                  ) : (
                    <p className="py-4 text-center text-sm text-[var(--muted)]">
                      Select a person from the search results to see their
                      details here.
                    </p>
                  )}
                </div>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">EMS role</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                    value={selectedRoleId}
                    onChange={(e) =>
                      applyRoleTemplate(
                        e.target.value ? parseInt(e.target.value, 10) : '',
                      )
                    }
                  >
                    <option value="">Select role…</option>
                    {(superOnly
                      ? assignableRoles.filter((r) => r.isSystemSuperAdmin)
                      : assignableRoles.filter((r) => !r.isSystemSuperAdmin)
                    ).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {!superOnly ? (
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      Role pre-fills privileges on the right. Edit them for this
                      user — access is stored on the user.
                    </span>
                  ) : null}
                </label>
              </div>

              {/* Right: privileges */}
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-slate-50/40 p-5">
                {superOnly ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-amber-950">
                      Unrestricted Super Admin access
                    </p>
                    <p className="mt-2 max-w-sm text-xs text-amber-900/80">
                      Privilege selection is not needed. This person will receive
                      full EMS access after creation.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          User privileges
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          These privileges are what this user will actually have
                          in EMS.
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          userPrivs.size > 0
                            ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {userPrivs.size} of {totalPrivileges} selected
                      </span>
                    </div>

                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                      placeholder="Search privileges…"
                      value={userPrivSearch}
                      onChange={(e) => setUserPrivSearch(e.target.value)}
                    />

                    <div className="space-y-1.5">
                      {filteredUserPrivilegeGroups.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-8 text-center text-sm text-[var(--muted)]">
                          No privileges match your search.
                        </p>
                      ) : (
                        filteredUserPrivilegeGroups.map((group) => {
                          const keys = group.privileges.map(
                            (privilege) => privilege.key,
                          );
                          const selectedCount = keys.filter((key) =>
                            userPrivs.has(key),
                          ).length;
                          const allSelected =
                            keys.length > 0 && selectedCount === keys.length;
                          const isOpen =
                            userPrivSearch.trim().length > 0 ||
                            userExpandedGroups.has(group.id);
                          return (
                            <div
                              key={group.id}
                              className={`overflow-hidden rounded-lg border bg-white ${
                                selectedCount > 0
                                  ? 'border-[var(--primary)]/40'
                                  : 'border-[var(--border)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 px-3 py-2">
                                <button
                                  type="button"
                                  className="flex flex-1 items-center gap-2 text-left"
                                  onClick={() =>
                                    setUserExpandedGroups((previous) => {
                                      const next = new Set(previous);
                                      if (next.has(group.id))
                                        next.delete(group.id);
                                      else next.add(group.id);
                                      return next;
                                    })
                                  }
                                >
                                  <svg
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    className={`h-4 w-4 text-slate-400 transition-transform ${
                                      isOpen ? 'rotate-90' : ''
                                    }`}
                                  >
                                    <path d="M7 5l6 5-6 5" />
                                  </svg>
                                  <span className="flex-1 text-sm font-semibold text-slate-800">
                                    {group.label}
                                  </span>
                                  <span className="text-xs text-[var(--muted)]">
                                    {selectedCount}/{keys.length}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="shrink-0 text-xs font-semibold text-[var(--primary)] hover:underline"
                                  onClick={() =>
                                    setUserPrivs((previous) => {
                                      const next = new Set(previous);
                                      for (const key of keys) {
                                        if (allSelected) next.delete(key);
                                        else next.add(key);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  {allSelected ? 'Clear all' : 'Select all'}
                                </button>
                              </div>
                              {isOpen ? (
                                <div className="grid gap-1 border-t border-[var(--border)] p-2">
                                  {group.privileges.map((privilege) => (
                                    <label
                                      key={privilege.key}
                                      className={`flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm ${
                                        userPrivs.has(privilege.key)
                                          ? 'bg-[var(--primary)]/[0.07]'
                                          : 'hover:bg-slate-50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                                        checked={userPrivs.has(privilege.key)}
                                        onChange={(e) =>
                                          setUserPrivs((previous) => {
                                            const next = new Set(previous);
                                            if (e.target.checked)
                                              next.add(privilege.key);
                                            else next.delete(privilege.key);
                                            return next;
                                          })
                                        }
                                      />
                                      <span>
                                        <span className="font-medium text-slate-800">
                                          {privilege.label}
                                        </span>
                                        <span className="block font-mono text-[10px] text-[var(--muted)]">
                                          {privilege.key}
                                        </span>
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-slate-50 px-6 py-4">
              <p className="text-xs text-[var(--muted)]">
                {!selectedHrms
                  ? 'Select a person to continue.'
                  : !selectedRoleId
                    ? 'Select an EMS role to continue.'
                    : !superOnly && userPrivs.size === 0
                      ? 'Select at least one privilege.'
                      : selectedHrms.name || selectedHrms.email}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setUserModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveUser()}
                  disabled={
                    savingUser ||
                    !selectedHrms ||
                    !selectedRoleId ||
                    (!superOnly && userPrivs.size === 0)
                  }
                >
                  {savingUser ? 'Saving…' : 'Create EMS user'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
