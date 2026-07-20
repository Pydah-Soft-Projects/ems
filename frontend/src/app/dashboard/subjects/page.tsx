'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import { Subject } from '@/types/subject';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { SubjectTable } from '@/components/subjects/SubjectTable';
import { useToast } from '@/components/ui/Toast';

export default function SubjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filterRegulationId, setFilterRegulationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
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

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      setSubjects(await api.getSubjects(regulationFilter));
    } catch {
      setActionError('Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  }, [regulationFilter]);

  useEffect(() => {
    void loadRegulations();
  }, [loadRegulations]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  async function handleDelete() {
    if (!selectedSubject) return;
    setSaving(true);
    setActionError('');
    try {
      await api.deleteSubject(selectedSubject.id);
      setDeleteOpen(false);
      setSelectedSubject(null);
      toast.push('Subject deleted.', 'success');
      await loadSubjects();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to delete subject.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        description="Create subjects under a regulation, then map them to academic scopes using the Subject mappings tab."
        action={
          <Button onClick={() => router.push('/dashboard/subjects/new')}>
            New subject
          </Button>
        }
      />

      <Tabs
        activeId="subjects"
        items={[
          { id: 'subjects', label: 'Subjects', href: '/dashboard/subjects' },
          {
            id: 'mappings',
            label: 'Subject mappings',
            href: '/dashboard/subjects/mappings',
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
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
      </div>

      {actionError && !deleteOpen ? (
        <Alert tone="danger">{actionError}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="All subjects"
          description={`${subjects.length} subject${subjects.length !== 1 ? 's' : ''}`}
        />
        <CardBody className="!p-0">
          <SubjectTable
            subjects={subjects}
            regulations={regulations}
            loading={loading}
            onEdit={(subject) =>
              router.push(`/dashboard/subjects/${subject.id}/edit`)
            }
            onDelete={(subject) => {
              setSelectedSubject(subject);
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
        title="Delete subject"
        description={
          selectedSubject
            ? `Are you sure you want to delete "${selectedSubject.code} — ${selectedSubject.name}"?`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        loading={saving}
      >
        <p className="text-sm text-[var(--muted)]">
          Subjects used in examinations cannot be deleted.
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
