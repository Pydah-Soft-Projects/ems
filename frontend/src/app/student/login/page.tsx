'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { setAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export default function StudentLoginPage() {
  const router = useRouter();
  const [pinNo, setPinNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.studentLogin(pinNo.trim(), password);
      setAuth(res.accessToken, res.user);
      router.replace('/student');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Login failed. Check PIN and password.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--background)] px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[var(--primary)]/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-[var(--accent)]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-[var(--primary)] text-lg font-bold text-white shadow-[var(--shadow-lg)]">
            EMS
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Student Portal
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Apply for exams, pay fees, and download documents
          </p>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-lg)]">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Student sign-in</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Use your <strong>PIN / username</strong> and the password from SDMS
              / SMS. For fee counter help, contact your college examination cell.
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <Input
              label="PIN / Username"
              required
              value={pinNo}
              onChange={(e) => setPinNo(e.target.value)}
              placeholder="e.g. 236T1A0521"
              autoComplete="username"
            />
            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password from SMS / SDMS"
              autoComplete="current-password"
            />
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" fullWidth disabled={loading} loading={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Staff?{' '}
            <Link
              href="/login"
              className="font-semibold text-[var(--primary)] hover:underline"
            >
              Staff sign-in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
