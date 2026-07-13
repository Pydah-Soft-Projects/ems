import { PageHeader, EmptyState } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';

export default function ExamsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations"
        description="Create examinations, configure fees, run approval workflows, publish to students, and generate fee records."
      />
      <Card>
        <CardBody>
          <EmptyState
            title="Examinations module"
            description="Full examination workflow UI will be connected here. Backend APIs are ready."
          />
        </CardBody>
      </Card>
    </div>
  );
}
