'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Regulation,
  CreateRegulationInput,
  RegulationStatus,
} from '@/types/regulation';
import {
  RegulationScopeMapper,
  ScopeFormState,
  flattenScopeForm,
  scopesToFormInput,
  getSelectedCollegeIdsFromScopes,
} from '@/components/regulations/RegulationScopeMapper';

interface RegulationFormProps {
  initial?: Regulation | null;
  onSubmit: (data: CreateRegulationInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

type Step = 1 | 2;

export function RegulationForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: RegulationFormProps) {
  const [step, setStep] = useState<Step>(1);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [status, setStatus] = useState<RegulationStatus>('active');
  const [scopes, setScopes] = useState<ScopeFormState>([]);
  const [selectedCollegeIds, setSelectedCollegeIds] = useState<number[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setCode(initial.code);
      setName(initial.name);
      setDescription(initial.description ?? '');
      setEffectiveDate(
        initial.effectiveDate ? String(initial.effectiveDate).slice(0, 10) : '',
      );
      setStatus(initial.status);
      setScopes(scopesToFormInput(initial.scopes ?? []));
      setSelectedCollegeIds(
        getSelectedCollegeIdsFromScopes(scopesToFormInput(initial.scopes ?? [])),
      );
      setStep(1);
    } else {
      setCode('');
      setName('');
      setDescription('');
      setEffectiveDate('');
      setStatus('active');
      setScopes([]);
      setSelectedCollegeIds([]);
      setStep(1);
    }
    setError('');
  }, [initial]);

  function validateCollegesAndScope(): boolean {
    if (selectedCollegeIds.length === 0) {
      setError('Select at least one college.');
      return false;
    }
    if (scopes.length === 0) {
      setError('Select at least one programme for the chosen colleges.');
      return false;
    }
    const scopePayload = flattenScopeForm(scopes);
    if (scopePayload.length === 0) {
      setError('Select at least one batch for each chosen programme.');
      return false;
    }
    setError('');
    return true;
  }

  function validateRegulationDetails(): boolean {
    if (!code.trim() || !name.trim()) {
      setError('Code and name are required.');
      return false;
    }
    setError('');
    return true;
  }

  function handleNext(e: FormEvent) {
    e.preventDefault();
    if (validateCollegesAndScope()) setStep(2);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateCollegesAndScope()) {
      setStep(1);
      return;
    }
    if (!validateRegulationDetails()) return;

    const scopePayload = flattenScopeForm(scopes);

    try {
      await onSubmit({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        effectiveDate: effectiveDate || undefined,
        status,
        scopes: scopePayload,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save regulation');
    }
  }

  return (
    <form
      onSubmit={step === 1 ? handleNext : handleSubmit}
      className="space-y-4"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
        <StepPill n={1} label="Colleges & scope" active={step === 1} done={step > 1} />
        <div className="h-px flex-1 bg-[var(--border)]" />
        <StepPill n={2} label="Regulation details" active={step === 2} done={false} />
      </div>

      {step === 1 ? (
        <RegulationScopeMapper
          value={scopes}
          onChange={setScopes}
          selectedCollegeIds={selectedCollegeIds}
          onSelectedCollegeIdsChange={setSelectedCollegeIds}
          excludeRegulationId={initial?.id}
          regulationActive={status === 'active'}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Regulation code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. R20"
              required
              disabled={!!initial}
            />
            <Input
              label="Effective date (audit only)"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>

          <Input
            label="Regulation name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Regulation 2020"
            required
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description..."
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as RegulationStatus)}
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-4">
        <div>
          {step === 2 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError('');
                setStep(1);
              }}
              disabled={loading}
            >
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button type="submit">Next: Regulation details</Button>
          ) : (
            <Button type="submit" disabled={loading}>
              {loading
                ? 'Saving...'
                : initial
                  ? 'Update regulation'
                  : 'Create regulation'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function StepPill({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
          active
            ? 'bg-[var(--primary)] text-white'
            : done
              ? 'bg-[var(--success-soft)] text-[var(--success)]'
              : 'bg-slate-100 text-slate-500'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span
        className={`text-sm font-medium ${
          active ? 'text-slate-900' : 'text-[var(--muted)]'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
