'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { RemunerationBill } from '@/types/remuneration';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { RemunerationBillForm } from '@/components/remuneration/RemunerationBillForm';
import { useToast } from '@/components/ui/Toast';

export default function EditRemunerationBillPage() {
  const params = useParams<{ billId: string }>();
  const billId = Number(params.billId);
  const router = useRouter();
  const toast = useToast();

  const [bill, setBill] = useState<RemunerationBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getRemunerationBill(billId);
      if (data.status === 'paid') {
        toast.push('Paid bills cannot be edited.', 'warning');
        router.replace(`/dashboard/remuneration/${billId}`);
        return;
      }
      setBill(data);
    } catch (err) {
      setBill(null);
      setError(
        err instanceof ApiError ? err.message : 'Failed to load bill.',
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per billId
  }, [billId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <LoadingBlock label="Loading bill for edit…" />;
  }

  if (!bill) {
    return (
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button
          variant="secondary"
          onClick={() => router.push('/dashboard/remuneration')}
        >
          Back to remunerations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${bill.billNumber}`}
        description="Update professional, papers, bank details, or remuneration lines. Status is advanced from the bill view."
        action={
          <Button
            variant="secondary"
            onClick={() => router.push(`/dashboard/remuneration/${bill.id}`)}
          >
            Back to bill
          </Button>
        }
      />
      <RemunerationBillForm
        initial={bill}
        onSaved={(updated) => {
          toast.push('Bill updated.', 'success');
          router.push(`/dashboard/remuneration/${updated.id}`);
        }}
        onCancel={() => router.push(`/dashboard/remuneration/${bill.id}`)}
      />
    </div>
  );
}
