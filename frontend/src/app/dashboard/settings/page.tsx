'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api';
import type { PaymentGatewaySettings } from '@/lib/razorpayCheckout';

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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPaymentSettings();
      setSettings(data);
      setEnabled(data.enabled);
      setKeyId(data.razorpayKeyId ?? '');
      setKeySecret('');
      setSelfOnlineEnabled(Boolean(data.selfOnlineEnabled));
      setSelfOnlineUpiId(data.selfOnlineUpiId ?? '');
      setSelfOnlineMerchantName(data.selfOnlineMerchantName ?? '');
      setSelfOnlinePaymentNote(data.selfOnlinePaymentNote ?? 'Exam Fee');
      setSelfOnlineExpiryHours(String(data.selfOnlineExpiryHours ?? 48));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load payment settings.',
      );
    } finally {
      setLoading(false);
    }
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
      setSettings(updated);
      setEnabled(updated.enabled);
      setKeyId(updated.razorpayKeyId ?? '');
      setKeySecret('');
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
      setSettings(updated);
      setSelfOnlineEnabled(Boolean(updated.selfOnlineEnabled));
      setSelfOnlineUpiId(updated.selfOnlineUpiId ?? '');
      setSelfOnlineMerchantName(updated.selfOnlineMerchantName ?? '');
      setSelfOnlinePaymentNote(updated.selfOnlinePaymentNote ?? 'Exam Fee');
      setSelfOnlineExpiryHours(String(updated.selfOnlineExpiryHours ?? 48));
      setSuccess('Self Online UPI settings saved.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save Self Online settings.',
      );
    } finally {
      setSavingSelf(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Razorpay gateway and Self Online college UPI configuration"
      />

      <Card>
        <CardHeader
          title="Razorpay payments"
          description="Only Key ID and Key Secret are required. Payments complete on your page via the Razorpay popup — no webhook URL needed."
        />
        <CardBody>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
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
          description="College merchant UPI QR — no payment gateway. Fee Management transaction is created only after statement verification."
        />
        <CardBody>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
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
                  <li>After paying, student marks “I have paid” (temporary acknowledgement)</li>
                  <li>Accounts uploads merchant PDF statement and verifies matches</li>
                  <li>Only then fee becomes paid and Fee Management gets the transaction</li>
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

      {error && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-[var(--radius)] bg-[var(--success-soft)] px-3.5 py-2.5 text-sm text-[var(--success)]">
          {success}
        </div>
      )}
    </div>
  );
}
