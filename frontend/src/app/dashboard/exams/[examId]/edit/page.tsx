'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
import { PermissionGate } from '@/components/auth/PermissionGate';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { getStoredUser } from '@/lib/auth';

export default function EditExamPage() {
  const params = useParams<{ examId: string }>();
  const examId = Number(params.examId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const user = getStoredUser();
  const requestedStep = searchParams.get('step');
  const defaultStep = requestedStep === '2' || requestedStep === '3' || requestedStep === '4'
    ? (Number(requestedStep) as 2 | 3 | 4)
    : 1;
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
    <PermissionGate
      user={user}
      privilege="exams:write"
      fallback={
        <AccessDenied description="You need Create / edit examinations privilege to edit examinations." />
      }
    >
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
                defaultStep={defaultStep}
                onSubmit={handleSave}
                onCancel={() => router.push(`/dashboard/exams/${exam.id}`)}
                loading={saving}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PermissionGate>
  );
}
