'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import { CreateSubjectInput } from '@/types/subject';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { SubjectForm } from '@/components/subjects/SubjectForm';
import { useToast } from '@/components/ui/Toast';

export default function NewSubjectPage() {
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getRegulations()
      .then(setRegulations)
      .catch(() => setError('Failed to load regulations.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(data: CreateSubjectInput | CreateSubjectInput[]) {
    const items = Array.isArray(data) ? data : [data];
    setSaving(true);
    setError('');
    try {
      let created = 0;
      for (const item of items) {
        await api.createSubject(item);
        created += 1;
      }
      toast.push(
        created === 1
          ? 'Subject created.'
          : `${created} subjects created.`,
        'success',
      );
      router.push('/dashboard/subjects');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to create subjects.';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create subjects"
        description="Add one or more subjects under a single regulation. College, branch, and batch mapping is done separately."
        action={
          <Button
            variant="secondary"
            onClick={() => router.push('/dashboard/subjects')}
          >
            Back
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <CardBody>
          {loading ? (
            <LoadingBlock />
          ) : (
            <SubjectForm
              regulations={regulations}
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
