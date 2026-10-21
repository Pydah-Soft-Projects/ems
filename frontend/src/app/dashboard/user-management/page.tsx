'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import {
  EmsRole,
  EmsUser,
  HrmsUserOption,
  PrivilegesCatalog,
} from '@/types/user-management';
import { SdmsCollege, SdmsCourse, SdmsBranch } from '@/types/sdms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { useToast } from '@/components/ui/Toast';

type Tab = 'users' | 'roles';

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

interface MultiSelectOption {
  id: number;
  name: string;
  code?: string | null;
  group?: string;
}

function MultiSelectDropdown({
  label,
  icon,
  options,
  selectedIds,
  onChange,
  placeholder,
  allSelectedLabel = 'Global / All (Unrestricted)',
  disabled = false,
  disabledPlaceholder,
}: {
  label: string;
  icon?: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  allSelectedLabel?: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        (opt.code && opt.code.toLowerCase().includes(q)) ||
        (opt.group && opt.group.toLowerCase().includes(q)),
    );
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleOption(id: number) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function handleSelectAll() {
    onChange(options.map((o) => o.id));
  }

  function handleClearAll() {
    onChange([]);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          {icon ? <span>{icon}</span> : null}
          <span>{label}</span>
        </label>
        {selectedIds.length > 0 && !disabled ? (
          <span className="text-[11px] font-semibold text-[var(--primary)]">
            {selectedIds.length} of {options.length} selected
          </span>
        ) : null}
      </div>

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full min-h-[42px] flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition outline-none ${
          disabled
            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
            : open
              ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20 bg-white'
              : 'border-[var(--border)] bg-white hover:border-slate-300 text-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {disabled ? (
            <span className="text-slate-400 text-xs">
              {disabledPlaceholder || 'Disabled'}
            </span>
          ) : selectedIds.length === 0 ? (
            <span className="text-slate-500 text-xs">
              {allSelectedLabel}
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-1 max-h-16 overflow-y-auto py-0.5">
              {selectedIds.map((id) => {
                const opt = options.find((o) => o.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200"
                  >
                    <span className="truncate max-w-[160px]">{opt?.name || `#${id}`}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOption(id);
                      }}
                      className="cursor-pointer text-slate-400 hover:text-slate-700 font-bold ml-0.5"
                    >
                      ×
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover */}
      {open && !disabled ? (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <input
              type="text"
              className="flex-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--primary)]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="hover:underline px-1"
              >
                All
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="hover:underline px-1 text-slate-500"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-56">
            {filteredOptions.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate-400">
                No {label.toLowerCase()} found.
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedSet.has(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition ${
                      checked
                        ? 'bg-[var(--primary)]/10 text-slate-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                      checked={checked}
                      onChange={() => toggleOption(opt.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{opt.name}</p>
                      {opt.group ? (
                        <p className="text-[10px] text-slate-400 truncate">{opt.group}</p>
                      ) : null}
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] text-slate-500 flex items-center justify-between">
            <span>{selectedIds.length} of {options.length} selected</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-semibold text-[var(--primary)] hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

  // SDMS scope data
  const [colleges, setColleges] = useState<SdmsCollege[]>([]);
  const [coursesByCollege, setCoursesByCollege] = useState<Record<number, SdmsCourse[]>>({});
  const [branchesByCourse, setBranchesByCourse] = useState<Record<number, SdmsBranch[]>>({});

  // Table filters
  const [userSearch, setUserSearch] = useState('');
  const [filterRoleId, setFilterRoleId] = useState<number | ''>('');
  const [filterCollegeId, setFilterCollegeId] = useState<number | ''>('');
  const [filterCourseId, setFilterCourseId] = useState<number | ''>('');
  const [filterBranchId, setFilterBranchId] = useState<number | ''>('');

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
  const [selectedCollegeIds, setSelectedCollegeIds] = useState<number[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  const [userPrivs, setUserPrivs] = useState<Set<string>>(new Set());
  const [userPrivSearch, setUserPrivSearch] = useState('');
  const [userExpandedGroups, setUserExpandedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [superOnly, setSuperOnly] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [searchingHrms, setSearchingHrms] = useState(false);
  const hrmsDebounceTimerRef = useRef<number | null>(null);
  const hrmsLatestTokenRef = useRef(0);

  // Edit user privileges (does not change HRMS/profile details)
  const [editUserModal, setEditUserModal] = useState(false);
  const [editTargetUser, setEditTargetUser] = useState<EmsUser | null>(null);
  const [editRoleId, setEditRoleId] = useState<number | ''>('');
  const [editCollegeIds, setEditCollegeIds] = useState<number[]>([]);
  const [editCourseIds, setEditCourseIds] = useState<number[]>([]);
  const [editBranchIds, setEditBranchIds] = useState<number[]>([]);
  const [editPrivs, setEditPrivs] = useState<Set<string>>(new Set());
  const [editPrivSearch, setEditPrivSearch] = useState('');
  const [editSavingUser, setEditSavingUser] = useState(false);
  const [editError, setEditError] = useState('');

  const loadCoursesForCollege = useCallback(async (cId: number) => {
    if (!cId) return;
    try {
      const data = await api.getSdmsCourses(cId);
      setCoursesByCollege((prev) => ({ ...prev, [cId]: data }));
    } catch {
      // ignore
    }
  }, []);

  const loadBranchesForCourse = useCallback(async (crsId: number) => {
    if (!crsId) return;
    try {
      const data = await api.getSdmsBranches(crsId);
      setBranchesByCourse((prev) => ({ ...prev, [crsId]: data }));
    } catch {
      // ignore
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roleList, userList, privs, collegeList] = await Promise.all([
        api.getEmsRoles(),
        api.getEmsUsers({ limit: 200 }),
        api.getPrivilegeCatalog().catch(() => null),
        api.getSdmsColleges().catch(() => []),
      ]);
      setRoles(roleList);
      setUsers(userList.items);
      setCatalog(privs);
      setColleges(collegeList);

      // Preload courses & branches for existing users
      for (const u of userList.items) {
        const uColleges = u.collegeIds && u.collegeIds.length > 0
          ? u.collegeIds
          : (u.collegeId ? [u.collegeId] : []);
        const uCourses = u.courseIds && u.courseIds.length > 0
          ? u.courseIds
          : (u.courseId ? [u.courseId] : []);

        for (const cid of uColleges) {
          api.getSdmsCourses(cid).then((crs) => {
            setCoursesByCollege((prev) => ({ ...prev, [cid]: crs }));
          }).catch(() => {});
        }
        for (const crsId of uCourses) {
          api.getSdmsBranches(crsId).then((brs) => {
            setBranchesByCourse((prev) => ({ ...prev, [crsId]: brs }));
          }).catch(() => {});
        }
      }
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

  const assignableCatalogGroups = useMemo(() => {
    const groups = catalog?.groups ?? [];
    if (!me || me.isSuperAdmin || me.privileges?.includes('*')) {
      return groups;
    }
    const actorPrivs = new Set(me.privileges ?? []);
    return groups
      .map((group) => ({
        ...group,
        privileges: group.privileges.filter((p) => actorPrivs.has(p.key)),
      }))
      .filter((group) => group.privileges.length > 0);
  }, [catalog, me]);

  const editCatalogGroups = useMemo(() => {
    const groups = catalog?.groups ?? [];
    if (!me || me.isSuperAdmin || me.privileges?.includes('*')) {
      return groups;
    }
    const actorPrivs = new Set(me.privileges ?? []);
    return groups
      .map((group) => ({
        ...group,
        privileges: group.privileges.filter(
          (p) => actorPrivs.has(p.key) || editPrivs.has(p.key),
        ),
      }))
      .filter((group) => group.privileges.length > 0);
  }, [catalog, editPrivs, me]);

  const filteredGroups = useMemo(() => {
    const groups = assignableCatalogGroups;
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
  }, [assignableCatalogGroups, privSearch]);

  const totalPrivileges = useMemo(
    () =>
      assignableCatalogGroups.reduce(
        (sum, group) => sum + group.privileges.length,
        0,
      ),
    [assignableCatalogGroups],
  );

  const filteredUserPrivilegeGroups = useMemo(() => {
    const groups = assignableCatalogGroups;
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
  }, [assignableCatalogGroups, userPrivSearch]);

  const filteredEditPrivilegeGroups = useMemo(() => {
    const groups = editCatalogGroups;
    const q = editPrivSearch.trim().toLowerCase();
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
  }, [editCatalogGroups, editPrivSearch]);

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

  const searchHrmsNow = useCallback(
    async (q: string) => {
      const query = String(q ?? '').trim();

      // If we were waiting on debounce, cancel it because the user requested
      // an immediate search.
      if (hrmsDebounceTimerRef.current != null) {
        clearTimeout(hrmsDebounceTimerRef.current);
        hrmsDebounceTimerRef.current = null;
      }

      const token = ++hrmsLatestTokenRef.current;
      setSearchingHrms(true);
      setError('');

      try {
        const res = await api.searchHrmsUsers({
          q: query,
          limit: 30,
          superAdminsOnly: superOnly,
        });
        // Latest-request-wins: ignore out-of-order responses.
        if (token === hrmsLatestTokenRef.current) {
          setHrmsResults(res.items);
        }
      } catch (err) {
        if (token === hrmsLatestTokenRef.current) {
          setError(
            err instanceof ApiError ? err.message : 'HRMS search failed',
          );
        }
      } finally {
        if (token === hrmsLatestTokenRef.current) {
          setSearchingHrms(false);
        }
      }
    },
    [superOnly],
  );

  useEffect(() => {
    if (!userModal) return;

    // Debounce HRMS search input so we don't hammer the API.
    hrmsDebounceTimerRef.current = window.setTimeout(() => {
      hrmsDebounceTimerRef.current = null;
      void searchHrmsNow(hrmsQuery);
    }, 400);

    return () => {
      if (hrmsDebounceTimerRef.current != null) {
        clearTimeout(hrmsDebounceTimerRef.current);
        hrmsDebounceTimerRef.current = null;
      }
    };
  }, [userModal, hrmsQuery, searchHrmsNow]);

  const collegeOptions: MultiSelectOption[] = useMemo(() => {
    return colleges.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
    }));
  }, [colleges]);

  // Options for Add User Modal
  const addCourseOptions: MultiSelectOption[] = useMemo(() => {
    if (selectedCollegeIds.length === 0) return [];
    return selectedCollegeIds.flatMap((cid) => {
      const col = colleges.find((c) => c.id === cid);
      const crsList = coursesByCollege[cid] || [];
      return crsList.map((crs) => ({
        id: crs.id,
        name: crs.name,
        code: crs.code,
        group: selectedCollegeIds.length > 1 ? col?.name : undefined,
      }));
    });
  }, [selectedCollegeIds, colleges, coursesByCollege]);

  const addBranchOptions: MultiSelectOption[] = useMemo(() => {
    if (selectedCourseIds.length === 0) return [];
    return selectedCourseIds.flatMap((crsId) => {
      const crs = addCourseOptions.find((c) => c.id === crsId);
      const brList = branchesByCourse[crsId] || [];
      return brList.map((br) => ({
        id: br.id,
        name: br.name,
        code: br.code,
        group: selectedCourseIds.length > 1 ? crs?.name : undefined,
      }));
    });
  }, [selectedCourseIds, addCourseOptions, branchesByCourse]);

  // Options for Edit User Modal
  const editCourseOptions: MultiSelectOption[] = useMemo(() => {
    if (editCollegeIds.length === 0) return [];
    return editCollegeIds.flatMap((cid) => {
      const col = colleges.find((c) => c.id === cid);
      const crsList = coursesByCollege[cid] || [];
      return crsList.map((crs) => ({
        id: crs.id,
        name: crs.name,
        code: crs.code,
        group: editCollegeIds.length > 1 ? col?.name : undefined,
      }));
    });
  }, [editCollegeIds, colleges, coursesByCollege]);

  const editBranchOptions: MultiSelectOption[] = useMemo(() => {
    if (editCourseIds.length === 0) return [];
    return editCourseIds.flatMap((crsId) => {
      const crs = editCourseOptions.find((c) => c.id === crsId);
      const brList = branchesByCourse[crsId] || [];
      return brList.map((br) => ({
        id: br.id,
        name: br.name,
        code: br.code,
        group: editCourseIds.length > 1 ? crs?.name : undefined,
      }));
    });
  }, [editCourseIds, editCourseOptions, branchesByCourse]);

  // Handlers for Add User
  const handleAddCollegesChange = (newIds: number[]) => {
    setSelectedCollegeIds(newIds);
    newIds.forEach((cid) => {
      if (!coursesByCollege[cid]) {
        void loadCoursesForCollege(cid);
      }
    });
    if (newIds.length === 0) {
      setSelectedCourseIds([]);
      setSelectedBranchIds([]);
    } else {
      const validCourseIds = new Set(
        newIds.flatMap((cid) => (coursesByCollege[cid] || []).map((crs) => crs.id))
      );
      setSelectedCourseIds((prev) => {
        const nextCourses = prev.filter((id) => validCourseIds.has(id));
        const validBranchIds = new Set(
          nextCourses.flatMap((crsId) => (branchesByCourse[crsId] || []).map((br) => br.id))
        );
        setSelectedBranchIds((bPrev) => bPrev.filter((bId) => validBranchIds.has(bId)));
        return nextCourses;
      });
    }
  };

  const handleAddCoursesChange = (newCourseIds: number[]) => {
    setSelectedCourseIds(newCourseIds);
    newCourseIds.forEach((crsId) => {
      if (!branchesByCourse[crsId]) {
        void loadBranchesForCourse(crsId);
      }
    });
    if (newCourseIds.length === 0) {
      setSelectedBranchIds([]);
    } else {
      const validBranchIds = new Set(
        newCourseIds.flatMap((crsId) => (branchesByCourse[crsId] || []).map((br) => br.id))
      );
      setSelectedBranchIds((prev) => prev.filter((id) => validBranchIds.has(id)));
    }
  };

  // Handlers for Edit User
  const handleEditCollegesChange = (newIds: number[]) => {
    setEditCollegeIds(newIds);
    newIds.forEach((cid) => {
      if (!coursesByCollege[cid]) {
        void loadCoursesForCollege(cid);
      }
    });
    if (newIds.length === 0) {
      setEditCourseIds([]);
      setEditBranchIds([]);
    } else {
      const validCourseIds = new Set(
        newIds.flatMap((cid) => (coursesByCollege[cid] || []).map((crs) => crs.id))
      );
      setEditCourseIds((prev) => {
        const nextCourses = prev.filter((id) => validCourseIds.has(id));
        const validBranchIds = new Set(
          nextCourses.flatMap((crsId) => (branchesByCourse[crsId] || []).map((br) => br.id))
        );
        setEditBranchIds((bPrev) => bPrev.filter((bId) => validBranchIds.has(bId)));
        return nextCourses;
      });
    }
  };

  const handleEditCoursesChange = (newCourseIds: number[]) => {
    setEditCourseIds(newCourseIds);
    newCourseIds.forEach((crsId) => {
      if (!branchesByCourse[crsId]) {
        void loadBranchesForCourse(crsId);
      }
    });
    if (newCourseIds.length === 0) {
      setEditBranchIds([]);
    } else {
      const validBranchIds = new Set(
        newCourseIds.flatMap((crsId) => (branchesByCourse[crsId] || []).map((br) => br.id))
      );
      setEditBranchIds((prev) => prev.filter((id) => validBranchIds.has(id)));
    }
  };

  const targetColleges = useMemo(() => {
    if (!editTargetUser) return [];
    if (editTargetUser.collegeNames && editTargetUser.collegeNames.length > 0) {
      return editTargetUser.collegeNames;
    }
    if (editTargetUser.collegeName) return [editTargetUser.collegeName];
    return [];
  }, [editTargetUser]);

  const targetCourses = useMemo(() => {
    if (!editTargetUser) return [];
    if (editTargetUser.courseNames && editTargetUser.courseNames.length > 0) {
      return editTargetUser.courseNames;
    }
    if (editTargetUser.courseName) return [editTargetUser.courseName];
    return [];
  }, [editTargetUser]);

  const targetBranches = useMemo(() => {
    if (!editTargetUser) return [];
    if (editTargetUser.branchNames && editTargetUser.branchNames.length > 0) {
      return editTargetUser.branchNames;
    }
    if (editTargetUser.branchName) return [editTargetUser.branchName];
    return [];
  }, [editTargetUser]);

  function openNewUser(opts?: { superOnly?: boolean }) {
    setUserModal(true);
    setHrmsQuery('');
    setHrmsResults([]);
    setSelectedHrms(null);
    setSelectedRoleId('');
    setSelectedCollegeIds([]);
    setSelectedCourseIds([]);
    setSelectedBranchIds([]);
    setUserPrivs(new Set());
    setUserPrivSearch('');
    setUserExpandedGroups(new Set());
    setSuperOnly(!!opts?.superOnly);
  }

  function selectHrmsPerson(u: HrmsUserOption) {
    setSelectedHrms(u);
    if (u.division) {
      const match = colleges.find(
        (c) =>
          c.name.toLowerCase().includes(u.division!.toLowerCase()) ||
          u.division!.toLowerCase().includes(c.name.toLowerCase()),
      );
      if (match) {
        setSelectedCollegeIds([match.id]);
        setSelectedCourseIds([]);
        setSelectedBranchIds([]);
        void loadCoursesForCollege(match.id);
      }
    }
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
        collegeIds: selectedCollegeIds.length > 0 ? selectedCollegeIds : null,
        courseIds: selectedCourseIds.length > 0 ? selectedCourseIds : null,
        branchIds: selectedBranchIds.length > 0 ? selectedBranchIds : null,
        collegeId: selectedCollegeIds[0] ?? null,
        courseId: selectedCourseIds[0] ?? null,
        branchId: selectedBranchIds[0] ?? null,
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

  function openEditUser(user: EmsUser) {
    if (user.role?.isSystemSuperAdmin) {
      toast.push('System Super Admin role cannot be edited', 'danger');
      return;
    }
    setEditTargetUser(user);
    setEditRoleId(user.roleId ?? '');

    const cIds = user.collegeIds && user.collegeIds.length > 0
      ? user.collegeIds
      : (user.collegeId ? [user.collegeId] : []);
    const crsIds = user.courseIds && user.courseIds.length > 0
      ? user.courseIds
      : (user.courseId ? [user.courseId] : []);
    const brIds = user.branchIds && user.branchIds.length > 0
      ? user.branchIds
      : (user.branchId ? [user.branchId] : []);

    setEditCollegeIds(cIds);
    setEditCourseIds(crsIds);
    setEditBranchIds(brIds);

    cIds.forEach((cId) => void loadCoursesForCollege(cId));
    crsIds.forEach((crsId) => void loadBranchesForCourse(crsId));

    setEditPrivs(new Set(user.privileges ?? []));
    setEditPrivSearch('');
    setEditError('');
    setEditSavingUser(false);
    setEditUserModal(true);
  }

  function toggleEditPrivilege(key: string, checked: boolean) {
    setEditPrivs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setEditGroupPrivileges(keys: string[], checked: boolean) {
    setEditPrivs((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function applyEditRoleTemplate(roleId: number | '') {
    setEditRoleId(roleId);
    if (!roleId) {
      setEditPrivs(new Set());
      return;
    }
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.isSystemSuperAdmin) {
      setEditPrivs(new Set(role?.privileges ?? []));
      return;
    }
    setEditPrivs(new Set(role.privileges));
  }

  async function saveEditedUser() {
    if (!editTargetUser) return;
    if (!editRoleId) {
      setEditError('Select an EMS role');
      return;
    }
    if (!Number(editRoleId)) {
      setEditError('Invalid role selection');
      return;
    }
    const role = roles.find((r) => r.id === Number(editRoleId));
    if (!role) {
      setEditError('Role not found');
      return;
    }
    if (!role.isSystemSuperAdmin && editPrivs.size === 0) {
      setEditError('Select at least one privilege.');
      return;
    }

    setEditSavingUser(true);
    setEditError('');
    try {
      await api.updateEmsUser(editTargetUser.id, {
        roleId: Number(editRoleId),
        collegeIds: editCollegeIds.length > 0 ? editCollegeIds : null,
        courseIds: editCourseIds.length > 0 ? editCourseIds : null,
        branchIds: editBranchIds.length > 0 ? editBranchIds : null,
        collegeId: editCollegeIds[0] ?? null,
        courseId: editCourseIds[0] ?? null,
        branchId: editBranchIds[0] ?? null,
        privileges: [...editPrivs],
      });
      toast.push('User updated');
      setEditUserModal(false);
      setEditTargetUser(null);
      await load();
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : 'Failed to update user',
      );
    } finally {
      setEditSavingUser(false);
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterRoleId && u.roleId !== Number(filterRoleId)) return false;

      if (filterCollegeId) {
        const cId = Number(filterCollegeId);
        const uCols = u.collegeIds && u.collegeIds.length > 0 ? u.collegeIds : (u.collegeId ? [u.collegeId] : []);
        if (uCols.length > 0 && !uCols.includes(cId)) return false;
      }

      if (filterCourseId) {
        const crsId = Number(filterCourseId);
        const uCourses = u.courseIds && u.courseIds.length > 0 ? u.courseIds : (u.courseId ? [u.courseId] : []);
        if (uCourses.length > 0 && !uCourses.includes(crsId)) return false;
      }

      if (filterBranchId) {
        const brId = Number(filterBranchId);
        const uBranches = u.branchIds && u.branchIds.length > 0 ? u.branchIds : (u.branchId ? [u.branchId] : []);
        if (uBranches.length > 0 && !uBranches.includes(brId)) return false;
      }

      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase();
        const colNames = u.collegeNames?.join(' ') || u.collegeName || '';
        const crsNames = u.courseNames?.join(' ') || u.courseName || '';
        const brNames = u.branchNames?.join(' ') || u.branchName || '';
        const text = [
          u.fullName,
          u.email,
          u.employeeNumber,
          u.role?.name,
          colNames,
          crsNames,
          brNames,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [
    users,
    filterRoleId,
    filterCollegeId,
    filterCourseId,
    filterBranchId,
    userSearch,
  ]);

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
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--muted)]">
                Bootstrap Super Admin <strong>ravi@pydahsoft.in</strong> has
                unrestricted access without needing an EMS user row.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
          </div>

          {/* Filters Bar */}
          <div className="rounded-xl border border-[var(--border)] bg-slate-50/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Filter Users ({filteredUsers.length} of {users.length})
              </span>
              {(userSearch || filterRoleId || filterCollegeId || filterCourseId || filterBranchId) ? (
                <button
                  type="button"
                  onClick={() => {
                    setUserSearch('');
                    setFilterRoleId('');
                    setFilterCollegeId('');
                    setFilterCourseId('');
                    setFilterBranchId('');
                  }}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  Clear all filters
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-5">
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                placeholder="Search name, email, employee #…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />

              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-[var(--primary)]"
                value={filterRoleId}
                onChange={(e) => setFilterRoleId(e.target.value ? parseInt(e.target.value, 10) : '')}
              >
                <option value="">All Roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-[var(--primary)]"
                value={filterCollegeId}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : '';
                  setFilterCollegeId(val);
                  setFilterCourseId('');
                  setFilterBranchId('');
                  if (val) void loadCoursesForCollege(val);
                }}
              >
                <option value="">All Colleges</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                disabled={!filterCollegeId}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-[var(--primary)] disabled:bg-slate-100 disabled:text-slate-400"
                value={filterCourseId}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : '';
                  setFilterCourseId(val);
                  setFilterBranchId('');
                  if (val) void loadBranchesForCourse(val);
                }}
              >
                <option value="">All Courses</option>
                {(filterCollegeId ? coursesByCollege[Number(filterCollegeId)] || [] : []).map((crs) => (
                  <option key={crs.id} value={crs.id}>
                    {crs.name}
                  </option>
                ))}
              </select>

              <select
                disabled={!filterCourseId}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-[var(--primary)] disabled:bg-slate-100 disabled:text-slate-400"
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value ? parseInt(e.target.value, 10) : '')}
              >
                <option value="">All Branches</option>
                {(filterCourseId ? branchesByCourse[Number(filterCourseId)] || [] : []).map((br) => (
                  <option key={br.id} value={br.id}>
                    {br.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">User / Staff</th>
                    <th className="px-5 py-3.5">EMS Role</th>
                    <th className="px-5 py-3.5">Academic Scope</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-12 text-center text-sm text-slate-500"
                      >
                        {users.length === 0
                          ? 'No EMS users found. Add staff from HRMS.'
                          : 'No users match the selected filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="transition hover:bg-slate-50/70"
                      >
                        {/* 1. User / Staff Column */}
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-600 text-xs font-bold text-white shadow-xs ring-2 ring-white">
                              {getInitials(user.fullName, user.email)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">
                                {user.fullName || user.email}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {user.email || 'No email registered'}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {user.employeeNumber ? (
                                  <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                    #{user.employeeNumber}
                                  </span>
                                ) : null}
                                <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                                  ID: {user.id}
                                </span>
                                <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                  {user.hrmsSource === 'user' ? 'HRMS User' : 'HRMS Employee'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. EMS Role Column */}
                        <td className="px-5 py-4 align-middle">
                          <div className="space-y-1">
                            <div>
                              {user.role?.isSystemSuperAdmin ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 shadow-2xs">
                                  👑 {user.role?.name || 'Super Admin'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-800 shadow-2xs">
                                  🛡️ {user.role?.name || 'Staff'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              <span className="font-semibold text-slate-700">
                                {user.privileges?.length || 0}
                              </span>{' '}
                              privilege{user.privileges?.length === 1 ? '' : 's'} assigned
                            </p>
                          </div>
                        </td>

                        {/* 3. Academic Scope Column */}
                        <td className="px-5 py-4 align-middle">
                          {(() => {
                            const colNames = user.collegeNames && user.collegeNames.length > 0
                              ? user.collegeNames
                              : (user.collegeName ? [user.collegeName] : []);
                            const crsNames = user.courseNames && user.courseNames.length > 0
                              ? user.courseNames
                              : (user.courseName ? [user.courseName] : []);
                            const brNames = user.branchNames && user.branchNames.length > 0
                              ? user.branchNames
                              : (user.branchName ? [user.branchName] : []);

                            if (colNames.length === 0) {
                              return (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-900 shadow-2xs">
                                  <span>🌐</span>
                                  <span>All Colleges (Global Scope)</span>
                                </span>
                              );
                            }

                            return (
                              <div className="flex flex-col gap-1.5 max-w-sm">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {colNames.map((cn, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-900 shadow-2xs"
                                      title={cn}
                                    >
                                      <span>🏛️</span>
                                      <span className="font-semibold truncate max-w-[200px]">{cn}</span>
                                    </span>
                                  ))}
                                </div>
                                {(crsNames.length > 0 || brNames.length > 0) && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {crsNames.map((crsN, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-900"
                                        title={crsN}
                                      >
                                        <span>🎓</span>
                                        <span className="truncate max-w-[170px]">{crsN}</span>
                                      </span>
                                    ))}
                                    {brNames.map((brN, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                                        title={brN}
                                      >
                                        <span>🌿</span>
                                        <span className="truncate max-w-[150px]">{brN}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* 4. Status Column */}
                        <td className="px-5 py-4 align-middle">
                          {user.isActive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* 5. Actions Column */}
                        <td className="px-5 py-4 align-middle text-right">
                          {canWriteUsers ? (
                            <div className="flex items-center justify-end gap-2">
                              {user.role?.isSystemSuperAdmin ? null : (
                                <button
                                  type="button"
                                  onClick={() => openEditUser(user)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 hover:text-[var(--primary)]"
                                >
                                  <svg
                                    className="h-3.5 w-3.5 text-slate-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                    />
                                  </svg>
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void toggleUserActive(user)}
                                className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                  user.isActive
                                    ? 'border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {user.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
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

      {/* Edit user privileges modal */}
      {editUserModal && editTargetUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-600 text-sm font-bold text-white shadow-xs ring-2 ring-white">
                  {getInitials(editTargetUser.fullName, editTargetUser.email)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {editTargetUser.fullName || editTargetUser.email}
                    </h2>
                    {editTargetUser.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <span className="h-1 w-1 rounded-full bg-emerald-500"></span>
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {editTargetUser.email || 'No email registered'}
                    {editTargetUser.employeeNumber ? ` · #${editTargetUser.employeeNumber}` : ''}
                    {' · '}
                    <span className="font-mono text-[11px] text-slate-400">ID: {editTargetUser.id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setEditUserModal(false)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
              {/* Left Column: Role & Academic Scope */}
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-[var(--border)] p-5 lg:border-b-0 lg:border-r">
                {/* Active Scope Summary Card */}
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Current Academic Scope
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Current Role: <strong className="text-slate-700">{editTargetUser.role?.name || '—'}</strong>
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-col gap-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Colleges:</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {targetColleges.length > 0 ? (
                          targetColleges.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                              🏛️ {c}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                            🌐 All Colleges (Global Scope)
                          </span>
                        )}
                      </div>
                    </div>

                    {targetCourses.length > 0 ? (
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-slate-400">Courses:</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {targetCourses.map((crs, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
                              🎓 {crs}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {targetBranches.length > 0 ? (
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-slate-400">Branches:</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {targetBranches.map((br, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                              🌿 {br}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Role Assignment Card */}
                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <label className="block text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">EMS Role</span>
                      <span className="text-[11px] text-slate-500">Template for permissions</span>
                    </div>
                    <select
                      className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                      value={editRoleId}
                      onChange={(e) =>
                        applyEditRoleTemplate(
                          e.target.value
                            ? parseInt(e.target.value, 10)
                            : '',
                        )
                      }
                    >
                      <option value="">Select role…</option>
                      {assignableRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-1.5 text-xs text-[var(--muted)]">
                    Selecting a role pre-fills its standard privileges on the right. You can customize them freely.
                  </p>
                </div>

                {/* Academic Scope Assignment Card */}
                <div className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-3.5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                      Academic Scope Assignment
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Assign this user to multiple Colleges, Courses, and Branches. Leave unselected for Global / All unrestricted scope.
                    </p>
                  </div>

                  <MultiSelectDropdown
                    label="Assigned colleges"
                    icon="🏛️"
                    options={collegeOptions}
                    selectedIds={editCollegeIds}
                    onChange={handleEditCollegesChange}
                    allSelectedLabel="All Colleges (Global Scope)"
                    placeholder="Select colleges…"
                  />

                  <MultiSelectDropdown
                    label="Assigned courses"
                    icon="🎓"
                    options={editCourseOptions}
                    selectedIds={editCourseIds}
                    onChange={handleEditCoursesChange}
                    allSelectedLabel="All Courses across selected colleges"
                    placeholder="Select courses…"
                    disabled={editCollegeIds.length === 0}
                    disabledPlaceholder="Select at least one college first"
                  />

                  <MultiSelectDropdown
                    label="Assigned branches"
                    icon="🌿"
                    options={editBranchOptions}
                    selectedIds={editBranchIds}
                    onChange={setEditBranchIds}
                    allSelectedLabel="All Branches across selected courses"
                    placeholder="Select branches…"
                    disabled={editCourseIds.length === 0}
                    disabledPlaceholder="Select at least one course first"
                  />
                </div>
              </div>

              {/* Right Column: User Privileges */}
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-slate-50/40 p-5">
                {editError ? <Alert tone="danger">{editError}</Alert> : null}

                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      User privileges
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      These privileges are what runtime access uses.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      editPrivs.size > 0
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {editPrivs.size} of {totalPrivileges} selected
                  </span>
                </div>

                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                  placeholder="Search privileges…"
                  value={editPrivSearch}
                  onChange={(e) => setEditPrivSearch(e.target.value)}
                />

                <div className="space-y-1.5">
                  {filteredEditPrivilegeGroups.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-8 text-center text-sm text-[var(--muted)]">
                      No privileges match your search.
                    </p>
                  ) : (
                    filteredEditPrivilegeGroups.map((group) => {
                      const keys = group.privileges.map((p) => p.key);
                      const selectedCount = keys.filter((k) =>
                        editPrivs.has(k),
                      ).length;
                      const allSelected =
                        keys.length > 0 && selectedCount === keys.length;
                      return (
                        <div
                          key={group.id}
                          className={`overflow-hidden rounded-xl border ${
                            selectedCount > 0
                              ? 'border-[var(--primary)]/40 bg-[var(--primary)]/[0.03]'
                              : 'border-[var(--border)] bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between px-3 py-2">
                            <p className="text-sm font-semibold text-slate-800">
                              {group.label}
                            </p>
                            <button
                              type="button"
                              className="text-xs font-semibold text-[var(--primary)] hover:underline"
                              onClick={() => setEditGroupPrivileges(keys, !allSelected)}
                            >
                              {allSelected ? 'Clear all' : 'Select all'}
                            </button>
                          </div>
                          <div className="grid gap-1 border-t border-[var(--border)]/70 px-3 py-3 sm:grid-cols-2">
                            {group.privileges.map((p) => {
                              const checked = editPrivs.has(p.key);
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
                                      toggleEditPrivilege(p.key, e.target.checked)
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
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-slate-50 px-6 py-4">
              <p className="text-xs text-[var(--muted)]">
                {editRoleId ? (
                  <span className="font-medium text-slate-700">
                    {editPrivs.size} privilege{editPrivs.size === 1 ? '' : 's'} selected for {editTargetUser.fullName || editTargetUser.email}
                  </span>
                ) : (
                  'Select a role to continue.'
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditUserModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveEditedUser()}
                  disabled={editSavingUser}
                >
                  {editSavingUser ? 'Saving…' : 'Save changes'}
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
                      if (e.key === 'Enter') void searchHrmsNow(hrmsQuery);
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    onClick={() => void searchHrmsNow(hrmsQuery)}
                    disabled={searchingHrms}
                  >
                    {searchingHrms ? 'Searching…' : 'Search'}
                  </Button>
                </div>

                <ul className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-slate-50/50 p-2">
                  {hrmsResults.length === 0 ? (
                    <li className="px-2 py-6 text-center text-sm text-[var(--muted)]">
                      {searchingHrms
                        ? 'Searching…'
                        : 'Try employee #, name, or email.'}
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
                              onChange={() => selectHrmsPerson(u)}
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
                            ? (() => {
                                const match = String(selectedHrms.dateOfJoining).match(/^(\d{4})-(\d{2})-(\d{2})/);
                                if (match) {
                                  const [, y, m, d] = match;
                                  return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).toLocaleDateString();
                                }
                                return new Date(selectedHrms.dateOfJoining).toLocaleDateString();
                              })()
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

                {/* Academic Scope Assignment in Add User Modal */}
                {!superOnly ? (
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-3.5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        Academic Scope Assignment
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        Assign this user to multiple Colleges, Courses, and Branches. Leave unselected for Global / All unrestricted scope.
                      </p>
                    </div>

                    <MultiSelectDropdown
                      label="Assigned colleges"
                      icon="🏛️"
                      options={collegeOptions}
                      selectedIds={selectedCollegeIds}
                      onChange={handleAddCollegesChange}
                      allSelectedLabel="All Colleges (Global Scope)"
                      placeholder="Select colleges…"
                    />

                    <MultiSelectDropdown
                      label="Assigned courses"
                      icon="🎓"
                      options={addCourseOptions}
                      selectedIds={selectedCourseIds}
                      onChange={handleAddCoursesChange}
                      allSelectedLabel="All Courses across selected colleges"
                      placeholder="Select courses…"
                      disabled={selectedCollegeIds.length === 0}
                      disabledPlaceholder="Select at least one college first"
                    />

                    <MultiSelectDropdown
                      label="Assigned branches"
                      icon="🌿"
                      options={addBranchOptions}
                      selectedIds={selectedBranchIds}
                      onChange={setSelectedBranchIds}
                      allSelectedLabel="All Branches across selected courses"
                      placeholder="Select branches…"
                      disabled={selectedCourseIds.length === 0}
                      disabledPlaceholder="Select at least one course first"
                    />
                  </div>
                ) : null}
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
