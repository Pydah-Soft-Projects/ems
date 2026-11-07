'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Exam } from '@/types/exam';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { ExamDatesEditor } from '@/components/exams/ExamDatesEditor';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { getStoredUser } from '@/lib/auth';

export default function ExamDatesDetailPage() {
  const params = useParams<{ examId: string }>();
  const examId = Number(params.examId);
  const router = useRouter();
  const user = getStoredUser();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await api.getExam(examId);
        if (!cancelled) setExam(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load external examination notification.',
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

  return (
    <PermissionGate
      user={user}
      privilege={['exams:edit', 'exams:write']}
      fallback={
        <AccessDenied description="You need Create / edit examinations privilege to schedule exam dates." />
      }
    >
      {loading ? (
        <div className="py-20 text-center">
          <LoadingBlock />
        </div>
      ) : error || !exam ? (
        <div className="space-y-4">
          <Alert tone="danger">{error || 'Examination not found.'}</Alert>
        </div>
      ) : (
        <ExamDatesEditor
          exam={exam}
          onSave={() => router.push('/dashboard/exam-dates')}
          onCancel={() => router.push('/dashboard/exam-dates')}
        />
      )}
    </PermissionGate>
  );
}

