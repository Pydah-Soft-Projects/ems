'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { setAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login(email.trim(), password);
      setAuth(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Login failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--sidebar)] px-4">
      {/* Background pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px]">
        {/* Brand above card */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-lg font-bold text-white shadow-xl shadow-blue-500/30">
            EMS
          </div>
          <h1 className="text-2xl font-bold text-white">Examination Portal</h1>
          <p className="mt-1 text-sm text-slate-400">Management System</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Super Admin Sign In</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Use your HRMS Super Admin credentials
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@example.com"
            />

            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />

            {error && (
              <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} fullWidth>
              {loading ? 'Signing in...' : 'Sign in to Portal'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Authorized Super Admin access only
        </p>
      </div>
    </div>
  );
}
