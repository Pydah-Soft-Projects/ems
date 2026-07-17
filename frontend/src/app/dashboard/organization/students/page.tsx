'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { OrganizationStudents } from '@/components/organization/OrganizationStudents';

export default function OrganizationStudentsPage() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .getSdmsStatus()
      .then((s) => setConnected(s.connected))
      .catch(() => setConnected(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Browse SDMS students with college, course, and branch filters."
      />

      <div className="flex items-center gap-2">
        <Badge
          variant={connected ? 'success' : connected === false ? 'default' : 'default'}
        >
          {connected === null
            ? 'Checking connection...'
            : connected
              ? 'Student DB connected (read-only)'
              : 'Student DB unavailable'}
        </Badge>
      </div>

      <Tabs
        activeId="students"
        items={[
          {
            id: 'hierarchy',
            label: 'Hierarchy',
            href: '/dashboard/organization',
          },
          {
            id: 'students',
            label: 'Students',
            href: '/dashboard/organization/students',
          },
        ]}
      />

      <OrganizationStudents connected={connected === true} />
    </div>
  );
}
