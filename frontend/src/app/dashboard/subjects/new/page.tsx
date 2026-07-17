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

  async function handleSave(data: CreateSubjectInput) {
    setSaving(true);
    setError('');
    try {
      await api.createSubject(data);
      toast.push('Subject created.', 'success');
      router.push('/dashboard/subjects');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create subject.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create subject"
        description="Add a subject under a regulation. College, branch, and batch mapping is done separately."
        action={
          <Button variant="secondary" onClick={() => router.push('/dashboard/subjects')}>
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
