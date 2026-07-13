import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';

export default function FeesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & Payments"
        description="View examination fee records, process online and offline payments, and track payment history."
      />
      <Card>
        <CardBody>
          <EmptyState
            title="Fees & Payments module"
            description="Fee collection and payment tracking UI will be built here. Backend APIs are ready."
          />
        </CardBody>
      </Card>
    </div>
  );
}
