'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Regulation } from '@/types/regulation';
import {
  CreateSubjectMappingInput,
  ReplaceScopeMappingInput,
  SubjectMappingEntry,
} from '@/types/subject';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { MappingForm } from '@/components/subjects/MappingForm';
import { useToast } from '@/components/ui/Toast';

export default function NewMappingPage() {
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [mappings, setMappings] = useState<SubjectMappingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getRegulations(), api.getSubjectMappings({})])
      .then(([regs, maps]) => {
        setRegulations(regs);
        setMappings(maps);
      })
      .catch(() => setError('Failed to load mapping data.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(data: CreateSubjectMappingInput) {
    setSaving(true);
    setError('');
    try {
      await api.createSubjectMapping(data);
      toast.push('Mapping created.', 'success');
      router.push('/dashboard/subjects/mappings');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create mapping.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleReplaceScope(data: ReplaceScopeMappingInput) {
    setSaving(true);
    setError('');
    try {
      await api.replaceSubjectMappingScope(data);
      toast.push('Scope mapping saved.', 'success');
      router.push('/dashboard/subjects/mappings');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save scope mapping.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create subject mapping"
        description="Choose Scope → subjects or Subject → scopes. Both write the same mapping table."
        action={
          <Button
            variant="secondary"
            onClick={() => router.push('/dashboard/subjects/mappings')}
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
            <MappingForm
              regulations={regulations}
              allMappings={mappings}
              onSubmit={handleSave}
              onReplaceScope={handleReplaceScope}
              onCancel={() => router.push('/dashboard/subjects/mappings')}
              loading={saving}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
