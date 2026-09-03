'use client';

import { FormEvent, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Regulation } from '@/types/regulation';
import {
  Subject,
  CreateSubjectInput,
  SubjectStatus,
  SubjectTypeCode,
  SubjectTypeOption,
} from '@/types/subject';
import { api } from '@/lib/api';

const selectClass =
  'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

type SubjectDraft = {
  key: string;
  code: string;
  name: string;
  type: SubjectTypeCode;
  credits: string;
  internalMarks: string;
  externalMarks: string;
  status: SubjectStatus;
  expanded: boolean;
};

function emptyDraft(
  defaultType: SubjectTypeCode = '',
  expanded = true,
): SubjectDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: '',
    name: '',
    type: defaultType,
    credits: '',
    internalMarks: '',
    externalMarks: '',
    status: 'active',
    expanded,
  };
}

function draftLabel(draft: SubjectDraft, index: number) {
  const code = draft.code.trim().toUpperCase();
  const name = draft.name.trim();
  if (code && name) return `${code} — ${name}`;
  if (code) return code;
  if (name) return name;
  return `Subject ${index + 1}`;
}

function parseDraftRow(
  draft: SubjectDraft,
  regulationId: number,
  index: number,
): { ok: true; data: CreateSubjectInput } | { ok: false; message: string } {
  const label = `Subject ${index + 1}`;
  if (!draft.code.trim() || !draft.name.trim()) {
    return {
      ok: false,
      message: `${label}: code and name are required.`,
    };
  }
  if (!draft.type) {
    return {
      ok: false,
      message: `${label}: type is required. Create one from Subjects → Manage types.`,
    };
  }

  const internal = draft.internalMarks
    ? parseInt(draft.internalMarks, 10)
    : 0;
  const external = draft.externalMarks
    ? parseInt(draft.externalMarks, 10)
    : 0;
  if (
    (draft.internalMarks && (Number.isNaN(internal) || internal < 0)) ||
    (draft.externalMarks && (Number.isNaN(external) || external < 0))
  ) {
    return { ok: false, message: `${label}: marks cannot be negative.` };
  }

  const creditsNum = draft.credits ? parseFloat(draft.credits) : undefined;
  if (draft.credits && (Number.isNaN(creditsNum!) || creditsNum! < 0)) {
    return { ok: false, message: `${label}: credits cannot be negative.` };
  }

  return {
    ok: true,
    data: {
      regulationId,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      type: draft.type,
      credits: creditsNum,
      internalMarks: internal,
      externalMarks: external,
      status: draft.status,
    },
  };
}

interface SubjectFormProps {
  regulations: Regulation[];
  initial?: Subject | null;
  defaultRegulationId?: number;
  onSubmit: (data: CreateSubjectInput | CreateSubjectInput[]) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function SubjectForm({
  regulations,
  initial,
  defaultRegulationId,
  onSubmit,
  onCancel,
  loading,
}: SubjectFormProps) {
  const formId = useId();
  const isEdit = Boolean(initial);
  const [regulationId, setRegulationId] = useState('');
  const [rows, setRows] = useState<SubjectDraft[]>([emptyDraft()]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [types, setTypes] = useState<SubjectTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setTypesLoading(true);
    api
      .getSubjectTypes(true)
      .then((list) => {
        if (!mounted) return;
        setTypes(list);
      })
      .catch(() => {
        if (!mounted) return;
        setTypes([]);
      })
      .finally(() => {
        if (mounted) setTypesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (initial) {
      setRegulationId(String(initial.regulationId));
      setRows([
        {
          key: `edit-${initial.id}`,
          code: initial.code,
          name: initial.name,
          type: initial.type,
          credits: String(initial.credits ?? ''),
          internalMarks: String(initial.internalMarks ?? ''),
          externalMarks: String(initial.externalMarks ?? ''),
          status: initial.status,
          expanded: true,
        },
      ]);
    } else {
      setRegulationId(defaultRegulationId ? String(defaultRegulationId) : '');
      setRows([emptyDraft(types[0]?.code ?? '', true)]);
    }
    setError('');
  }, [initial, defaultRegulationId]);

  useEffect(() => {
    if (isEdit || !types[0]?.code) return;
    setRows((prev) =>
      prev.map((row) => (row.type ? row : { ...row, type: types[0].code })),
    );
  }, [isEdit, types]);

  function updateRow(key: string, patch: Partial<SubjectDraft>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function toggleRow(key: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.key === key ? { ...row, expanded: !row.expanded } : row,
      ),
    );
  }

  function addRow() {
    const defaultType = types[0]?.code ?? '';
    const next = emptyDraft(defaultType, true);
    setFocusKey(next.key);
    setRows((prev) => [
      ...prev.map((row) => ({ ...row, expanded: false })),
      next,
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((row) => row.key !== key);
      if (!next.some((row) => row.expanded) && next.length > 0) {
        next[next.length - 1] = { ...next[next.length - 1], expanded: true };
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!regulationId) {
      setError('Regulation is required.');
      return;
    }

    const regulation = parseInt(regulationId, 10);
    const parsed: CreateSubjectInput[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const result = parseDraftRow(rows[i], regulation, i);
      if (!result.ok) {
        setError(result.message);
        setRows((prev) =>
          prev.map((row, idx) =>
            idx === i ? { ...row, expanded: true } : row,
          ),
        );
        return;
      }
      if (seenCodes.has(result.data.code)) {
        setError(
          `Subject ${i + 1}: duplicate code '${result.data.code}' in this form.`,
        );
        setRows((prev) =>
          prev.map((row, idx) =>
            idx === i ? { ...row, expanded: true } : row,
          ),
        );
        return;
      }
      seenCodes.add(result.data.code);
      parsed.push(result.data);
    }

    try {
      await onSubmit(isEdit ? parsed[0] : parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subject');
    }
  }

  const typeOptionsFor = (currentType: string) =>
    currentType && !types.some((row) => row.code === currentType)
      ? [
          {
            id: -1,
            code: currentType,
            name: `${currentType} (inactive / removed)`,
            status: 'inactive' as const,
            sortOrder: 0,
            createdAt: '',
            updatedAt: '',
          },
          ...types,
        ]
      : types;

  function renderFields(draft: SubjectDraft) {
    const typeOptions = typeOptionsFor(draft.type);
    const codeId = `${formId}-code-${draft.key}`;
    return (
      <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id={codeId}
            label="Subject code"
            value={draft.code}
            onChange={(e) => updateRow(draft.key, { code: e.target.value })}
            placeholder="e.g. CS501"
            required
            disabled={isEdit}
            autoFocus={focusKey === draft.key}
          />
          <Input
            label="Subject name"
            value={draft.name}
            onChange={(e) => updateRow(draft.key, { name: e.target.value })}
            placeholder="e.g. Operating Systems"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Type
            </label>
            <select
              value={draft.type}
              onChange={(e) => updateRow(draft.key, { type: e.target.value })}
              className={selectClass}
              required
              disabled={typesLoading}
            >
              <option value="">
                {typesLoading ? 'Loading types…' : 'Select type'}
              </option>
              {typeOptions.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
            {!typesLoading && types.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--danger)]">
                No active types found. Create one from Subjects → Manage types.
              </p>
            ) : null}
          </div>
          <Input
            label="Credits"
            type="number"
            min={0}
            step="0.5"
            value={draft.credits}
            onChange={(e) => updateRow(draft.key, { credits: e.target.value })}
            placeholder="e.g. 3"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Internal marks"
            type="number"
            min={0}
            value={draft.internalMarks}
            onChange={(e) =>
              updateRow(draft.key, { internalMarks: e.target.value })
            }
            placeholder="e.g. 40"
          />
          <Input
            label="External marks"
            type="number"
            min={0}
            value={draft.externalMarks}
            onChange={(e) =>
              updateRow(draft.key, { externalMarks: e.target.value })
            }
            placeholder="e.g. 60"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            value={draft.status}
            onChange={(e) =>
              updateRow(draft.key, {
                status: e.target.value as SubjectStatus,
              })
            }
            className={selectClass}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Regulation
        </label>
        <select
          value={regulationId}
          onChange={(e) => setRegulationId(e.target.value)}
          className={selectClass}
          required
          disabled={isEdit}
        >
          <option value="">Select regulation</option>
          {regulations.map((reg) => (
            <option key={reg.id} value={reg.id}>
              {reg.code} — {reg.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {isEdit
            ? 'Subjects belong to a regulation only. Map them to colleges, branches, and batches under Subject mappings.'
            : 'All subjects below will be created under this regulation. Map them to colleges, branches, and batches later.'}
        </p>
      </div>

      {isEdit ? (
        renderFields(rows[0])
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Subjects</p>
              <p className="text-xs text-[var(--muted)]">
                Add as many as you need. Expand a row to edit its details.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={addRow}>
              Add subject
            </Button>
          </div>

          {rows.map((draft, index) => (
            <div
              key={draft.key}
              className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white"
            >
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleRow(draft.key)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius)] px-1 py-1 text-left hover:bg-white/70"
                  aria-expanded={draft.expanded}
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-500 transition ${
                      draft.expanded ? 'rotate-90' : ''
                    }`}
                    aria-hidden
                  >
                    ›
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                    {draftLabel(draft, index)}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                    {draft.type || 'no type'}
                  </span>
                </button>
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeRow(draft.key)}
                    aria-label={`Remove ${draftLabel(draft, index)}`}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              {draft.expanded ? renderFields(draft) : null}
            </div>
          ))}
        </div>
      )}

      {error ? (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            loading ||
            typesLoading ||
            (!isEdit && rows.some((row) => !row.type) && types.length === 0)
          }
        >
          {loading
            ? 'Saving...'
            : isEdit
              ? 'Update subject'
              : rows.length === 1
                ? 'Create subject'
                : `Create ${rows.length} subjects`}
        </Button>
      </div>
    </form>
  );
}
