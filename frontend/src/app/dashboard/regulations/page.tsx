'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import {
  Regulation,
  CreateRegulationInput,
} from '@/types/regulation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RegulationForm } from '@/components/regulations/RegulationForm';
import { RegulationTable } from '@/components/regulations/RegulationTable';

export default function RegulationsPage() {
  const router = useRouter();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Regulation | null>(null);
  const [actionError, setActionError] = useState('');

  const loadRegulations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getRegulations();
      setRegulations(data);
    } catch {
      setActionError('Failed to load regulations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegulations();
  }, [loadRegulations]);

  function openCreate() {
    setSelected(null);
    setActionError('');
    setFormOpen(true);
  }

  async function openEdit(regulation: Regulation) {
    setActionError('');
    try {
      const full = await api.getRegulation(regulation.id);
      setSelected(full);
      setFormOpen(true);
    } catch {
      setActionError('Failed to load regulation for editing.');
    }
  }

  function openDelete(regulation: Regulation) {
    setSelected(regulation);
    setActionError('');
    setDeleteOpen(true);
  }

  function openView(regulation: Regulation) {
    router.push(`/dashboard/regulations/${regulation.id}`);
  }

  async function handleSave(data: CreateRegulationInput) {
    setSaving(true);
    setActionError('');
    try {
      if (selected) {
        await api.updateRegulation(selected.id, data);
      } else {
        await api.createRegulation(data);
      }
      setFormOpen(false);
      setSelected(null);
      await loadRegulations();
    } catch (err) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    setActionError('');
    try {
      await api.deleteRegulation(selected.id);
      setDeleteOpen(false);
      setSelected(null);
      await loadRegulations();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to delete regulation.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Regulations"
        description="Create and manage academic regulations. Each regulation is the parent framework for subjects, mappings, and examinations."
        action={
          <Button onClick={openCreate}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New regulation
          </Button>
        }
      />

      {actionError && !deleteOpen && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader
          title="All regulations"
          description={`${regulations.length} regulation${regulations.length !== 1 ? 's' : ''} configured`}
        />
        <CardBody className="!p-0">
          <RegulationTable
            regulations={regulations}
            loading={loading}
            onView={openView}
            onEdit={openEdit}
            onDelete={openDelete}
          />
        </CardBody>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={selected ? 'Edit regulation' : 'Create regulation'}
        size="xl"
        description={
          selected
            ? 'Update regulation details. Code cannot be changed.'
            : formOpen && !selected
              ? 'Step 1: Colleges, programmes & batches → Step 2: Regulation details'
              : 'Add a new academic regulation to the examination portal.'
        }
      >
        <RegulationForm
          initial={selected}
          onSubmit={handleSave}
          onCancel={() => setFormOpen(false)}
          loading={saving}
        />
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => !saving && setDeleteOpen(false)}
        title="Delete regulation"
        description={
          selected
            ? `Are you sure you want to delete "${selected.code} — ${selected.name}"? This cannot be undone.`
            : undefined
        }
      >
        <p className="text-sm text-[var(--muted)]">
          Regulations with linked subjects cannot be deleted. Remove or reassign
          subjects first.
        </p>
        {actionError && (
          <div className="mt-3 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {actionError}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={saving}>
            {saving ? 'Deleting...' : 'Delete regulation'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
