'use client';

import { use } from 'react';
import { FeeCollectionDesk } from '@/components/fees/FeeCollectionDesk';

export default function FeeCollectPage({
  params,
}: {
  params: Promise<{ roll: string }>;
}) {
  const { roll } = use(params);
  const rollNumber = decodeURIComponent(roll);

  return <FeeCollectionDesk rollNumber={rollNumber} />;
}
