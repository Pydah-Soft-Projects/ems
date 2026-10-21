'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import { SubjectMappingEntry } from '@/types/subject';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { MappingTable } from '@/components/subjects/MappingTable';
import { useToast } from '@/components/ui/Toast';

export default function SubjectMappingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [mappings, setMappings] = useState<SubjectMappingEntry[]>([]);
  const [filterRegulationId, setFilterRegulationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] =
    useState<SubjectMappingEntry | null>(null);
  const [actionError, setActionError] = useState('');

  const regulationFilter = filterRegulationId
    ? parseInt(filterRegulationId, 10)
    : undefined;

  const loadRegulations = useCallback(async () => {
    try {
      setRegulations(await api.getRegulations());
    } catch {
      setActionError('Failed to load regulations.');
    }
  }, []);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      setMappings(
        await api.getSubjectMappings(
          regulationFilter ? { regulationId: regulationFilter } : {},
        ),
      );
    } catch {
      setActionError('Failed to load subject mappings.');
    } finally {
      setLoading(false);
    }
  }, [regulationFilter]);

  useEffect(() => {
    void loadRegulations();
  }, [loadRegulations]);

  useEffect(() => {
    if (regulations.length === 1 && !filterRegulationId) {
      setFilterRegulationId(String(regulations[0].id));
    }
  }, [regulations, filterRegulationId]);

  useEffect(() => {
    void loadMappings();
  }, [loadMappings]);

  async function handleDelete() {
    if (!selectedMapping) return;
    setSaving(true);
    setActionError('');
    try {
      await api.deleteSubjectMapping(selectedMapping.id);
      setDeleteOpen(false);
      setSelectedMapping(null);
      toast.push('Mapping deleted.', 'success');
      await loadMappings();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to delete mapping.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subject mappings"
        description="Map academic scopes (college → branch → year/sem → sections) to subjects for exam creation."
        action={
          <Button onClick={() => router.push('/dashboard/subjects/mappings/new')}>
            New mapping
          </Button>
        }
      />

      <Tabs
        activeId="mappings"
        items={[
          { id: 'subjects', label: 'Subjects', href: '/dashboard/subjects' },
          {
            id: 'mappings',
            label: 'Subject mappings',
            href: '/dashboard/subjects/mappings',
          },
        ]}
      />

      <select
        value={filterRegulationId}
        onChange={(e) => setFilterRegulationId(e.target.value)}
        className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
      >
        <option value="">All regulations</option>
        {regulations.map((reg) => (
          <option key={reg.id} value={reg.id}>
            {reg.code} — {reg.name}
          </option>
        ))}
      </select>

      {actionError && !deleteOpen ? (
        <Alert tone="danger">{actionError}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="All mappings"
          description={`${mappings.length} mapping${mappings.length !== 1 ? 's' : ''}`}
        />
        <CardBody className="!p-0">
          <MappingTable
            mappings={mappings}
            regulations={regulations}
            loading={loading}
            onEdit={(mapping) =>
              router.push(`/dashboard/subjects/mappings/${mapping.id}/edit`)
            }
            onDelete={(mapping) => {
              setSelectedMapping(mapping);
              setActionError('');
              setDeleteOpen(true);
            }}
          />
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => !saving && setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete mapping"
        description={
          selectedMapping
            ? `Delete mapping for ${selectedMapping.subject?.code ?? 'subject'} → ${selectedMapping.branchName} / ${selectedMapping.batch}?`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        loading={saving}
      >
        <p className="text-sm text-[var(--muted)]">
          This mapping will no longer be available for exam creation.
        </p>
        {actionError ? (
          <Alert tone="danger" className="mt-3">
            {actionError}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
