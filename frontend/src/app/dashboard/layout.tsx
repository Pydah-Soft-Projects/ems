import { DashboardShell } from '@/components/layout/DashboardShell';
import { ThemeLoader } from '@/components/layout/ThemeLoader';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ThemeLoader />
      <DashboardShell>{children}</DashboardShell>
    </>
  );
}
