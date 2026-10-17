import { Suspense } from 'react';
import { LoginScreen } from '@/components/auth/LoginScreen';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <pydah-sso-loader portal="examination-portal" />
      }
    >
      <LoginScreen defaultRole="student" />
    </Suspense>
  );
}
