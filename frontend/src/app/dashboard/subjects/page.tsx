'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import {
  Subject,
  CreateSubjectInput,
  SubjectMappingEntry,
  CreateSubjectMappingInput,
  ReplaceScopeMappingInput,
} from '@/types/subject';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SubjectForm } from '@/components/subjects/SubjectForm';
import { SubjectTable } from '@/components/subjects/SubjectTable';
import { MappingForm } from '@/components/subjects/MappingForm';
import { MappingTable } from '@/components/subjects/MappingTable';

type Tab = 'subjects' | 'mappings';

const selectClass =
  'rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]';

export default function SubjectsPage() {
  const [tab, setTab] = useState<Tab>('subjects');
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mappings, setMappings] = useState<SubjectMappingEntry[]>([]);
  const [filterRegulationId, setFilterRegulationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<SubjectMappingEntry | null>(null);
  const [actionError, setActionError] = useState('');

  const regulationFilter = filterRegulationId
    ? parseInt(filterRegulationId, 10)
    : undefined;

  const loadRegulations = useCallback(async () => {
    try {
      const data = await api.getRegulations();
      setRegulations(data);
    } catch {
      setActionError('Failed to load regulations.');
    }
  }, []);

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSubjects(regulationFilter);
      setSubjects(data);
    } catch {
      setActionError('Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  }, [regulationFilter]);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSubjectMappings(
        regulationFilter ? { regulationId: regulationFilter } : {},
      );
      setMappings(data);
    } catch {
      setActionError('Failed to load subject mappings.');
    } finally {
      setLoading(false);
    }
  }, [regulationFilter]);

  useEffect(() => {
    loadRegulations();
  }, [loadRegulations]);

  useEffect(() => {
    if (tab === 'subjects') {
      loadSubjects();
    } else {
      loadMappings();
    }
  }, [tab, loadSubjects, loadMappings]);

  function openCreate() {
    setSelectedSubject(null);
    setSelectedMapping(null);
    setActionError('');
    setFormOpen(true);
  }

  function openEditSubject(subject: Subject) {
    setSelectedSubject(subject);
    setSelectedMapping(null);
    setActionError('');
    setFormOpen(true);
  }

  function openEditMapping(mapping: SubjectMappingEntry) {
    setSelectedMapping(mapping);
    setSelectedSubject(null);
    setActionError('');
    setFormOpen(true);
  }

  function openDeleteSubject(subject: Subject) {
    setSelectedSubject(subject);
    setSelectedMapping(null);
    setActionError('');
    setDeleteOpen(true);
  }

  function openDeleteMapping(mapping: SubjectMappingEntry) {
    setSelectedMapping(mapping);
    setSelectedSubject(null);
    setActionError('');
    setDeleteOpen(true);
  }

  async function handleSaveSubject(data: CreateSubjectInput) {
    setSaving(true);
    setActionError('');
    try {
      if (selectedSubject) {
        await api.updateSubject(selectedSubject.id, data);
      } else {
        await api.createSubject(data);
      }
      setFormOpen(false);
      setSelectedSubject(null);
      await loadSubjects();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMapping(data: CreateSubjectMappingInput) {
    setSaving(true);
    setActionError('');
    try {
      await api.createSubjectMapping(data);
      setFormOpen(false);
      setSelectedMapping(null);
      await loadMappings();
    } finally {
      setSaving(false);
    }
  }

  async function handleReplaceScope(data: ReplaceScopeMappingInput) {
    setSaving(true);
    setActionError('');
    try {
      await api.replaceSubjectMappingScope(data);
      setFormOpen(false);
      setSelectedMapping(null);
      await loadMappings();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setActionError('');
    try {
      if (selectedSubject) {
        await api.deleteSubject(selectedSubject.id);
        setDeleteOpen(false);
        setSelectedSubject(null);
        await loadSubjects();
      } else if (selectedMapping) {
        await api.deleteSubjectMapping(selectedMapping.id);
        setDeleteOpen(false);
        setSelectedMapping(null);
        await loadMappings();
      }
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to delete record.',
      );
    } finally {
      setSaving(false);
    }
  }

  const isSubjectTab = tab === 'subjects';
  const createLabel = isSubjectTab ? 'New subject' : 'New mapping';
  const formTitle = isSubjectTab
    ? selectedSubject
      ? 'Edit subject'
      : 'Create subject'
    : selectedMapping
      ? 'Edit mapping'
      : 'Create mapping';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        description="Create subjects under a regulation, then map academic scopes (college → branch → year/sem → sections) to subjects — both assignment styles share one table."
        action={
          <Button onClick={openCreate}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {createLabel}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[var(--radius)] border border-[var(--border)] bg-white p-1">
          <button
            type="button"
            onClick={() => setTab('subjects')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              isSubjectTab
                ? 'bg-[var(--primary)] text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Subjects
          </button>
          <button
            type="button"
            onClick={() => setTab('mappings')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              !isSubjectTab
                ? 'bg-[var(--primary)] text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Subject mappings
          </button>
        </div>

        <select
          value={filterRegulationId}
          onChange={(e) => setFilterRegulationId(e.target.value)}
          className={selectClass}
        >
          <option value="">All regulations</option>
          {regulations.map((reg) => (
            <option key={reg.id} value={reg.id}>
              {reg.code} — {reg.name}
            </option>
          ))}
        </select>
      </div>

      {actionError && !deleteOpen && !formOpen && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader
          title={isSubjectTab ? 'All subjects' : 'All mappings'}
          description={
            isSubjectTab
              ? `${subjects.length} subject${subjects.length !== 1 ? 's' : ''}`
              : `${mappings.length} mapping${mappings.length !== 1 ? 's' : ''}`
          }
        />
        <CardBody className="!p-0">
          {isSubjectTab ? (
            <SubjectTable
              subjects={subjects}
              regulations={regulations}
              loading={loading}
              onEdit={openEditSubject}
              onDelete={openDeleteSubject}
            />
          ) : (
            <MappingTable
              mappings={mappings}
              regulations={regulations}
              loading={loading}
              onEdit={openEditMapping}
              onDelete={openDeleteMapping}
            />
          )}
        </CardBody>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={formTitle}
        description={
          isSubjectTab
            ? selectedSubject
              ? 'Update subject details. Code and regulation cannot be changed.'
              : 'Add a subject under a regulation. College, branch, and batch mapping is done separately.'
            : selectedMapping
              ? 'Full mapping dialog — change college, branch, year, semester, sections, and subjects for this scope. Same rows update for both views.'
              : 'Choose Scope → subjects (daily-life) or Subject → scopes. Both write the same mapping table.'
        }
      >
        {isSubjectTab ? (
          <SubjectForm
            regulations={regulations}
            initial={selectedSubject}
            defaultRegulationId={regulationFilter}
            onSubmit={handleSaveSubject}
            onCancel={() => setFormOpen(false)}
            loading={saving}
          />
        ) : (
          <MappingForm
            regulations={regulations}
            allMappings={mappings}
            initial={selectedMapping}
            defaultRegulationId={regulationFilter}
            onSubmit={handleSaveMapping}
            onReplaceScope={handleReplaceScope}
            onCancel={() => setFormOpen(false)}
            loading={saving}
          />
        )}
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => !saving && setDeleteOpen(false)}
        title={selectedSubject ? 'Delete subject' : 'Delete mapping'}
        description={
          selectedSubject
            ? `Are you sure you want to delete "${selectedSubject.code} — ${selectedSubject.name}"?`
            : selectedMapping
              ? `Delete mapping for ${selectedMapping.subject?.code ?? 'subject'} → ${selectedMapping.branchName} / ${selectedMapping.batch} (Y${selectedMapping.yearOfStudy} S${selectedMapping.semester})?`
              : undefined
        }
      >
        <p className="text-sm text-[var(--muted)]">
          {selectedSubject
            ? 'Subjects used in examinations cannot be deleted.'
            : 'This mapping will no longer be available for exam creation.'}
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
            {saving ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
