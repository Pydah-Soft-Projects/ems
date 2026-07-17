'use client';

import Link from 'next/link';
import { getStoredUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';

export default function StudentProfilePage() {
  const user = getStoredUser();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile & help"
        description="Your academic identity and support contacts for examination fee issues."
      />

      <Card>
        <CardHeader title="Student profile" />
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Name" value={user?.fullName} />
          <Field label="PIN" value={user?.pinNo || user?.username} />
          <Field label="Course" value={user?.course} />
          <Field label="Branch" value={user?.branch} />
          <Field
            label="Year / Semester"
            value={
              user?.currentYear != null
                ? `Y${user.currentYear} / S${user.currentSemester}`
                : null
            }
          />
          <Field label="College" value={user?.college} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Help" description="Who to contact" />
        <CardBody className="space-y-3 text-sm text-slate-700">
          <Alert tone="info">
            For fee collection corrections, contact your college examination /
            accounts desk. Online UPI payments show a receipt under Documents
            after success.
          </Alert>
          <p>
            Staff portal:{' '}
            <Link href="/login" className="font-semibold text-[var(--primary)]">
              Staff sign-in
            </Link>
          </p>
          <p>
            Common tasks: apply under{' '}
            <Link href="/student/exams" className="text-[var(--primary)]">
              Exams
            </Link>
            , pay under{' '}
            <Link href="/student/applications" className="text-[var(--primary)]">
              Applications
            </Link>
            , print under{' '}
            <Link href="/student/documents" className="text-[var(--primary)]">
              Documents
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-0.5 font-medium text-slate-900">{value || '—'}</p>
    </div>
  );
}
