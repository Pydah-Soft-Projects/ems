'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import { CreateExamInput, Exam, UpdateExamInput } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { ExamForm } from '@/components/exams/ExamForm';
import { useToast } from '@/components/ui/Toast';

export default function EditExamPage() {
  const params = useParams<{ examId: string }>();
  const examId = Number(params.examId);
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [regs, examData] = await Promise.all([
          api.getRegulations(),
          api.getExam(examId),
        ]);
        if (cancelled) return;
        setRegulations(regs);
        setExam(examData);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load examination.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (Number.isFinite(examId)) void load();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  async function handleSave(data: CreateExamInput) {
    if (!exam) return;
    setSaving(true);
    setError('');
    try {
      const update: UpdateExamInput = { ...data };
      delete (update as { submitForApproval?: boolean }).submitForApproval;
      await api.updateExam(exam.id, update);
      toast.push('Examination updated.', 'success');
      router.push(`/dashboard/exams/${exam.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update examination.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exam ? `Edit ${exam.name}` : 'Edit examination'}
        description="Only draft or rejected examinations can be edited."
        action={
          <Button
            variant="secondary"
            onClick={() =>
              router.push(
                Number.isFinite(examId)
                  ? `/dashboard/exams/${examId}`
                  : '/dashboard/exams',
              )
            }
          >
            Cancel
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <CardBody>
          {loading || !exam ? (
            <LoadingBlock />
          ) : (
            <ExamForm
              regulations={regulations}
              initial={exam}
              onSubmit={handleSave}
              onCancel={() => router.push(`/dashboard/exams/${exam.id}`)}
              loading={saving}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
