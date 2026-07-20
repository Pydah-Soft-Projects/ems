'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { RemunerationBillForm } from '@/components/remuneration/RemunerationBillForm';
import { useToast } from '@/components/ui/Toast';
import { RemunerationBill } from '@/types/remuneration';

export default function NewRemunerationBillPage() {
  const router = useRouter();
  const toast = useToast();

  function onSaved(bill: RemunerationBill) {
    toast.push(`Bill ${bill.billNumber} created.`, 'success');
    router.push(`/dashboard/remuneration/${bill.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New remuneration bill"
        description="Fill professional details (auto-suggest from directory), select exam papers, and enter remuneration lines. New bills start as Draft — advance status from the bill view."
        action={
          <Button
            variant="secondary"
            onClick={() => router.push('/dashboard/remuneration')}
          >
            Back to remunerations
          </Button>
        }
      />
      <RemunerationBillForm
        onSaved={onSaved}
        onCancel={() => router.push('/dashboard/remuneration')}
      />
    </div>
  );
}
