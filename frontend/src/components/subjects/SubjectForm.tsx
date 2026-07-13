'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Regulation } from '@/types/regulation';
import {
  Subject,
  CreateSubjectInput,
  SubjectStatus,
  SubjectType,
} from '@/types/subject';

const selectClass =
  'w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

interface SubjectFormProps {
  regulations: Regulation[];
  initial?: Subject | null;
  defaultRegulationId?: number;
  onSubmit: (data: CreateSubjectInput) => Promise<void>;
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
  const [regulationId, setRegulationId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<SubjectType>('theory');
  const [credits, setCredits] = useState('');
  const [internalMarks, setInternalMarks] = useState('');
  const [externalMarks, setExternalMarks] = useState('');
  const [status, setStatus] = useState<SubjectStatus>('active');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setRegulationId(String(initial.regulationId));
      setCode(initial.code);
      setName(initial.name);
      setType(initial.type);
      setCredits(String(initial.credits ?? ''));
      setInternalMarks(String(initial.internalMarks ?? ''));
      setExternalMarks(String(initial.externalMarks ?? ''));
      setStatus(initial.status);
    } else {
      setRegulationId(defaultRegulationId ? String(defaultRegulationId) : '');
      setCode('');
      setName('');
      setType('theory');
      setCredits('');
      setInternalMarks('');
      setExternalMarks('');
      setStatus('active');
    }
    setError('');
  }, [initial, defaultRegulationId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!regulationId || !code.trim() || !name.trim()) {
      setError('Regulation, code, and name are required.');
      return;
    }

    const internal = internalMarks ? parseInt(internalMarks, 10) : 0;
    const external = externalMarks ? parseInt(externalMarks, 10) : 0;
    if (
      (internalMarks && (isNaN(internal) || internal < 0)) ||
      (externalMarks && (isNaN(external) || external < 0))
    ) {
      setError('Marks cannot be negative.');
      return;
    }

    const creditsNum = credits ? parseFloat(credits) : undefined;
    if (credits && (isNaN(creditsNum!) || creditsNum! < 0)) {
      setError('Credits cannot be negative.');
      return;
    }

    try {
      await onSubmit({
        regulationId: parseInt(regulationId, 10),
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        credits: creditsNum,
        internalMarks: internal,
        externalMarks: external,
        status,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subject');
    }
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
          disabled={!!initial}
        >
          <option value="">Select regulation</option>
          {regulations.map((reg) => (
            <option key={reg.id} value={reg.id}>
              {reg.code} — {reg.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Subjects belong to a regulation only. Map them to colleges, branches,
          and batches under Subject mappings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Subject code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. CS501"
          required
          disabled={!!initial}
        />
        <Input
          label="Subject name"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
            value={type}
            onChange={(e) => setType(e.target.value as SubjectType)}
            className={selectClass}
          >
            <option value="theory">Theory</option>
            <option value="practical">Practical</option>
            <option value="laboratory">Laboratory</option>
          </select>
        </div>
        <Input
          label="Credits"
          type="number"
          min={0}
          step="0.5"
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          placeholder="e.g. 3"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Internal marks"
          type="number"
          min={0}
          value={internalMarks}
          onChange={(e) => setInternalMarks(e.target.value)}
          placeholder="e.g. 40"
        />
        <Input
          label="External marks"
          type="number"
          min={0}
          value={externalMarks}
          onChange={(e) => setExternalMarks(e.target.value)}
          placeholder="e.g. 60"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SubjectStatus)}
          className={selectClass}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {error && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : initial ? 'Update subject' : 'Create subject'}
        </Button>
      </div>
    </form>
  );
}
