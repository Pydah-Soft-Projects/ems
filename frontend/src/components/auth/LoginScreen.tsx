'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { setAuth } from '@/lib/auth';
import { Alert } from '@/components/ui/Alert';
import { BrandLogo } from '@/components/brand/BrandLogo';

const NAVY = '#0D1B3D';
const GREEN = '#2E7D32';

type Role = 'student' | 'staff';

export function LoginScreen({ defaultRole = 'student' }: { defaultRole?: Role }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(defaultRole);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  function switchRole(next: Role) {
    setRole(next);
    setError('');
    setInfo('');
    setIdentifier('');
    setPassword('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (role === 'student') {
        const res = await api.studentLogin(identifier.trim(), password);
        setAuth(res.accessToken, res.user);
        router.replace('/student');
      } else {
        const res = await api.login(identifier.trim(), password);
        setAuth(res.accessToken, res.user);
        router.replace('/dashboard');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Login failed. Please try again.',
      );
      setLoading(false);
    }
  }

  const tabBase =
    'flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors';

  return (
    <div
      className="relative flex min-h-screen overflow-hidden bg-[#F1F5F9]"
      style={{ color: NAVY }}
    >
      {/* Decorative background shapes */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-[#2E7D32]/10 blur-3xl" />
        <div className="absolute -right-32 -top-32 h-[380px] w-[380px] rounded-full bg-[#2E7D32]/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-[320px] w-[320px] rounded-full bg-[#0D1B3D]/5 blur-3xl" />
      </div>

      {/* Illustration as a full-page background layer, big, anchored to the bottom-left corner */}
      <div
        className="pointer-events-none absolute -bottom-10 left-0 top-[24%] hidden w-[70%] lg:block"
        aria-hidden
      >
        <Image
          src="/login-illustration.png"
          alt=""
          fill
          priority
          sizes="62vw"
          className="object-contain object-left-bottom"
        />
      </div>

      {/* Left brand panel */}
      <div className="relative hidden flex-1 flex-col py-8 lg:flex">
        {/* Logo + tagline centered in the panel, pushed down toward the vertical middle */}
        <div className="relative mx-auto mt-[9vh] w-fit px-8">
          <div className="flex items-center gap-6">
            <BrandLogo className="h-36 w-36 xl:h-44 xl:w-44" size="lg" />
            <p className="text-5xl font-bold tracking-tight xl:text-6xl" style={{ color: NAVY }}>
              EMS{' '}
              <span
                className="font-semibold tracking-[0.12em]"
                style={{ color: GREEN }}
              >
                PORTAL
              </span>
            </p>
          </div>

          <h1
            className="ml-8 mt-6 text-3xl font-bold tracking-tight xl:ml-12 xl:text-4xl"
            style={{ color: NAVY }}
          >
            Examine. Evaluate. <span style={{ color: GREEN }}>Excel.</span>
          </h1>
          <p className="ml-8 mt-3 max-w-md text-lg leading-relaxed text-slate-500 xl:ml-12">
            A complete examination management system for a smarter tomorrow.
          </p>
        </div>

      </div>

      {/* Right auth panel */}
      <div className="relative flex w-full flex-col items-center justify-center px-4 py-10 lg:mr-24 lg:w-[44%] lg:max-w-[600px] xl:mr-44">
        {/* Compact logo on small screens */}
        <div className="mb-6 flex flex-col items-center lg:hidden">
          <BrandLogo size="lg" className="h-20 w-20" />
          <p className="mt-2 text-2xl font-bold" style={{ color: NAVY }}>
            EMS <span style={{ color: GREEN }}>PORTAL</span>
          </p>
        </div>

        <div className="w-full max-w-[440px] rounded-2xl bg-white p-7 shadow-[0_20px_60px_rgb(13_27_61/0.10)] sm:p-9">
          <h2 className="text-center text-2xl font-bold" style={{ color: NAVY }}>
            Welcome Back!
          </h2>
          <p className="mt-1.5 text-center text-[13px] text-slate-500">
            Sign in to continue to your account
          </p>

          {/* Role tabs */}
          <div className="mt-6 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => switchRole('student')}
              className={`${tabBase} ${
                role === 'student'
                  ? 'bg-white shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              style={role === 'student' ? { color: GREEN } : undefined}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="m12 4 10 5-10 5L2 9l10-5Z" strokeLinejoin="round" />
                <path d="M6 11.5V16c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5M22 9v5" strokeLinecap="round" />
              </svg>
              Student
            </button>
            <button
              type="button"
              onClick={() => switchRole('staff')}
              className={`${tabBase} ${
                role === 'staff'
                  ? 'bg-white shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              style={role === 'staff' ? { color: GREEN } : undefined}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" strokeLinecap="round" />
              </svg>
              Staff
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="login-identifier"
                className="mb-1.5 block text-[13px] font-semibold"
                style={{ color: NAVY }}
              >
                {role === 'student'
                  ? 'PIN / Username'
                  : 'Email / Employee number'}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  id="login-identifier"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  placeholder={
                    role === 'student'
                      ? 'Enter your PIN or username'
                      : 'Enter your email or employee number'
                  }
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-[13px] font-semibold"
                style={{ color: NAVY }}
              >
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                    <rect x="5" y="10" width="14" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                      <path d="m4 4 16 16" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#0D1B3D]"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() =>
                  setInfo('Please contact your administrator to reset your password.')
                }
                className="text-[13px] font-medium text-[#2563EB] hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}
            {info ? <Alert tone="info">{info}</Alert> : null}

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-slate-500">
            Need help? Contact your{' '}
            <span className="font-semibold" style={{ color: GREEN }}>
              administrator
            </span>
          </p>
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
            <path d="M12 3 5 6v5c0 4.4 3 8.1 7 9 4-.9 7-4.6 7-9V6l-7-3Z" strokeLinejoin="round" />
          </svg>
          Secure Access
          <span className="text-slate-300">|</span>
          Privacy Protected
        </p>
      </div>
    </div>
  );
}
