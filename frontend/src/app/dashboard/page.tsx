'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { PageHeader, StatCard } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { navigation } from '@/config/navigation';
import { NavIcon } from '@/components/icons/NavIcon';

interface Stats {
  regulations: number;
  subjects: number;
  exams: number;
}

export default function DashboardPage() {
  const user = getStoredUser();
  const [stats, setStats] = useState<Stats>({
    regulations: 0,
    subjects: 0,
    exams: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [regulations, subjects, exams] = await Promise.all([
          api.getRegulations(),
          api.getSubjects(),
          api.getExams(),
        ]);
        setStats({
          regulations: regulations.length,
          subjects: subjects.length,
          exams: exams.length,
        });
      } catch {
        // keep zeros
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const quickLinks = navigation
    .flatMap((g) => g.items)
    .filter((item) => !item.exact);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}`}
        description="Overview of your examination portal. Configure academic setup, manage examinations, and track fee collections."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Regulations"
          value={stats.regulations}
          hint="Academic regulations configured"
          icon="regulations"
          loading={loading}
        />
        <StatCard
          label="Subjects"
          value={stats.subjects}
          hint="Subjects across regulations"
          icon="subjects"
          loading={loading}
        />
        <StatCard
          label="Examinations"
          value={stats.exams}
          hint="Exams in the system"
          icon="exams"
          loading={loading}
        />
      </section>

      <Card>
        <CardHeader
          title="Portal modules"
          description="Navigate to each module from the sidebar or quick links below"
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-start gap-4 rounded-xl border border-[var(--border)] p-4 transition hover:border-blue-200 hover:bg-[var(--primary-soft)]"
              >
                <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600 transition group-hover:bg-white group-hover:text-[var(--primary)]">
                  <NavIcon name={item.icon} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">{item.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
