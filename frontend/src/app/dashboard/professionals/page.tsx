'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  CreateProfessionalInput,
  Professional,
} from '@/types/remuneration';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/Spinner';
import { SoftSearchField } from '@/components/ui/SoftSearch';
import { Input, TextareaField } from '@/components/ui/Field';
import { FormActions } from '@/components/ui/FormActions';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

const emptyForm: CreateProfessionalInput = {
  name: '',
  designation: '',
  organization: '',
  contactNumber: '',
  email: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  bankAddress: '',
};

export default function ProfessionalsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [form, setForm] = useState<CreateProfessionalInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Professional | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await api.getProfessionals(search.trim() || undefined));
    } catch (err) {
      setRows([]);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load professionals.',
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(row: Professional) {
    setEditing(row);
    setForm({
      name: row.name,
      designation: row.designation || '',
      organization: row.organization || '',
      contactNumber: row.contactNumber || '',
      email: row.email || '',
      bankName: row.bankName || '',
      accountHolderName: row.accountHolderName || '',
      accountNumber: row.accountNumber || '',
      ifscCode: row.ifscCode || '',
      bankAddress: row.bankAddress || '',
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) {
      setFormError('Name is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await api.updateProfessional(editing.id, form);
        toast.push('Professional updated.', 'success');
      } else {
        await api.createProfessional(form);
        toast.push('Professional added.', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to save professional.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteProfessional(deleteTarget.id);
      toast.push('Professional removed.', 'success');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to delete.',
        'danger',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Professionals"
        description="Directory of external paper setters, evaluators, and examiners. Selecting a name on a remuneration bill pre-fills designation, organization, contact, and bank details."
        action={<Button onClick={openCreate}>Add professional</Button>}
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader
          title="Directory"
          action={
            <SoftSearchField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, college, email…"
            />
          }
        />
        <CardBody>
          {loading ? (
            <LoadingBlock label="Loading professionals…" />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No professionals yet"
              description="Add external faculty once — they will be suggested when creating remuneration bills."
              action={<Button onClick={openCreate}>Add first professional</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-[var(--border)] text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Name</th>
                    <th className="px-3 py-2.5 font-semibold">Organization</th>
                    <th className="px-3 py-2.5 font-semibold">Contact</th>
                    <th className="px-3 py-2.5 font-semibold">Bank</th>
                    <th className="px-3 py-2.5 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">
                          {row.name}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--muted)]">
                          {row.designation || '—'}
                        </div>
                      </td>
                      <td className="max-w-xs px-3 py-3 text-[var(--muted)]">
                        {row.organization || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div>{row.contactNumber || '—'}</div>
                        <div className="text-[0.6875rem] text-[var(--muted)]">
                          {row.email || ''}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[var(--muted)]">
                        {[row.bankName, row.ifscCode].filter(Boolean).join(' · ') ||
                          '—'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
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
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit professional' : 'Add professional'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name || ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Designation"
              value={form.designation || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, designation: e.target.value }))
              }
            />
            <div className="sm:col-span-2">
              <TextareaField
                label="Organization name & address"
                value={form.organization || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, organization: e.target.value }))
                }
                rows={2}
              />
            </div>
            <Input
              label="Contact number"
              value={form.contactNumber || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, contactNumber: e.target.value }))
              }
            />
            <Input
              label="Email"
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Bank name"
              value={form.bankName || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, bankName: e.target.value }))
              }
            />
            <Input
              label="Account holder"
              value={form.accountHolderName || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, accountHolderName: e.target.value }))
              }
            />
            <Input
              label="Account number"
              value={form.accountNumber || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, accountNumber: e.target.value }))
              }
            />
            <Input
              label="IFSC"
              value={form.ifscCode || ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ifscCode: e.target.value.toUpperCase(),
                }))
              }
            />
            <div className="sm:col-span-2">
              <TextareaField
                label="Bank address"
                value={form.bankAddress || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bankAddress: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
          <FormActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Add professional'}
            </Button>
          </FormActions>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove professional?"
        description={
          deleteTarget
            ? `${deleteTarget.name} will be removed from the directory. Existing bills keep their snapshotted details.`
            : ''
        }
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
