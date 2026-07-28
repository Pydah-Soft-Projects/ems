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
const BLUE = '#2563EB';

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

  return (
    <div
      className="relative flex min-h-screen w-full overflow-hidden"
      style={{
        background: 'linear-gradient(100deg, #eaf2ea 0%, #f1f4f2 25%, #f4f6f8 50%, #f3f5f8 100%)',
        color: NAVY,
      }}
    >
      {/* Very subtle pale blurs - light theme cohesive pale look */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute -left-[10%] top-[3%] h-[480px] w-[480px] sm:h-[520px] sm:w-[520px] md:h-[560px] md:w-[560px] 2xl:h-[640px] 2xl:w-[640px] rounded-full bg-[#dcecd9]/60 blur-3xl" />
        <div className="absolute right-0 top-0 h-[420px] w-[420px] sm:h-[460px] sm:w-[460px] md:h-[500px] md:w-[500px] 2xl:h-[580px] 2xl:w-[580px] rounded-full bg-[#e8f3e5]/50 blur-3xl" />
      </div>

      {/* PALE LIGHT THEME bottom curves - ULTRA SOFT, no dark color at all */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-0 h-[36%] sm:h-[38%] md:h-[40%] w-full overflow-hidden" aria-hidden>
        <svg
          viewBox="0 0 1440 680"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 h-full w-full"
        >
          <defs>
            {/* Very bottom - ULTRA LIGHT pale blue-gray (NO DARK NAVY) */}
            <linearGradient id="paleWave1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c7d3e0" stopOpacity="0.22" />
              <stop offset="50%" stopColor="#d3dce6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#dce4ee" stopOpacity="0.14" />
            </linearGradient>
            {/* Middle - Very light pale mint green */}
            <linearGradient id="paleWave2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#dcecd9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#e8f3e5" stopOpacity="0.2" />
            </linearGradient>
            {/* Top curve - Lightest pale sage */}
            <linearGradient id="paleWave3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e6efde" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#f0f6eb" stopOpacity="0.14" />
            </linearGradient>
          </defs>

          {/* Three gentle curves - ALL PALE LIGHT colors match illustration theme */}
          <path
            d="M0,540 C300,510 500,555 760,520 C1020,485 1200,528 1440,490 L1440,680 L0,680 Z"
            fill="url(#paleWave1)"
          />
          <path
            d="M0,460 C320,428 520,478 780,438 C1040,398 1220,448 1440,410 L1440,680 L0,680 Z"
            fill="url(#paleWave2)"
          />
          <path
            d="M0,380 C340,350 540,400 800,360 C1060,320 1240,372 1440,332 L1440,680 L0,680 Z"
            fill="url(#paleWave3)"
          />
        </svg>
      </div>

      {/* EXTREMELY faint dotted pattern - barely there at all */}
      <div
        className="pointer-events-none absolute z-0 left-[0.5%] top-[9%] sm:top-[11%] md:top-[13%] lg:top-[15%] h-[130px] w-[130px] sm:h-[145px] sm:w-[145px] md:h-[160px] md:w-[160px] 2xl:h-[180px] 2xl:w-[180px] opacity-5 sm:opacity-7"
        aria-hidden
        style={{
          backgroundImage: 'radial-gradient(#2E7D32 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Illustration - BOTTOM area empty space fill - LARGER size now since text moved up */}
      <div
        className="pointer-events-none absolute z-10 bottom-0 left-0 h-[52%] sm:h-[55%] md:h-[58%] lg:h-[61%] xl:h-[63%] 2xl:h-[65%] w-[66%] sm:w-[68%] md:w-[70%] lg:w-[70%] xl:w-[72%] hidden md:block"
        aria-hidden
      >
        <Image
          src="/login-illustration.png"
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 56vw, (max-width: 1024px) 58vw, (max-width: 1536px) 60vw, 62vw"
          className="object-contain object-left-bottom"
        />
      </div>

      {/* ===== TWO-COLUMN LAYOUT - SPACIOUS & CLEAN, highlight left side ===== */}
      <div className="relative z-20 flex w-full min-h-screen flex-col md:flex-row">

        {/* Left brand panel - takes MORE width, spacious & clean like reference */}
        <div className="relative hidden md:flex md:flex-col md:flex-1 md:max-w-[58%] lg:max-w-[60%] xl:max-w-[62%] 2xl:max-w-[64%]">
          <div className="relative mx-auto w-fit pt-[8vh] sm:pt-[9vh] md:pt-[10vh] lg:pt-[11vh] xl:pt-[11.5vh] 2xl:pt-[12vh] px-6 sm:px-10 md:px-14 lg:px-16 xl:px-20 2xl:px-24">
            {/* EMS PORTAL - ONE LINE next to logo - ULTRA LIGHT tone */}
            <div className="flex items-center gap-5 sm:gap-6 md:gap-7 lg:gap-8 xl:gap-10 2xl:gap-12">
              <BrandLogo
                className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 xl:h-36 xl:w-36 2xl:h-40 2xl:w-40 opacity-80"
                size="lg"
              />
              <p
                className="font-medium tracking-tight leading-none"
                style={{
                  fontSize: 'clamp(32px, 5.2vw, 56px)',
                  color: '#2b4269',
                }}
              >
                <span style={{ color: '#2b4269' }}>EMS</span>
                <span
                  style={{
                    color: '#5aa05e',
                    letterSpacing: 'clamp(0.04em, 1vw, 0.12em)',
                    marginLeft: 'clamp(6px, 1vw, 14px)',
                    fontWeight: 400,
                  }}
                >
                  PORTAL
                </span>
              </p>
            </div>

            {/* Tagline + Description - MOVED UP CLOSE TO LOGO, smaller font */}
            <div className="relative mt-[2.5vh] sm:mt-[3vh] md:mt-[3.5vh] lg:mt-[4vh] xl:mt-[4.2vh] 2xl:mt-[4.5vh] ml-2 sm:ml-2.5 md:ml-3 lg:ml-4 xl:ml-5 2xl:ml-6">
              <h1
                className="font-medium tracking-tight"
                style={{
                  color: '#2b4269',
                  fontSize: 'clamp(16px, 2.4vw, 26px)',
                }}
              >
                Examine. Evaluate. <span style={{ color: '#5aa05e', fontWeight: 400 }}>Excel.</span>
              </h1>
              <p
                className="max-w-md leading-relaxed mt-1.5 sm:mt-2 md:mt-2.5"
                style={{
                  fontSize: 'clamp(11px, 1.25vw, 14px)',
                  lineHeight: 1.75,
                  color: '#8799b5',
                }}
              >
                A complete examination management system
                <br />
                for a smarter tomorrow.
              </p>
            </div>
          </div>
        </div>

        {/* Right auth panel - COMPACT & REDUCED SIZE, takes LESS width */}
        <div className="relative flex w-full flex-col items-center flex-1 px-3 sm:px-4 md:px-6 lg:px-8 pt-[5vh] sm:pt-[6vh] md:pt-[7vh] lg:pt-[9vh] xl:pt-[10vh] 2xl:pt-[11vh] pb-6 sm:pb-8 lg:mr-[3%] xl:mr-[4%] 2xl:mr-[5%] md:max-w-[42%] lg:max-w-[40%] xl:max-w-[38%] 2xl:max-w-[36%]">
          {/* Brand shown only on small screens (<md) where left panel is hidden */}
          <div className="mb-5 sm:mb-6 flex flex-col items-center md:hidden">
            <BrandLogo size="lg" className="h-16 w-16 sm:h-20 sm:w-20" />
            <p
              className="mt-2 font-bold leading-none"
              style={{
                fontSize: 'clamp(28px, 9vw, 40px)',
                color: NAVY,
              }}
            >
              EMS <span style={{ color: GREEN }}>PORTAL</span>
            </p>
            <h1
              className="mt-3 font-bold tracking-tight text-center"
              style={{
                color: NAVY,
                fontSize: 'clamp(18px, 5.5vw, 24px)',
              }}
            >
              Examine. Evaluate. <span style={{ color: GREEN }}>Excel.</span>
            </h1>
            <p
              className="mt-2 max-w-xs text-center leading-relaxed text-slate-500"
              style={{ fontSize: 'clamp(11.5px, 3.5vw, 13px)' }}
            >
              A complete examination management system for a smarter tomorrow.
            </p>
          </div>

          {/* Login card - COMPACT size, CLEAN subtle style (no loud borders) */}
          <div
            className="w-full rounded-2xl bg-white"
            style={{
              maxWidth: 'clamp(300px, 88vw, 380px)',
              padding: 'clamp(18px, 4.2vw, 26px)',
              boxShadow: '0 12px 40px rgba(13, 27, 61, 0.08)',
            }}
          >
            <h2
              className="text-center font-bold leading-tight"
              style={{
                color: NAVY,
                fontSize: 'clamp(16px, 4.2vw, 20px)',
              }}
            >
              Welcome Back!
            </h2>
            <p
              className="mt-1.5 text-center text-slate-500"
              style={{ fontSize: 'clamp(10.5px, 3vw, 12px)' }}
            >
              Sign in to continue to your account.
            </p>

            {/* Role tabs - compact */}
            <div
              className="flex rounded-lg border border-slate-200 bg-slate-50 mt-4 sm:mt-5"
              style={{ padding: '3px' }}
            >
              <button
                type="button"
                onClick={() => switchRole('student')}
                className={`flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors flex-1 ${
                  role === 'student'
                    ? 'bg-white shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                style={{
                  height: 'clamp(32px, 3.8vw, 34px)',
                  fontSize: 'clamp(11px, 3.1vw, 12.5px)',
                  color: role === 'student' ? GREEN : undefined,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path d="m12 4 10 5-10 5L2 9l10-5Z" strokeLinejoin="round" />
                  <path d="M6 11.5V16c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5M22 9v5" strokeLinecap="round" />
                </svg>
                Student
              </button>
              <button
                type="button"
                onClick={() => switchRole('staff')}
                className={`flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors flex-1 ${
                  role === 'staff'
                    ? 'bg-white shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                style={{
                  height: 'clamp(32px, 3.8vw, 34px)',
                  fontSize: 'clamp(11px, 3.1vw, 12.5px)',
                  color: role === 'staff' ? GREEN : undefined,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" strokeLinecap="round" />
                </svg>
                Staff
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-3 mt-4 sm:mt-4.5"
            >
              <div>
                <label
                  htmlFor="login-identifier"
                  className="mb-1.5 block font-semibold"
                  style={{
                    color: NAVY,
                    fontSize: 'clamp(10.5px, 3vw, 12px)',
                  }}
                >
                  Email / Username
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-400">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      style={{
                        height: 'clamp(13px, 3.5vw, 16px)',
                        width: 'clamp(13px, 3.5vw, 16px)',
                      }}
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" strokeLinecap="round" strokeLinejoin="round" />
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
                    className="w-full rounded-xl border border-slate-200 bg-[#EFF6FF] pr-3 text-slate-800 placeholder:text-slate-400 focus:border-[#2E7D32] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-colors pl-9"
                    style={{
                      height: 'clamp(36px, 4.2vw, 38px)',
                      fontSize: 'clamp(11px, 3.2vw, 12.5px)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block font-semibold"
                  style={{
                    color: NAVY,
                    fontSize: 'clamp(10.5px, 3vw, 12px)',
                  }}
                >
                  Password
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-400">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      style={{
                        height: 'clamp(13px, 3.5vw, 16px)',
                        width: 'clamp(13px, 3.5vw, 16px)',
                      }}
                    >
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
                    className="w-full rounded-xl border border-slate-200 bg-white pr-10 text-slate-800 placeholder:text-slate-400 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-colors pl-9"
                    style={{
                      height: 'clamp(36px, 4.2vw, 38px)',
                      fontSize: 'clamp(11px, 3.2vw, 12.5px)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        style={{
                          height: 'clamp(13px, 3.5vw, 16px)',
                          width: 'clamp(13px, 3.5vw, 16px)',
                        }}
                      >
                        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        style={{
                          height: 'clamp(13px, 3.5vw, 16px)',
                          width: 'clamp(13px, 3.5vw, 16px)',
                        }}
                      >
                        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                        <circle cx="12" cy="12" r="2.5" />
                        <path d="m4 4 16 16" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-slate-600"
                  style={{ fontSize: 'clamp(10.5px, 3vw, 12px)' }}
                >
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded accent-[#0D1B3D]"
                    style={{
                      height: 'clamp(12px, 3.2vw, 13px)',
                      width: 'clamp(12px, 3.2vw, 13px)',
                    }}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setInfo('Please contact your administrator to reset your password.')
                  }
                  className="font-medium"
                  style={{
                    color: BLUE,
                    fontSize: 'clamp(10.5px, 3vw, 12px)',
                  }}
                >
                  Forgot Password?
                </button>
              </div>

              {error ? <Alert tone="danger">{error}</Alert> : null}
              {info ? <Alert tone="info">{info}</Alert> : null}

              <button
                type="submit"
                disabled={loading}
                className="mt-0.5 w-full rounded-xl font-semibold text-white transition-all hover:opacity-92 disabled:opacity-60"
                style={{
                  backgroundColor: NAVY,
                  height: 'clamp(38px, 4.6vw, 42px)',
                  fontSize: 'clamp(11px, 3.3vw, 12.5px)',
                }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p
              className="mt-4 sm:mt-5 text-center text-slate-500"
              style={{ fontSize: 'clamp(10.5px, 3vw, 12px)' }}
            >
              Need help? Contact your{' '}
              <span className="font-semibold" style={{ color: GREEN }}>
                administrator
              </span>
            </p>
          </div>

          <p
            className="mt-4 flex items-center gap-2 text-slate-400"
            style={{ fontSize: 'clamp(9.5px, 2.7vw, 10.5px)' }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              style={{
                height: 'clamp(9px, 2.5vw, 11px)',
                width: 'clamp(9px, 2.5vw, 11px)',
              }}
            >
              <path d="M12 3 5 6v5c0 4.4 3 8.1 7 9 4-.9 7-4.6 7-9V6l-7-3Z" strokeLinejoin="round" />
            </svg>
            Secure Access
            <span className="text-slate-300">|</span>
            Privacy Protected
          </p>
        </div>
      </div>
    </div>
  );
}
