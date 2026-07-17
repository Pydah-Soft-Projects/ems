'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingBlock } from '@/components/ui/Spinner';

/** Legacy route — redirect to unified application lifecycle. */
export default function LegacyStudentApplyRedirect({
  params,
}: {
  params: Promise<{ feeRecordId: string }>;
}) {
  const { feeRecordId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/student/applications/${feeRecordId}`);
  }, [feeRecordId, router]);

  return <LoadingBlock label="Opening application…" />;
}
