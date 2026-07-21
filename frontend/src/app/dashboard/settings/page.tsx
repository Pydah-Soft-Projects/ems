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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPaymentSettings();
      setSettings(data);
      setEnabled(data.enabled);
      setKeyId(data.razorpayKeyId ?? '');
      setKeySecret('');
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
      setSuccess('Payment settings saved.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save settings.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Razorpay keys for inline popup payments on the fee pages"
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

              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
