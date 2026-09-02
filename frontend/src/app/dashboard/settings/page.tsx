'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api';
import type { PaymentGatewaySettings } from '@/lib/razorpayCheckout';
import type { CanaraStatus } from '@/types/canara';

function applySettingsToForms(
  data: PaymentGatewaySettings,
  setters: {
    setSettings: (v: PaymentGatewaySettings) => void;
    setEnabled: (v: boolean) => void;
    setKeyId: (v: string) => void;
    setKeySecret: (v: string) => void;
    setSelfOnlineEnabled: (v: boolean) => void;
    setSelfOnlineUpiId: (v: string) => void;
    setSelfOnlineMerchantName: (v: string) => void;
    setSelfOnlinePaymentNote: (v: string) => void;
    setSelfOnlineExpiryHours: (v: string) => void;
    setDuplicateHallTicketFee: (v: string) => void;
    setRestrictExamApplyOnFeeDues: (v: boolean) => void;
  },
) {
  setters.setSettings(data);
  setters.setEnabled(data.enabled);
  setters.setKeyId(data.razorpayKeyId ?? '');
  setters.setKeySecret('');
  setters.setSelfOnlineEnabled(Boolean(data.selfOnlineEnabled));
  setters.setSelfOnlineUpiId(data.selfOnlineUpiId ?? '');
  setters.setSelfOnlineMerchantName(data.selfOnlineMerchantName ?? '');
  setters.setSelfOnlinePaymentNote(data.selfOnlinePaymentNote ?? 'Exam Fee');
  setters.setSelfOnlineExpiryHours(String(data.selfOnlineExpiryHours ?? 48));
  setters.setDuplicateHallTicketFee(String(data.duplicateHallTicketFee ?? 250));
  setters.setRestrictExamApplyOnFeeDues(
    data.restrictExamApplyOnFeeDues !== false,
  );
}

function applyCanaraToForm(
  data: CanaraStatus,
  setters: {
    setCanara: (v: CanaraStatus) => void;
    setCanaraEnabled: (v: boolean) => void;
    setCanaraMockMode: (v: boolean) => void;
    setCanaraClientId: (v: string) => void;
    setCanaraClientSecret: (v: string) => void;
    setCanaraBaseUrl: (v: string) => void;
    setCanaraScope: (v: string) => void;
    setCanaraOauthRedirectUri: (v: string) => void;
    setCanaraMid: (v: string) => void;
    setCanaraSid: (v: string) => void;
    setCanaraTerminalId: (v: string) => void;
    setCanaraUpiId: (v: string) => void;
    setCanaraSymmetricKey: (v: string) => void;
    setCanaraPrivateKeyPem: (v: string) => void;
    setCanaraPublicCertPem: (v: string) => void;
  },
) {
  setters.setCanara(data);
  setters.setCanaraEnabled(Boolean(data.enabled));
  setters.setCanaraMockMode(Boolean(data.mockMode));
  setters.setCanaraClientId(data.clientId ?? '');
  setters.setCanaraClientSecret('');
  setters.setCanaraBaseUrl(data.baseUrl ?? 'https://api.canarauat.bank.in');
  setters.setCanaraScope(data.scope ?? '');
  setters.setCanaraOauthRedirectUri(data.oauthRedirectUri ?? '');
  setters.setCanaraMid(data.mid ?? '');
  setters.setCanaraSid(data.sid ?? '');
  setters.setCanaraTerminalId(data.terminalId ?? '');
  setters.setCanaraUpiId(data.upiId ?? '');
  setters.setCanaraSymmetricKey('');
  setters.setCanaraPrivateKeyPem('');
  setters.setCanaraPublicCertPem('');
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<PaymentGatewaySettings | null>(null);
  const [canara, setCanara] = useState<CanaraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSelf, setSavingSelf] = useState(false);
  const [savingCanara, setSavingCanara] = useState(false);
  const [startingOauth, setStartingOauth] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');

  const [selfOnlineEnabled, setSelfOnlineEnabled] = useState(false);
  const [selfOnlineUpiId, setSelfOnlineUpiId] = useState('');
  const [selfOnlineMerchantName, setSelfOnlineMerchantName] = useState('');
  const [selfOnlinePaymentNote, setSelfOnlinePaymentNote] = useState('Exam Fee');
  const [selfOnlineExpiryHours, setSelfOnlineExpiryHours] = useState('48');
  const [duplicateHallTicketFee, setDuplicateHallTicketFee] = useState('250');
  const [restrictExamApplyOnFeeDues, setRestrictExamApplyOnFeeDues] =
    useState(true);
  const [savingDueRestrict, setSavingDueRestrict] = useState(false);

  const [canaraEnabled, setCanaraEnabled] = useState(false);
  const [canaraMockMode, setCanaraMockMode] = useState(false);
  const [canaraClientId, setCanaraClientId] = useState('');
  const [canaraClientSecret, setCanaraClientSecret] = useState('');
  const [canaraBaseUrl, setCanaraBaseUrl] = useState(
    'https://api.canarauat.bank.in',
  );
  const [canaraScope, setCanaraScope] = useState('');
  const [canaraOauthRedirectUri, setCanaraOauthRedirectUri] = useState('');
  const [canaraMid, setCanaraMid] = useState('');
  const [canaraSid, setCanaraSid] = useState('');
  const [canaraTerminalId, setCanaraTerminalId] = useState('');
  const [canaraUpiId, setCanaraUpiId] = useState('');
  const [canaraSymmetricKey, setCanaraSymmetricKey] = useState('');
  const [canaraPrivateKeyPem, setCanaraPrivateKeyPem] = useState('');
  const [canaraPublicCertPem, setCanaraPublicCertPem] = useState('');

  const formSetters = {
    setSettings,
    setEnabled,
    setKeyId,
    setKeySecret,
    setSelfOnlineEnabled,
    setSelfOnlineUpiId,
    setSelfOnlineMerchantName,
    setSelfOnlinePaymentNote,
    setSelfOnlineExpiryHours,
    setDuplicateHallTicketFee,
    setRestrictExamApplyOnFeeDues,
  };

  const canaraSetters = {
    setCanara,
    setCanaraEnabled,
    setCanaraMockMode,
    setCanaraClientId,
    setCanaraClientSecret,
    setCanaraBaseUrl,
    setCanaraScope,
    setCanaraOauthRedirectUri,
    setCanaraMid,
    setCanaraSid,
    setCanaraTerminalId,
    setCanaraUpiId,
    setCanaraSymmetricKey,
    setCanaraPrivateKeyPem,
    setCanaraPublicCertPem,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // Load independently — Canara must NEVER wipe Razorpay / Self Online forms
    const paymentsResult = await api.getPaymentSettings().then(
      (data) => ({ ok: true as const, data }),
      (err) => ({ ok: false as const, err }),
    );
    const canaraResult = await api.getCanaraSettings().then(
      (data) => ({ ok: true as const, data }),
      () => ({ ok: false as const, data: null }),
    );

    if (paymentsResult.ok) {
      applySettingsToForms(paymentsResult.data, formSetters);
    } else {
      setError(
        paymentsResult.err instanceof ApiError
          ? paymentsResult.err.message
          : 'Failed to load payment settings.',
      );
    }
    if (canaraResult.ok && canaraResult.data) {
      applyCanaraToForm(canaraResult.data, canaraSetters);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await api.updatePaymentSettings({
        enabled,
        razorpayKeyId: keyId.trim() || undefined,
        razorpayKeySecret: keySecret.trim() || undefined,
      });
      applySettingsToForms(updated, formSetters);
      setSuccess('Razorpay settings saved.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save settings.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitSelfOnline(e: FormEvent) {
    e.preventDefault();
    setSavingSelf(true);
    setError('');
    setSuccess('');
    try {
      const updated = await api.updatePaymentSettings({
        selfOnlineEnabled,
        selfOnlineUpiId: selfOnlineUpiId.trim(),
        selfOnlineMerchantName: selfOnlineMerchantName.trim(),
        selfOnlinePaymentNote: selfOnlinePaymentNote.trim() || 'Exam Fee',
        selfOnlineExpiryHours: parseInt(selfOnlineExpiryHours, 10) || 48,
        duplicateHallTicketFee: Number(duplicateHallTicketFee) || 0,
      });
      applySettingsToForms(updated, formSetters);
      setSuccess('Self Online UPI settings saved.');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to save Self Online settings.',
      );
    } finally {
      setSavingSelf(false);
    }
  }

  async function onSubmitCanara(e: FormEvent) {
    e.preventDefault();
    setSavingCanara(true);
    setError('');
    setSuccess('');
    try {
      // Saves ONLY to canara_payment_settings — never payment_gateway_settings
      const updated = await api.updateCanaraSettings({
        enabled: canaraEnabled,
        mockMode: canaraMockMode,
        clientId: canaraClientId.trim(),
        clientSecret: canaraClientSecret.trim() || undefined,
        baseUrl: canaraBaseUrl.trim(),
        scope: canaraScope.trim(),
        oauthRedirectUri: canaraOauthRedirectUri.trim(),
        mid: canaraMid.trim(),
        sid: canaraSid.trim(),
        terminalId: canaraTerminalId.trim(),
        upiId: canaraUpiId.trim(),
        symmetricKey: canaraSymmetricKey.trim() || undefined,
        privateKeyPem: canaraPrivateKeyPem.trim() || undefined,
        publicCertPem: canaraPublicCertPem.trim() || undefined,
      });
      applyCanaraToForm(updated, canaraSetters);
      setSuccess('Canara settings saved to canara_payment_settings.');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to save Canara settings.',
      );
    } finally {
      setSavingCanara(false);
    }
  }

  async function onStartCanaraOauth() {
    setStartingOauth(true);
    setError('');
    setSuccess('');
    try {
      const { url } = await api.startCanaraOauth();
      window.open(url, '_blank', 'noopener,noreferrer');
      setSuccess(
        'Opened Canara login in a new tab. After login, return here and refresh settings.',
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to start Canara OAuth.',
      );
    } finally {
      setStartingOauth(false);
    }
  }

  async function onSubmitDueRestrict(e: FormEvent) {
    e.preventDefault();
    setSavingDueRestrict(true);
    setError('');
    setSuccess('');
    try {
      const updated = await api.updatePaymentSettings({
        restrictExamApplyOnFeeDues,
      });
      applySettingsToForms(updated, formSetters);
      setSuccess(
        restrictExamApplyOnFeeDues
          ? 'Exam apply due restriction enabled.'
          : 'Exam apply due restriction disabled.',
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to save due restriction setting.',
      );
    } finally {
      setSavingDueRestrict(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Payments and examination application rules"
      />

      {error ? (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void load()}
            >
              Retry load
            </Button>
          </div>
        </div>
      ) : null}
      {success ? (
        <div className="rounded-[var(--radius)] bg-[var(--success-soft)] px-3.5 py-2.5 text-sm text-[var(--success)]">
          {success}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Exam application — fee due restriction"
          description="Control whether students with overdue Fee Management dues can apply for examinations and access hall tickets."
        />
        <CardBody>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : !settings && error ? (
            <p className="text-sm text-[var(--muted)]">
              Could not load settings. Use Retry load above.
            </p>
          ) : (
            <form
              onSubmit={(e) => void onSubmitDueRestrict(e)}
              className="space-y-5"
            >
              <label className="flex items-start gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={restrictExamApplyOnFeeDues}
                  onChange={(e) =>
                    setRestrictExamApplyOnFeeDues(e.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  Restrict exam application when student has overdue fee dues
                </span>
              </label>

              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">When enabled</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
                  <li>Students with overdue dues can view exam details</li>
                  <li>Apply / submit is blocked until dues are cleared</li>
                  <li>Hall tickets are also blocked for overdue students</li>
                  <li>
                    Staff with <code>fees:due_override</code> (and Super Admin)
                    can still override
                  </li>
                </ul>
                <p className="mt-3 font-medium text-slate-800">When disabled</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
                  <li>Due amounts can still be shown for information</li>
                  <li>Students may apply and access hall tickets even with overdue dues</li>
                </ul>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Status:{' '}
                  {restrictExamApplyOnFeeDues
                    ? 'Restriction ON — overdue dues block apply'
                    : 'Restriction OFF — overdue dues do not block apply'}
                </p>
              </div>

              <Button type="submit" disabled={savingDueRestrict}>
                {savingDueRestrict ? 'Saving…' : 'Save due restriction'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Razorpay payments"
          description="Only Key ID and Key Secret are required. Payments complete on your page via the Razorpay popup — no webhook URL needed."
        />
        <CardBody>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : !settings && error ? (
            <p className="text-sm text-[var(--muted)]">
              Could not load saved Razorpay settings. Use Retry load above.
            </p>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Enable online fee payments (Razorpay popup)
              </label>

              <Input
                label="Razorpay Key ID"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="rzp_live_… or rzp_test_…"
                autoComplete="off"
              />

              <Input
                label="Razorpay Key Secret"
                type="password"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder={
                  settings?.razorpayKeySecretMasked
                    ? `Current ${settings.razorpayKeySecretMasked} — leave blank to keep`
                    : 'Enter key secret'
                }
                autoComplete="new-password"
              />

              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">How it works</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
                  <li>Student or staff clicks Pay on the fee page</li>
                  <li>EMS shows a payment dialog on the same page</li>
                  <li>Razorpay opens as a popup overlay (UPI / card / netbanking)</li>
                  <li>After pay, EMS verifies and shows the receipt — no redirect</li>
                </ul>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Status:{' '}
                  {settings?.configured
                    ? enabled
                      ? 'Ready'
                      : 'Configured but disabled'
                    : 'Add Key ID and Secret'}
                </p>
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Razorpay settings'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Self Online UPI"
          description="College merchant UPI QR — no payment gateway. Fee Management transaction is created only after statement verification. Saved in the database (same place as Razorpay)."
        />
        <CardBody>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : !settings && error ? (
            <p className="text-sm text-[var(--muted)]">
              Could not load saved Self Online settings. Use Retry load above —
              empty fields here do not mean they were wiped.
            </p>
          ) : (
            <form
              onSubmit={(e) => void onSubmitSelfOnline(e)}
              className="space-y-5"
            >
              <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={selfOnlineEnabled}
                  onChange={(e) => setSelfOnlineEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Enable Self Online (college UPI QR)
              </label>

              <Input
                label="Merchant UPI ID"
                value={selfOnlineUpiId}
                onChange={(e) => setSelfOnlineUpiId(e.target.value)}
                placeholder="college@bank"
                autoComplete="off"
              />

              <Input
                label="Merchant display name"
                value={selfOnlineMerchantName}
                onChange={(e) => setSelfOnlineMerchantName(e.target.value)}
                placeholder="Pydah College"
                autoComplete="off"
              />

              <Input
                label="Default payment note"
                value={selfOnlinePaymentNote}
                onChange={(e) => setSelfOnlinePaymentNote(e.target.value)}
                placeholder="Exam Fee"
                autoComplete="off"
              />

              <Input
                label="QR / pending expiry (hours)"
                value={selfOnlineExpiryHours}
                onChange={(e) => setSelfOnlineExpiryHours(e.target.value)}
                placeholder="48"
                autoComplete="off"
              />

              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">How it works</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
                  <li>Student gets UPI QR with EMS order ID in the payment note</li>
                  <li>
                    After paying, student marks “I have paid” (temporary
                    acknowledgement)
                  </li>
                  <li>Accounts uploads merchant PDF statement and verifies matches</li>
                  <li>
                    Only then fee becomes paid and Fee Management gets the
                    transaction
                  </li>
                </ul>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Status:{' '}
                  {settings?.selfOnlineReady
                    ? 'Ready'
                    : settings?.selfOnlineConfigured
                      ? 'Configured but disabled'
                      : 'Add Merchant UPI ID and enable'}
                </p>
              </div>

              <Button type="submit" disabled={savingSelf}>
                {savingSelf ? 'Saving…' : 'Save Self Online settings'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Duplicate hall ticket fee"
          description="Global default charge applied when an exam-specific duplicate hall ticket fee is not set."
        />
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                try {
                  setError('');
                  setSuccess('');
                  const updated = await api.updatePaymentSettings({
                    duplicateHallTicketFee: Number(duplicateHallTicketFee) || 0,
                  });
                  applySettingsToForms(updated, formSetters);
                  setSuccess('Duplicate hall ticket fee saved.');
                } catch (err) {
                  setError(
                    err instanceof ApiError
                      ? err.message
                      : 'Failed to save duplicate hall ticket fee.',
                  );
                }
              })();
            }}
            className="space-y-5"
          >
            <Input
              label="Default duplicate hall ticket fee"
              type="number"
              min={0}
              value={duplicateHallTicketFee}
              onChange={(e) => setDuplicateHallTicketFee(e.target.value)}
              placeholder="250"
              autoComplete="off"
            />

            <Button type="submit" disabled={savingSelf}>
              Save duplicate fee
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Canara VPA / SID Management"
          description="Create and manage the SID/VPA records used for Canara onboarding and QR generation."
        />
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-slate-50 px-3.5 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Create or manage Canara VPA/SID records</p>
              <p className="text-xs text-[var(--muted)]">Use this screen to onboard new SIDs, review inquiry results, and activate the one you want to use.</p>
            </div>
            <Link
              href="/dashboard/settings/canara-vpas"
              className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Manage VPA / SID
            </Link>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Canara Bank Dynamic QR"
          description="Stored in table canara_payment_settings only — not in Razorpay / Self Online payment settings. Register the QR Callback URL with the bank during app setup."
        />
        <CardBody>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => void onSubmitCanara(e)}
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={canaraEnabled}
                  onChange={(e) => setCanaraEnabled(e.target.checked)}
                />
                Enable Canara Dynamic QR
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={canaraMockMode}
                  onChange={(e) => setCanaraMockMode(e.target.checked)}
                />
                Test mode — real Canara QR/callback, but do NOT mark fee dues paid
              </label>

              <div className="rounded-[var(--radius)] bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <p>
                  <span className="font-semibold">QR Callback URL</span> (register
                  with bank):
                </p>
                <code className="mt-1 block break-all">
                  {canara?.qrCallbackUrl || '—'}
                </code>
                <p className="mt-2">
                  <span className="font-semibold">OAuth redirect URI</span>:
                </p>
                <code className="mt-1 block break-all">
                  {canaraOauthRedirectUri || canara?.oauthRedirectUri || '—'}
                </code>
              </div>

              <Input
                label="Client ID"
                value={canaraClientId}
                onChange={(e) => setCanaraClientId(e.target.value)}
              />
              <Input
                label="Client Secret"
                type="password"
                placeholder={
                  canara?.hasClientSecret
                    ? canara.clientSecretMasked || '••••'
                    : 'Enter client secret'
                }
                value={canaraClientSecret}
                onChange={(e) => setCanaraClientSecret(e.target.value)}
              />
              <Input
                label="API Base URL"
                value={canaraBaseUrl}
                onChange={(e) => setCanaraBaseUrl(e.target.value)}
              />
              <Input
                label="OAuth Scope"
                value={canaraScope}
                onChange={(e) => setCanaraScope(e.target.value)}
              />
              <Input
                label="OAuth Redirect URI"
                value={canaraOauthRedirectUri}
                onChange={(e) => setCanaraOauthRedirectUri(e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Merchant ID (mid)"
                  value={canaraMid}
                  onChange={(e) => setCanaraMid(e.target.value)}
                />
                <Input
                  label="Sub-merchant ID (sid)"
                  value={canaraSid}
                  onChange={(e) => setCanaraSid(e.target.value)}
                />
                <Input
                  label="Terminal ID"
                  value={canaraTerminalId}
                  onChange={(e) => setCanaraTerminalId(e.target.value)}
                />
                <Input
                  label="Merchant VPA (upiId)"
                  value={canaraUpiId}
                  onChange={(e) => setCanaraUpiId(e.target.value)}
                />
              </div>
              <Input
                label="Symmetric key (JWE A256KW)"
                type="password"
                placeholder={
                  canara?.hasSymmetricKey ? '•••• saved' : '32-byte key'
                }
                value={canaraSymmetricKey}
                onChange={(e) => setCanaraSymmetricKey(e.target.value)}
              />
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">
                  RSA private key PEM (signing)
                </span>
                <textarea
                  className="min-h-24 w-full rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 font-mono text-xs"
                  placeholder={
                    canara?.hasPrivateKey
                      ? '•••• saved — paste to replace'
                      : '-----BEGIN PRIVATE KEY-----'
                  }
                  value={canaraPrivateKeyPem}
                  onChange={(e) => setCanaraPrivateKeyPem(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">
                  Public certificate PEM (x-client-Certificate)
                </span>
                <textarea
                  className="min-h-24 w-full rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 font-mono text-xs"
                  placeholder={
                    canara?.hasPublicCert
                      ? '•••• saved — paste to replace'
                      : '-----BEGIN CERTIFICATE-----'
                  }
                  value={canaraPublicCertPem}
                  onChange={(e) => setCanaraPublicCertPem(e.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={savingCanara}>
                  {savingCanara ? 'Saving…' : 'Save Canara settings'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={startingOauth}
                  onClick={() => void onStartCanaraOauth()}
                >
                  {startingOauth ? 'Opening…' : 'Connect Canara OAuth'}
                </Button>
              </div>

              <p className="text-xs text-[var(--muted)]">
                Status:{' '}
                {canara?.ready
                  ? canara.testMode || canara.mockMode
                    ? 'Ready (test mode — dues will not update)'
                    : 'Ready (live settlement)'
                  : canara?.configured
                    ? canara?.oauthReady
                      ? 'Configured'
                      : 'Configured — connect OAuth'
                    : 'Incomplete'}
                {canara?.hasAccessToken ? ' · Access token present' : ''}
                {canara?.missing?.length
                  ? ` · Missing: ${canara.missing.join(', ')}`
                  : ''}
              </p>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
