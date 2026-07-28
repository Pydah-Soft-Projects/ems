'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api';
import type {
  CanaraUpiCredentialVersionPublic,
  CanaraUpiSettingsResponse,
} from '@/types/canara-upi';

function applyVersion(
  data: CanaraUpiSettingsResponse,
  set: (v: CanaraUpiSettingsResponse | null) => void,
  fields: Record<string, (v: string) => void>,
  setEnabled: (v: boolean) => void,
) {
  set(data);
  const v = data.version;
  setEnabled(Boolean(v?.enabled ?? data.enabled));
  fields.setEnvironment(v?.environment || 'uat');
  fields.setBaseUrl(v?.baseUrl || 'https://api.canarauat.bank.in');
  fields.setClientId(v?.clientId || '');
  fields.setMerchantMid(v?.merchantMid || '');
  fields.setMerchantSid(v?.merchantSid || '');
  fields.setTerminalId(v?.terminalId || '');
  fields.setUpiId(v?.upiId || '');
  fields.setMerchantName(v?.merchantName || '');
  fields.setAccountNumber(v?.accountNumber || '');
  fields.setIfscCode(v?.ifscCode || '');
  fields.setMcc(v?.mcc || '');
  fields.setMobileNumber(v?.mobileNumber || '');
  fields.setBankName(v?.bankName || 'Canara Bank');
  fields.setCallbackUrl(v?.callbackUrl || '');
  fields.setChangeReason('');
  fields.setClientSecret('');
  fields.setAesSecretKeyHex('');
  fields.setPrivateKeyPem('');
  fields.setClientPublicCertPem('');
  fields.setBankPublicCertPem('');
}

export function CanaraUpiSettingsCard() {
  const [data, setData] = useState<CanaraUpiSettingsResponse | null>(null);
  const [versions, setVersions] = useState<CanaraUpiCredentialVersionPublic[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState('uat');
  const [baseUrl, setBaseUrl] = useState('https://api.canarauat.bank.in');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [aesSecretKeyHex, setAesSecretKeyHex] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [clientPublicCertPem, setClientPublicCertPem] = useState('');
  const [bankPublicCertPem, setBankPublicCertPem] = useState('');
  const [merchantMid, setMerchantMid] = useState('');
  const [merchantSid, setMerchantSid] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [mcc, setMcc] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [bankName, setBankName] = useState('Canara Bank');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [oauthAccessToken, setOauthAccessToken] = useState('');

  const fieldSetters = {
    setEnvironment,
    setBaseUrl,
    setClientId,
    setMerchantMid,
    setMerchantSid,
    setTerminalId,
    setUpiId,
    setMerchantName,
    setAccountNumber,
    setIfscCode,
    setMcc,
    setMobileNumber,
    setBankName,
    setCallbackUrl,
    setChangeReason,
    setClientSecret,
    setAesSecretKeyHex,
    setPrivateKeyPem,
    setClientPublicCertPem,
    setBankPublicCertPem,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [active, hist] = await Promise.all([
        api.getCanaraUpiSettings(),
        api.listCanaraUpiVersions(20).catch(() => ({ versions: [] })),
      ]);
      applyVersion(active, setData, fieldSetters, setEnabled);
      setVersions(hist.versions || []);
    } catch (err) {
      setData(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load Canara UPI settings.',
      );
    } finally {
      setLoading(false);
    }
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
      const payload: Record<string, unknown> = {
        enabled,
        environment,
        baseUrl: baseUrl.trim(),
        clientId: clientId.trim() || undefined,
        merchantMid: merchantMid.trim() || undefined,
        merchantSid: merchantSid.trim() || undefined,
        terminalId: terminalId.trim() || undefined,
        upiId: upiId.trim() || undefined,
        merchantName: merchantName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        ifscCode: ifscCode.trim() || undefined,
        mcc: mcc.trim() || undefined,
        mobileNumber: mobileNumber.trim() || undefined,
        bankName: bankName.trim() || undefined,
        callbackUrl: callbackUrl.trim() || undefined,
        changeReason: changeReason.trim() || undefined,
      };
      if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
      if (aesSecretKeyHex.trim()) payload.aesSecretKeyHex = aesSecretKeyHex.trim();
      if (privateKeyPem.trim()) payload.privateKeyPem = privateKeyPem.trim();
      if (clientPublicCertPem.trim()) {
        payload.clientPublicCertPem = clientPublicCertPem.trim();
      }
      if (bankPublicCertPem.trim()) {
        payload.bankPublicCertPem = bankPublicCertPem.trim();
      }
      if (oauthAccessToken.trim()) {
        payload.oauthAccessToken = oauthAccessToken.trim();
      }

      const updated = await api.updateCanaraUpiSettings(payload);
      applyVersion(updated, setData, fieldSetters, setEnabled);
      setOauthAccessToken('');
      const hist = await api.listCanaraUpiVersions(20).catch(() => ({
        versions: [],
      }));
      setVersions(hist.versions || []);
      setSuccess(
        'Canara settings saved as a new active credential version (history kept).',
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to save Canara UPI settings.',
      );
    } finally {
      setSaving(false);
    }
  }

  const v = data?.version;

  return (
    <Card>
      <CardHeader
        title="Canara Bank UPI Collection"
        description="Dynamic QR via Canara API Banking. Secrets rotate ~every 6 months — each save creates a new active version and keeps history."
      />
      <CardBody>
        {error ? (
          <div className="mb-4 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
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
          <div className="mb-4 rounded-[var(--radius)] bg-[var(--success-soft)] px-3.5 py-2.5 text-sm text-[var(--success)]">
            {success}
          </div>
        ) : null}

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
              Enable Canara UPI dynamic QR payments
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Environment
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="uat">UAT</option>
                  <option value="production">Production</option>
                </select>
              </div>
              <Input
                label="API base URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.canarauat.bank.in"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
              />
              <Input
                label="Client Secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  v?.clientSecretMasked
                    ? `Current ${v.clientSecretMasked} — leave blank to keep`
                    : 'Enter client secret'
                }
                autoComplete="new-password"
              />
            </div>

            <Input
              label="AES secret key (hex, 32 chars)"
              type="password"
              value={aesSecretKeyHex}
              onChange={(e) => setAesSecretKeyHex(e.target.value)}
              placeholder={
                v?.aesSecretKeyHexMasked
                  ? `Current ${v.aesSecretKeyHexMasked} — leave blank to keep`
                  : '32 hex characters'
              }
              autoComplete="new-password"
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Private key PEM (signing)
              </label>
              <textarea
                value={privateKeyPem}
                onChange={(e) => setPrivateKeyPem(e.target.value)}
                rows={3}
                placeholder={
                  v?.privateKeyPemMasked
                    ? `Current ${v.privateKeyPemMasked} — leave blank to keep`
                    : '-----BEGIN PRIVATE KEY-----'
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Client public certificate PEM
              </label>
              <textarea
                value={clientPublicCertPem}
                onChange={(e) => setClientPublicCertPem(e.target.value)}
                rows={3}
                placeholder={
                  v?.clientPublicCertPemMasked
                    ? `Current ${v.clientPublicCertPemMasked} — leave blank to keep`
                    : '-----BEGIN CERTIFICATE-----'
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Bank public certificate PEM (callback verify, optional)
              </label>
              <textarea
                value={bankPublicCertPem}
                onChange={(e) => setBankPublicCertPem(e.target.value)}
                rows={2}
                placeholder={
                  v?.bankPublicCertPemMasked
                    ? `Current ${v.bankPublicCertPemMasked} — leave blank to keep`
                    : 'Optional'
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-xs"
              />
            </div>

            <Input
              label="OAuth access token (Bearer)"
              type="password"
              value={oauthAccessToken}
              onChange={(e) => setOauthAccessToken(e.target.value)}
              placeholder="Paste current access token if required"
              autoComplete="new-password"
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Merchant ID (mid)"
                value={merchantMid}
                onChange={(e) => setMerchantMid(e.target.value)}
              />
              <Input
                label="Sub-merchant ID (sid)"
                value={merchantSid}
                onChange={(e) => setMerchantSid(e.target.value)}
              />
              <Input
                label="Terminal ID"
                value={terminalId}
                onChange={(e) => setTerminalId(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Merchant UPI ID (VPA)"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="merchant@cnrb"
              />
              <Input
                label="Merchant display name"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
              <Input
                label="IFSC"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value)}
              />
              <Input
                label="MCC"
                value={mcc}
                onChange={(e) => setMcc(e.target.value)}
              />
              <Input
                label="Mobile"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
            </div>

            <Input
              label="Bank name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />

            <Input
              label="QR Call-Back URL (register with bank)"
              value={callbackUrl}
              onChange={(e) => setCallbackUrl(e.target.value)}
              placeholder="https://your-host/api/fees/canara-upi/callback"
            />

            <Input
              label="Change reason (optional)"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. 6-month Client Secret rotation"
            />

            <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-800">How it works</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
                <li>Any save creates a new credential version; previous stays in history</li>
                <li>Student/staff get a bank-issued dynamic QR for the exact fee</li>
                <li>Bank Call-Back or status sync marks the fee paid in real time</li>
              </ul>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Status:{' '}
                {data?.ready
                  ? 'Ready'
                  : data?.configured
                    ? 'Configured but disabled'
                    : `Incomplete${data?.missing?.length ? ` (missing: ${data.missing.join(', ')})` : ''}`}
                {v?.id ? ` · Active version #${v.id}` : ''}
                {data?.credentialExpiresAt
                  ? ` · Rotate by ${new Date(data.credentialExpiresAt).toLocaleDateString('en-IN')}`
                  : ''}
                {data?.rotationDueSoon ? ' · Rotation due soon' : ''}
              </p>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save as new active version'}
            </Button>

            {versions.length > 0 ? (
              <div className="pt-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Credential history
                </p>
                <div className="max-h-48 overflow-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[var(--muted)]">
                      <tr>
                        <th className="px-2 py-1.5">ID</th>
                        <th className="px-2 py-1.5">Active</th>
                        <th className="px-2 py-1.5">Reason</th>
                        <th className="px-2 py-1.5">Activated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-2 py-1.5 font-mono">{row.id}</td>
                          <td className="px-2 py-1.5">
                            {row.isActive ? 'Yes' : '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {row.changeReason || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {row.activatedAt
                              ? new Date(row.activatedAt).toLocaleString('en-IN')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </form>
        )}
      </CardBody>
    </Card>
  );
}
