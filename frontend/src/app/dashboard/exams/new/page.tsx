'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import { CreateExamInput } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { ExamForm } from '@/components/exams/ExamForm';
import { useToast } from '@/components/ui/Toast';

export default function NewExamPage() {
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

  async function handleSave(data: CreateExamInput) {
    setSaving(true);
    setError('');
    try {
      const created = await api.createExam(data);
      toast.push('Examination created.', 'success');
      router.push(`/dashboard/exams/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create examination.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create examination"
        description="Scope → mapped subjects & fees → dates → review."
        action={
          <Button variant="secondary" onClick={() => router.push('/dashboard/exams')}>
            Back to list
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <CardBody>
          {loading ? (
            <LoadingBlock />
          ) : (
            <ExamForm
              regulations={regulations}
              onSubmit={handleSave}
              onCancel={() => router.push('/dashboard/exams')}
              loading={saving}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
