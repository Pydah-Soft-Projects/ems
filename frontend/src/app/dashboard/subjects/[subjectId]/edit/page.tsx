'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import { CreateSubjectInput, Subject } from '@/types/subject';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { SubjectForm } from '@/components/subjects/SubjectForm';
import { useToast } from '@/components/ui/Toast';

export default function EditSubjectPage() {
  const params = useParams<{ subjectId: string }>();
  const subjectId = Number(params.subjectId);
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [regs, subjects] = await Promise.all([
          api.getRegulations(),
          api.getSubjects(),
        ]);
        if (cancelled) return;
        setRegulations(regs);
        setSubject(subjects.find((s) => s.id === subjectId) ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Failed to load subject.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (Number.isFinite(subjectId)) void load();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  async function handleSave(data: CreateSubjectInput) {
    if (!subject) return;
    setSaving(true);
    setError('');
    try {
      await api.updateSubject(subject.id, data);
      toast.push('Subject updated.', 'success');
      router.push('/dashboard/subjects');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update subject.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={subject ? `Edit ${subject.code}` : 'Edit subject'}
        description="Update subject details. Code and regulation cannot be changed."
        action={
          <Button variant="secondary" onClick={() => router.push('/dashboard/subjects')}>
            Cancel
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <CardBody>
          {loading || !subject ? (
            <LoadingBlock />
          ) : (
            <SubjectForm
              regulations={regulations}
              initial={subject}
              onSubmit={handleSave}
              onCancel={() => router.push('/dashboard/subjects')}
              loading={saving}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
