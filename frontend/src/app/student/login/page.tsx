import { Suspense } from 'react';
import { LoginScreen } from '@/components/auth/LoginScreen';

export default function StudentLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9] text-sm text-slate-500">
          Loading authentication…
        </div>
      }
    >
      <LoginScreen defaultRole="student" />
    </Suspense>
  );
}
