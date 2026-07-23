'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { money } from '@/components/fees/money';
import { ApiError, api } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import type {
  SelfOnlinePendingRow,
  SelfOnlineStatementTxn,
  SelfOnlineSuggestion,
} from '@/types/self-online';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { AccessDenied } from '@/components/auth/AccessDenied';

export default function SelfOnlineReconcilePage() {
  const user = getStoredUser();
  const [pending, setPending] = useState<SelfOnlinePendingRow[]>([]);
  const [suggestions, setSuggestions] = useState<SelfOnlineSuggestion[]>([]);
  const [parsedRows, setParsedRows] = useState<SelfOnlineStatementTxn[]>([]);
  const [statements, setStatements] = useState<
    {
      id: number;
      fileName: string;
      sourceKind: string;
      rowCount: number;
      createdAt: string;
      notes: string | null;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [manualPaymentId, setManualPaymentId] = useState('');
  const [bankLine, setBankLine] = useState('');
  const [manualUtr, setManualUtr] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [rowFilter, setRowFilter] = useState<'all' | 'unmatched' | 'matched'>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<{
    awaitingCount: number;
    verifiedCount: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s, st] = await Promise.all([
        api.listSelfOnlinePending(),
        api.listSelfOnlineSuggestions(),
        api.listSelfOnlineStatements(),
      ]);
      setPending(p);
      setSuggestions(s);
      setStatements(st);
      const rows = await api.listSelfOnlineStatementTxns();
      setParsedRows(rows);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load reconciliation data.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload() {
    if (!file) {
      setError('Choose a merchant statement PDF (preferred), or CSV/Excel.');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.uploadSelfOnlineStatement(file);
      setSuccess(
        `Parsed ${result.parsedCount} rows` +
          (result.matchSummary.autoVerified
            ? ` · auto-verified ${result.matchSummary.autoVerified}`
            : '') +
          (result.warning ? ` · ${result.warning}` : ''),
      );
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function onVerify(paymentId: number, merchantTxnId: number) {
    setError('');
    try {
      await api.verifySelfOnlineMatch(paymentId, merchantTxnId);
      setSuccess(
        `Payment #${paymentId} verified. Fee Management sync triggered.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verify failed.');
    }
  }

  async function onReject(merchantTxnId: number) {
    try {
      await api.rejectSelfOnlineSuggestion(merchantTxnId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reject failed.');
    }
  }

  async function onManualVerify() {
    const paymentId = parseInt(manualPaymentId, 10);
    if (!paymentId) {
      setError('Select the awaiting payment to link.');
      return;
    }
    if (!bankLine.trim() && !manualUtr.trim()) {
      setError('Paste the bank narration line or enter the UTR.');
      return;
    }
    setManualSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.manualVerifySelfOnline({
        paymentId,
        utr: manualUtr.trim() || undefined,
        bankLine: bankLine.trim() || undefined,
      });
      setSuccess(
        result.alreadyVerified
          ? `Payment #${paymentId} was already verified.`
          : `Linked UTR and verified payment #${paymentId}. Fee Management sync triggered.`,
      );
      setBankLine('');
      setManualUtr('');
      setManualPaymentId('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Manual verify failed.');
    } finally {
      setManualSaving(false);
    }
  }

  async function onAutoMatchAll() {
    setAutoMatching(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.autoMatchAllSelfOnline();
      setAutoMatchResult(result);
      setSuccess(
        `Auto-match complete: ${result.verifiedCount}/${result.awaitingCount} payments verified.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Auto-match failed.');
    } finally {
      setAutoMatching(false);
    }
  }

  const awaiting = pending.filter((p) => p.status === 'awaiting_verification');

  const filteredRows = parsedRows.filter((row) => {
    if (rowFilter !== 'all' && row.matchStatus !== rowFilter) return false;
    if (directionFilter !== 'all' && row.txnDirection !== directionFilter) {
      return false;
    }
    return true;
  });

  function fmtDate(value: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-IN');
  }

  function fmtMoney(value: number | null) {
    if (value == null) return '—';
    return money(value);
  }

  return (
    <PermissionGate
      user={user}
      privilege={['fees:reconcile', 'fees:read']}
      fallback={
        <AccessDenied description="You need fees:reconcile or fees:read to view Self Online reconciliation." />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Self Online reconciliation"
          description="Upload merchant PDF statements and verify college UPI payments. Fee Management posts only after confirmation."
        />

        {error ? (
          <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-[var(--radius)] bg-[var(--success-soft)] px-3.5 py-2.5 text-sm text-[var(--success)]">
            {success}
          </div>
        ) : null}

        <PermissionGate user={user} privilege="fees:reconcile">
          <Card>
            <CardHeader
              title="Upload merchant statement"
              description="PDF is primary (tamper-resistant). CSV/Excel accepted as secondary assistive formats."
            />
            <CardBody className="space-y-3">
              <input
                type="file"
                accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void onUpload()}
                  disabled={uploading || !file}
                >
                  {uploading ? 'Uploading…' : 'Upload & parse'}
                </Button>
                <Button
                  type="button"
                  onClick={() => void onAutoMatchAll()}
                  disabled={autoMatching}
                >
                  {autoMatching ? 'Auto-matching…' : 'Reconcile all'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void load()}
                >
                  Refresh
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Manual link by UTR / bank line"
              description="Banks often drop the EMS order id from UPI notes. Paste the bank narration (or UTR) and link it to the correct awaiting payment."
            />
            <CardBody className="space-y-3">
              <p className="text-xs text-[var(--muted)]">
                Example narration:{' '}
                <span className="font-mono">
                  UPI/CR/696846634477/…/Exam … -- 1.00
                </span>
                . UTR is the number after{' '}
                <span className="font-mono">UPI/CR/</span>.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Awaiting payment
                </label>
                <select
                  value={manualPaymentId}
                  onChange={(e) => setManualPaymentId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {awaiting.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.orderRef} · {p.studentRollNumber} · {money(p.amount)}
                      {p.studentUtr ? ` · student UTR ${p.studentUtr}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Paste bank narration line
                </label>
                <textarea
                  value={bankLine}
                  onChange={(e) => setBankLine(e.target.value)}
                  rows={3}
                  placeholder="22/07/2026 … UPI/CR/696846634477/… -- 1.00 1.36"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Or UTR only
                </label>
                <input
                  value={manualUtr}
                  onChange={(e) => setManualUtr(e.target.value)}
                  placeholder="696846634477"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
                />
              </div>
              <Button
                type="button"
                onClick={() => void onManualVerify()}
                disabled={manualSaving || awaiting.length === 0}
              >
                {manualSaving ? 'Linking…' : 'Link UTR & verify'}
              </Button>
            </CardBody>
          </Card>
        </PermissionGate>

        <Card>
          <CardHeader
            title="Awaiting verification payments"
            description="Only payments already claimed by the student and waiting for bank reconciliation are shown here."
          />
          <CardBody>
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            ) : awaiting.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No awaiting-verification payments.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-2">Order</th>
                      <th className="px-2 py-2">Student</th>
                      <th className="px-2 py-2">Amount</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">UTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaiting.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--border)]"
                      >
                        <td className="px-2 py-2 font-mono text-xs">
                          {row.orderRef}
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium">{row.studentName}</div>
                          <div className="text-xs text-[var(--muted)]">
                            {row.studentRollNumber}
                          </div>
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {money(row.amount)}
                        </td>
                        <td className="px-2 py-2">
                          <Badge
                            variant={
                              row.status === 'awaiting_verification'
                                ? 'warning'
                                : 'default'
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {row.studentUtr || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Suggested matches"
            description="High confidence matches from order ID, merchant reference, or UTR can be approved quickly. Amount+date suggestions need manual review."
          />
          <CardBody>
            {suggestions.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No suggestions yet.</p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div
                    key={`${s.paymentId}-${s.merchantTxnId}`}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-sm">
                      <p className="font-medium">
                        {s.studentName} · order {s.orderRef} · ref{' '}
                        {s.merchantReference || '—'} · UTR {s.utr || '—'}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {money(s.paymentAmount)} · {s.reason} · confidence{' '}
                        {s.confidence}
                      </p>
                    </div>
                    <PermissionGate user={user} privilege="fees:reconcile">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={() =>
                            void onVerify(s.paymentId, s.merchantTxnId)
                          }
                        >
                          Verify
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void onReject(s.merchantTxnId)}
                        >
                          Reject
                        </Button>
                      </div>
                    </PermissionGate>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Parsed statement rows"
            description="Full fields extracted from uploaded bank statements — dates, direction, UTR, parties, amounts, balance, and narration."
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="text-xs text-[var(--muted)]">
                Match status{' '}
                <select
                  value={rowFilter}
                  onChange={(e) =>
                    setRowFilter(e.target.value as 'all' | 'unmatched' | 'matched')
                  }
                  className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
                >
                  <option value="all">All</option>
                  <option value="unmatched">Unmatched</option>
                  <option value="matched">Matched</option>
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                Direction{' '}
                <select
                  value={directionFilter}
                  onChange={(e) =>
                    setDirectionFilter(
                      e.target.value as 'all' | 'credit' | 'debit',
                    )
                  }
                  className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
                >
                  <option value="all">All</option>
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </select>
              </label>
              <span className="text-xs text-[var(--muted)] self-center">
                Showing {filteredRows.length} of {parsedRows.length} rows
              </span>
            </div>

            {parsedRows.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No parsed rows available yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[2200px] text-left text-xs">
                  <thead className="border-b border-[var(--border)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Post date</th>
                      <th className="px-2 py-2">Value date</th>
                      <th className="px-2 py-2">Txn type</th>
                      <th className="px-2 py-2">Method</th>
                      <th className="px-2 py-2">Rail</th>
                      <th className="px-2 py-2">Direction</th>
                      <th className="px-2 py-2">UTR</th>
                      <th className="px-2 py-2">Bank ref</th>
                      <th className="px-2 py-2">EMS ref</th>
                      <th className="px-2 py-2">IFSC</th>
                      <th className="px-2 py-2">Terminal</th>
                      <th className="px-2 py-2">Branch</th>
                      <th className="px-2 py-2">Payer</th>
                      <th className="px-2 py-2">Payee</th>
                      <th className="px-2 py-2">Payer bank</th>
                      <th className="px-2 py-2">Payer UPI</th>
                      <th className="px-2 py-2">Recv bank</th>
                      <th className="px-2 py-2">Recv IFSC</th>
                      <th className="px-2 py-2">Debit</th>
                      <th className="px-2 py-2">Credit</th>
                      <th className="px-2 py-2">Amount</th>
                      <th className="px-2 py-2">Balance</th>
                      <th className="px-2 py-2">Note</th>
                      <th className="px-2 py-2">Narration</th>
                      <th className="px-2 py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--border)] align-top"
                      >
                        <td className="px-2 py-2 font-mono">{row.id}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {fmtDate(row.postDate)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {fmtDate(row.valueDate)}
                        </td>
                        <td className="px-2 py-2">{row.txnType || '—'}</td>
                        <td className="px-2 py-2">{row.paymentMethod || '—'}</td>
                        <td className="px-2 py-2">{row.paymentRail || '—'}</td>
                        <td className="px-2 py-2">
                          <Badge
                            variant={
                              row.txnDirection === 'credit'
                                ? 'success'
                                : row.txnDirection === 'debit'
                                  ? 'warning'
                                  : 'default'
                            }
                          >
                            {row.txnDirection || '—'}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 font-mono">{row.utr || '—'}</td>
                        <td className="px-2 py-2 font-mono">
                          {row.internalBankRef || '—'}
                        </td>
                        <td className="px-2 py-2 font-mono">
                          {row.merchantReference || '—'}
                        </td>
                        <td className="px-2 py-2 font-mono">{row.ifsc || '—'}</td>
                        <td className="px-2 py-2">{row.terminal || '—'}</td>
                        <td className="px-2 py-2 max-w-[10rem] truncate">
                          {row.branchLocation || '—'}
                        </td>
                        <td className="px-2 py-2">{row.payerName || '—'}</td>
                        <td className="px-2 py-2">{row.payeeName || '—'}</td>
                        <td className="px-2 py-2">{row.payerBankCode || '—'}</td>
                        <td className="px-2 py-2 font-mono">
                          {row.payerUpi || '—'}
                        </td>
                        <td className="px-2 py-2">{row.receiverBankCode || '—'}</td>
                        <td className="px-2 py-2 font-mono">
                          {row.receiverIfsc || '—'}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {fmtMoney(row.debitAmount)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {fmtMoney(row.creditAmount)}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-medium">
                          {fmtMoney(row.amount)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {fmtMoney(row.runningBalance)}
                        </td>
                        <td className="px-2 py-2 max-w-[8rem] truncate">
                          {row.paymentNote || '—'}
                        </td>
                        <td
                          className="px-2 py-2 max-w-[16rem] truncate text-[var(--muted)]"
                          title={row.narration || row.rawLine || ''}
                        >
                          {row.narration || row.rawLine || '—'}
                        </td>
                        <td className="px-2 py-2">
                          <Badge
                            variant={
                              row.matchStatus === 'matched'
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {row.matchStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Uploaded statements" />
          <CardBody>
            {statements.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No uploads yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {statements.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] py-2"
                  >
                    <span>
                      <span className="font-medium">{s.fileName}</span>
                      <span className="ml-2 text-xs uppercase text-[var(--muted)]">
                        {s.sourceKind}
                      </span>
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        {s.rowCount} rows
                      </span>
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(s.createdAt).toLocaleString('en-IN')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </PermissionGate>
  );
}
