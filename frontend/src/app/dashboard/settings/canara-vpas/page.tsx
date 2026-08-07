'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api';
import type { CanaraVPARecord } from '@/types/canara';

export default function CanaraVpasPage() {
  const [vpas, setVpas] = useState<CanaraVPARecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sid, setSid] = useState('');
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [additionalNumber, setAdditionalNumber] = useState('');
  const [usedFor, setUsedFor] = useState('EMS');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCanaraVpas();
      setVpas(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load VPA records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const activeVpa = useMemo(() => vpas.find((v) => v.isActive), [vpas]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.createCanaraVpa({ sid: sid.trim(), name: name.trim() || undefined, mobileNumber: mobileNumber.trim(), additionalNumber: additionalNumber.trim() || undefined, usedFor: usedFor.trim() || undefined });
      setSuccess('VPA creation requested. The inquiry will be processed automatically.');
      setSid('');
      setName('');
      setMobileNumber('');
      setAdditionalNumber('');
      setUsedFor('EMS');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create VPA');
    } finally {
      setSaving(false);
    }
  }

  async function onActivate(id: number) {
    setError('');
    setSuccess('');
    try {
      await api.activateCanaraVpa(id);
      setSuccess('Selected SID is now active.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to activate SID');
    }
  }

  async function onVerify(id: number) {
    setError('');
    setSuccess('');
    try {
      await api.inquireCanaraVpa(id);
      setSuccess('Inquiry executed. Record updated with any bank-provided UPI/BATCH values.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to inquire VPA');
    }
  }

  async function onDelete(id: number) {
    setError('');
    setSuccess('');
    try {
      await api.deleteCanaraVpa(id);
      setSuccess('VPA record deleted.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete VPA');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Canara VPA Management" description="Create, review, and activate SID/VPA records for Canara bank integration" />
      {error ? <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">{error}</div> : null}
      {success ? <div className="rounded-[var(--radius)] bg-[var(--success-soft)] px-3.5 py-2.5 text-sm text-[var(--success)]">{success}</div> : null}

      <Card>
        <CardHeader title="VPA Creation" description="Create a new SID and onboard it with the bank; inquiry runs automatically." />
        <CardBody>
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
            <Input label="SID" value={sid} onChange={(e) => setSid(e.target.value)} placeholder="SID001" />
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi Kumar" />
            <Input label="Mobile Number" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="9885337002" />
            <Input label="Additional Number" value={additionalNumber} onChange={(e) => setAdditionalNumber(e.target.value)} placeholder="Optional" />
            <Input label="Used For" value={usedFor} onChange={(e) => setUsedFor(e.target.value)} placeholder="EMS" />
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create VPA'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Existing SIDs" description="Only one SID may be active. The active record is used by QR generation and related APIs." />
        <CardBody>
          {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
          {!loading && !vpas.length ? <p className="text-sm text-[var(--muted)]">No SIDs created yet.</p> : null}
          {!loading && vpas.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)]">
                    <th className="px-3 py-2">SID</th>
                    <th className="px-3 py-2">UPI ID</th>
                    <th className="px-3 py-2">Used For</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vpas.map((vpa) => (
                    <tr key={vpa.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-medium">{vpa.sid}</td>
                      <td className="px-3 py-2">{vpa.upiId || '—'}</td>
                      <td className="px-3 py-2">{vpa.usedFor || '—'}</td>
                      <td className="px-3 py-2">{vpa.status || 'PENDING'}</td>
                      <td className="px-3 py-2">{vpa.isActive ? '🟢 Active' : '⚪ Inactive'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {!vpa.isActive ? (
                            vpa.upiId ? (
                              <Button type="button" size="sm" variant="secondary" onClick={() => void onActivate(vpa.id)}>Make Active</Button>
                            ) : (
                              <Button type="button" size="sm" variant="secondary" onClick={() => void onVerify(vpa.id)}>Verify</Button>
                            )
                          ) : null}
                          {!vpa.isActive && vpa.upiId ? <Button type="button" size="sm" variant="secondary" onClick={() => void onActivate(vpa.id)}>Make Active</Button> : null}
                          <Button type="button" size="sm" variant="danger" onClick={() => void onDelete(vpa.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {activeVpa ? (
        <Card>
          <CardHeader title="Active SID" description="The active record is automatically used for QR generation and other Canara API calls." />
          <CardBody>
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="text-xs uppercase text-[var(--muted)]">SID</p><p className="font-medium">{activeVpa.sid}</p></div>
              <div><p className="text-xs uppercase text-[var(--muted)]">UPI ID</p><p className="font-medium">{activeVpa.upiId || '—'}</p></div>
              <div><p className="text-xs uppercase text-[var(--muted)]">Batch ID</p><p className="font-medium">{activeVpa.batchId || '—'}</p></div>
              <div><p className="text-xs uppercase text-[var(--muted)]">Used For</p><p className="font-medium">{activeVpa.usedFor || '—'}</p></div>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
