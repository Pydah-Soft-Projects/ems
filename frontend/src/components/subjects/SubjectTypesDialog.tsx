'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  SubjectTypeOption,
  SubjectTypeUsage,
  SubjectTypeUsageSubject,
} from '@/types/subject';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

const selectClass =
  'h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

function slugPreview(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function groupByRegulation(subjects: SubjectTypeUsageSubject[]) {
  const groups = new Map<
    string,
    {
      regulationId: number;
      regulationCode: string;
      regulationName: string;
      subjects: SubjectTypeUsageSubject[];
    }
  >();
  for (const subject of subjects) {
    const key = String(subject.regulationId);
    const existing = groups.get(key);
    if (existing) {
      existing.subjects.push(subject);
      continue;
    }
    groups.set(key, {
      regulationId: subject.regulationId,
      regulationCode: subject.regulationCode || `REG-${subject.regulationId}`,
      regulationName: subject.regulationName || 'Unknown regulation',
      subjects: [subject],
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.regulationCode.localeCompare(b.regulationCode),
  );
}

function DeleteSubjectTypeDialog({
  open,
  type,
  otherTypes,
  onClose,
  onDeleted,
}: {
  open: boolean;
  type: SubjectTypeOption | null;
  otherTypes: SubjectTypeOption[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [usage, setUsage] = useState<SubjectTypeUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [globalTarget, setGlobalTarget] = useState('');
  const [rowTargets, setRowTargets] = useState<Record<number, string>>({});

  const activeTargets = useMemo(
    () => otherTypes.filter((row) => row.status === 'active'),
    [otherTypes],
  );

  const loadUsage = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.getSubjectTypeUsage(type.id);
      setUsage(result);
      setRowTargets({});
      setGlobalTarget((prev) =>
        prev && activeTargets.some((row) => row.code === prev)
          ? prev
          : activeTargets[0]?.code ?? '',
      );
    } catch (err) {
      setUsage(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load subjects using this type.',
      );
    } finally {
      setLoading(false);
    }
  }, [activeTargets, type]);

  useEffect(() => {
    if (!open || !type) return;
    void loadUsage();
  }, [open, type, loadUsage]);

  const handleClose = useCallback(() => {
    if (!saving) onClose();
  }, [onClose, saving]);

  async function reassign(subjectIds?: number[], toTypeCode?: string) {
    if (!type) return;
    const target = toTypeCode || globalTarget;
    if (!target) {
      setError('Choose a replacement type first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await api.reassignSubjectType(type.id, {
        toTypeCode: target,
        subjectIds,
      });
      toast.push(
        result.updated === 1
          ? '1 subject updated.'
          : `${result.updated} subjects updated.`,
        'success',
      );
      if (result.remaining === 0) {
        await api.deleteSubjectType(type.id);
        toast.push(`Type "${type.name}" deleted.`, 'success');
        onDeleted();
        return;
      }
      await loadUsage();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to reassign subjects.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmptyType() {
    if (!type) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteSubjectType(type.id);
      toast.push(`Type "${type.name}" deleted.`, 'success');
      onDeleted();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to delete subject type.',
      );
    } finally {
      setSaving(false);
    }
  }

  const groups = useMemo(
    () => groupByRegulation(usage?.subjects ?? []),
    [usage],
  );
  const remaining = usage?.total ?? 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={type ? `Delete type “${type.name}”` : 'Delete subject type'}
      description={
        remaining > 0
          ? 'This type is used by existing subjects. Reassign them individually or swap all to another type before deleting.'
          : 'This type is not used by any subjects and can be deleted safely.'
      }
      size="xl"
    >
      {loading ? <LoadingBlock label="Loading subjects…" /> : null}

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {!loading && remaining === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            No subjects currently use{' '}
            <span className="font-mono text-slate-800">{type?.code}</span>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={saving}
              onClick={() => void deleteEmptyType()}
            >
              Delete type
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && remaining > 0 ? (
        <div className="space-y-4">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-900">
              Swap all {remaining} subject{remaining === 1 ? '' : 's'} globally
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Reassign every subject still using this type, then delete the type.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={globalTarget}
                onChange={(e) => setGlobalTarget(e.target.value)}
                className={`${selectClass} sm:max-w-xs`}
                disabled={saving || activeTargets.length === 0}
              >
                <option value="">
                  {activeTargets.length
                    ? 'Select replacement type'
                    : 'No other active types'}
                </option>
                {activeTargets.map((row) => (
                  <option key={row.id} value={row.code}>
                    {row.name} ({row.code})
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={saving || !globalTarget}
                onClick={() => void reassign(undefined, globalTarget)}
              >
                Swap all & delete
              </Button>
            </div>
          </div>

          <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
            {groups.map((group) => (
              <div
                key={group.regulationId}
                className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]"
              >
                <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-900">
                    {group.regulationCode} — {group.regulationName}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {group.subjects.length} subject
                    {group.subjects.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                        <th className="px-4 py-2 font-semibold">Code</th>
                        <th className="px-4 py-2 font-semibold">Name</th>
                        <th className="px-4 py-2 font-semibold">Swap to</th>
                        <th className="px-4 py-2 text-right font-semibold">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.subjects.map((subject) => {
                        const target =
                          rowTargets[subject.id] || globalTarget || '';
                        return (
                          <tr
                            key={subject.id}
                            className="border-b border-[var(--border)] last:border-0"
                          >
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-800">
                              {subject.code}
                            </td>
                            <td className="px-4 py-2.5 text-slate-900">
                              {subject.name}
                            </td>
                            <td className="px-4 py-2.5">
                              <select
                                value={rowTargets[subject.id] ?? ''}
                                onChange={(e) =>
                                  setRowTargets((prev) => ({
                                    ...prev,
                                    [subject.id]: e.target.value,
                                  }))
                                }
                                className={selectClass}
                                disabled={saving || activeTargets.length === 0}
                              >
                                <option value="">
                                  {globalTarget
                                    ? `Use global (${globalTarget})`
                                    : 'Select type'}
                                </option>
                                {activeTargets.map((row) => (
                                  <option key={row.id} value={row.code}>
                                    {row.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={saving || !target}
                                onClick={() =>
                                  void reassign([subject.id], target)
                                }
                              >
                                Swap
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

export function SubjectTypesDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [types, setTypes] = useState<SubjectTypeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SubjectTypeOption | null>(
    null,
  );

  const loadTypes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTypes(await api.getSubjectTypes());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load subject types.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (!saving && !deleteTarget) onClose();
  }, [deleteTarget, onClose, saving]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setError('');
    setDeleteTarget(null);
    void loadTypes();
  }, [open, loadTypes]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Type name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createSubjectType({ name: trimmed });
      setName('');
      toast.push('Subject type created.', 'success');
      await loadTypes();
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create subject type.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: SubjectTypeOption) {
    setSaving(true);
    setError('');
    try {
      await api.updateSubjectType(row.id, {
        status: row.status === 'active' ? 'inactive' : 'active',
      });
      await loadTypes();
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update subject type.',
      );
    } finally {
      setSaving(false);
    }
  }

  const preview = slugPreview(name);
  const otherTypes = types.filter((row) => row.id !== deleteTarget?.id);

  return (
    <>
      <Dialog
        open={open && !deleteTarget}
        onClose={handleClose}
        title="Manage subject types"
        description="Create types used when adding subjects (for example Theory, Practical, Project)."
        size="lg"
      >
        <form
          onSubmit={handleCreate}
          className="space-y-3 border-b border-[var(--border)] pb-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="New type name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Project"
                disabled={saving}
                autoFocus
              />
              <p className="mt-1 min-h-[1rem] text-xs text-[var(--muted)]">
                {preview ? (
                  <>
                    Stored as code: <span className="font-mono">{preview}</span>
                  </>
                ) : (
                  '\u00a0'
                )}
              </p>
            </div>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Add type'}
            </Button>
          </div>
        </form>

        {error ? (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-4">
          {loading ? (
            <LoadingBlock label="Loading types…" />
          ) : types.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              No subject types yet. Add one above.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-slate-50 text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Code</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">
                        {row.code}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            row.status === 'active' ? 'success' : 'default'
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={saving}
                            onClick={() => void toggleStatus(row)}
                          >
                            {row.status === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            disabled={saving}
                            onClick={() => setDeleteTarget(row)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Dialog>

      <DeleteSubjectTypeDialog
        open={Boolean(deleteTarget)}
        type={deleteTarget}
        otherTypes={otherTypes}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          void loadTypes();
          onChanged?.();
        }}
      />
    </>
  );
}
