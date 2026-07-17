'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

export default function EditMappingPage() {
  const params = useParams<{ mappingId: string }>();
  const mappingId = Number(params.mappingId);
  const router = useRouter();
  const toast = useToast();
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [mappings, setMappings] = useState<SubjectMappingEntry[]>([]);
  const [mapping, setMapping] = useState<SubjectMappingEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [regs, maps] = await Promise.all([
          api.getRegulations(),
          api.getSubjectMappings({}),
        ]);
        if (cancelled) return;
        setRegulations(regs);
        setMappings(maps);
        setMapping(maps.find((m) => m.id === mappingId) ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Failed to load mapping.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (Number.isFinite(mappingId)) void load();
    return () => {
      cancelled = true;
    };
  }, [mappingId]);

  async function handleSave(data: CreateSubjectMappingInput) {
    setSaving(true);
    setError('');
    try {
      await api.createSubjectMapping(data);
      toast.push('Mapping saved.', 'success');
      router.push('/dashboard/subjects/mappings');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save mapping.',
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
      toast.push('Scope mapping updated.', 'success');
      router.push('/dashboard/subjects/mappings');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update scope mapping.',
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit subject mapping"
        description="Change college, branch, year, semester, sections, and subjects for this scope."
        action={
          <Button
            variant="secondary"
            onClick={() => router.push('/dashboard/subjects/mappings')}
          >
            Cancel
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <CardBody>
          {loading || !mapping ? (
            <LoadingBlock />
          ) : (
            <MappingForm
              regulations={regulations}
              allMappings={mappings}
              initial={mapping}
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
