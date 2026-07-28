'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api';
import type { PaymentGatewaySettings } from '@/lib/razorpayCheckout';

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
  setters.setRestrictExamApplyOnFeeDues(
    data.restrictExamApplyOnFeeDues !== false,
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<PaymentGatewaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSelf, setSavingSelf] = useState(false);
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
  const [restrictExamApplyOnFeeDues, setRestrictExamApplyOnFeeDues] =
    useState(true);
  const [savingDueRestrict, setSavingDueRestrict] = useState(false);

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
    setRestrictExamApplyOnFeeDues,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPaymentSettings();
      applySettingsToForms(data, formSetters);
    } catch (err) {
      setSettings(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load payment settings.',
      );
    } finally {
      setLoading(false);
    }
    // formSetters are stable setState fns
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
    </div>
  );
}
