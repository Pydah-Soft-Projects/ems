'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Exam } from '@/types/exam';
import {
  BILL_TYPE_LABELS,
  CreateRemunerationBillInput,
  ExamBillBranch,
  ExamBillSubject,
  Professional,
  RemunerationBill,
  RemunerationBillType,
  RemunerationMeta,
  RemunerationSubjectRef,
} from '@/types/remuneration';
import { ProfessionalSuggest } from './ProfessionalSuggest';
import { Input, SelectField, TextareaField, Checkbox } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormActions } from '@/components/ui/FormActions';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Money } from '@/components/ui/StatusBadge';

type LineRow = {
  key: string;
  remunerationFor: string;
  quantity: string;
  unitPrice: string;
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLine(suggestion = ''): LineRow {
  return {
    key: newKey(),
    remunerationFor: suggestion,
    quantity: '',
    unitPrice: '',
  };
}

function parseAmount(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

type Props = {
  initial?: RemunerationBill | null;
  defaultExamId?: number;
  onSaved: (bill: RemunerationBill) => void;
  onCancel?: () => void;
};

export function RemunerationBillForm({
  initial,
  defaultExamId,
  onSaved,
  onCancel,
}: Props) {
  const [meta, setMeta] = useState<RemunerationMeta | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [branches, setBranches] = useState<ExamBillBranch[]>([]);
  const [examSubjects, setExamSubjects] = useState<ExamBillSubject[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [billType, setBillType] = useState<RemunerationBillType>(
    initial?.billType || 'qp_setting',
  );
  const [examId, setExamId] = useState<number | ''>(
    initial?.examId || defaultExamId || '',
  );
  const [branch, setBranch] = useState(initial?.branch || '');
  const [academicYear, setAcademicYear] = useState(
    initial?.academicYear || '',
  );
  const [selectedSubjects, setSelectedSubjects] = useState<
    RemunerationSubjectRef[]
  >(initial?.subjects || []);

  const [professionalId, setProfessionalId] = useState<number | null>(
    initial?.professionalId ?? null,
  );
  const [professionalName, setProfessionalName] = useState(
    initial?.professionalName || '',
  );
  const [designation, setDesignation] = useState(initial?.designation || '');
  const [organization, setOrganization] = useState(
    initial?.organization || '',
  );
  const [contactNumber, setContactNumber] = useState(
    initial?.contactNumber || '',
  );
  const [email, setEmail] = useState(initial?.email || '');
  const [bankName, setBankName] = useState(initial?.bankName || '');
  const [accountHolderName, setAccountHolderName] = useState(
    initial?.accountHolderName || '',
  );
  const [accountNumber, setAccountNumber] = useState(
    initial?.accountNumber || '',
  );
  const [ifscCode, setIfscCode] = useState(initial?.ifscCode || '');
  const [bankAddress, setBankAddress] = useState(initial?.bankAddress || '');
  const [saveToDirectory, setSaveToDirectory] = useState(true);

  const [durationFrom, setDurationFrom] = useState(
    toDateInput(initial?.durationFrom),
  );
  const [durationTo, setDurationTo] = useState(toDateInput(initial?.durationTo));
  const [numberOfDays, setNumberOfDays] = useState(
    initial?.numberOfDays != null ? String(initial.numberOfDays) : '',
  );
  const [billDate, setBillDate] = useState(
    toDateInput(initial?.billDate) || new Date().toISOString().slice(0, 10),
  );
  const [officeNotes, setOfficeNotes] = useState(initial?.officeNotes || '');

  const [lines, setLines] = useState<LineRow[]>(() => {
    if (initial?.lineItems?.length) {
      return initial.lineItems.map((item) => ({
        key: newKey(),
        remunerationFor: item.remunerationFor,
        quantity: item.quantity ? String(item.quantity) : '',
        unitPrice: item.unitPrice ? String(item.unitPrice) : '',
      }));
    }
    return [emptyLine('Setting of Question Paper'), emptyLine()];
  });

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === examId) || null,
    [exams, examId],
  );

  const needsDuration =
    billType === 'lab_project' ||
    billType === 'observer' ||
    billType === 'examiner';

  const totals = useMemo(() => {
    const grandTotalQuantity = lines.reduce(
      (s, row) => s + parseAmount(row.quantity),
      0,
    );
    const grandTotalAmount = lines.reduce((s, row) => {
      const amount = parseAmount(row.quantity) * parseAmount(row.unitPrice);
      return s + amount;
    }, 0);
    return {
      grandTotalQuantity,
      grandTotalAmount: Math.round(grandTotalAmount * 100) / 100,
    };
  }, [lines]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      try {
        const [m, published, all] = await Promise.all([
          api.getRemunerationMeta(),
          api.getExams('published'),
          api.getExams(),
        ]);
        if (cancelled) return;
        setMeta(m);
        // Prefer published first, then any others for drafting against approved exams
        const byId = new Map<number, Exam>();
        [...published, ...all].forEach((e) => byId.set(e.id, e));
        setExams(Array.from(byId.values()));
        if (!initial?.lineItems?.length && m.defaultLineSuggestions[billType]) {
          const suggestions = m.defaultLineSuggestions[billType];
          setLines(
            suggestions.length
              ? suggestions.map((s) => emptyLine(s))
              : [emptyLine()],
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load form metadata.',
          );
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBranches = useCallback(async (id: number) => {
    try {
      const rows = await api.getRemunerationExamBranches(id);
      setBranches(rows);
      return rows;
    } catch {
      setBranches([]);
      return [];
    }
  }, []);

  const loadSubjects = useCallback(async (id: number, branchName: string) => {
    try {
      setExamSubjects(
        await api.getRemunerationExamSubjects(id, branchName || undefined),
      );
    } catch {
      setExamSubjects([]);
    }
  }, []);

  useEffect(() => {
    if (!examId) {
      setBranches([]);
      setExamSubjects([]);
      return;
    }
    void (async () => {
      const rows = await loadBranches(examId);
      if (!branch && rows.length === 1) {
        setBranch(rows[0].branch);
      }
    })();
  }, [examId, loadBranches]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!examId) return;
    void loadSubjects(examId, branch);
  }, [examId, branch, loadSubjects]);

  function applyProfessional(p: Professional) {
    setProfessionalId(p.id);
    setProfessionalName(p.name);
    setDesignation(p.designation || '');
    setOrganization(p.organization || '');
    setContactNumber(p.contactNumber || '');
    setEmail(p.email || '');
    setBankName(p.bankName || '');
    setAccountHolderName(p.accountHolderName || '');
    setAccountNumber(p.accountNumber || '');
    setIfscCode(p.ifscCode || '');
    setBankAddress(p.bankAddress || '');
  }

  function onBillTypeChange(next: RemunerationBillType) {
    setBillType(next);
    if (!initial && meta?.defaultLineSuggestions[next]) {
      const suggestions = meta.defaultLineSuggestions[next];
      setLines(
        suggestions.length
          ? suggestions.map((s) => emptyLine(s))
          : [emptyLine()],
      );
    }
  }

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function toggleSubject(subject: ExamBillSubject) {
    setSelectedSubjects((prev) => {
      const exists = prev.some(
        (s) =>
          s.examSubjectId === subject.examSubjectId ||
          (s.subjectId === subject.subjectId &&
            s.name === subject.name),
      );
      if (exists) {
        return prev.filter(
          (s) =>
            !(
              s.examSubjectId === subject.examSubjectId ||
              (s.subjectId === subject.subjectId && s.name === subject.name)
            ),
        );
      }
      return [
        ...prev,
        {
          subjectId: subject.subjectId,
          examSubjectId: subject.examSubjectId,
          code: subject.code,
          name: subject.name,
        },
      ];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!professionalName.trim()) {
      setError('Professional name is required.');
      return;
    }
    const lineItems = lines
      .map((row) => {
        const quantity = parseAmount(row.quantity);
        const unitPrice = parseAmount(row.unitPrice);
        return {
          remunerationFor: row.remunerationFor.trim(),
          quantity,
          unitPrice,
          amount: quantity * unitPrice,
        };
      })
      .filter((row) => row.remunerationFor || row.quantity || row.unitPrice);

    if (!lineItems.length) {
      setError('Add at least one remuneration line.');
      return;
    }

    const branchMeta = branches.find(
      (b) => b.branch.toLowerCase() === branch.toLowerCase(),
    );

    const payload: CreateRemunerationBillInput = {
      billType,
      status: initial?.status || 'draft',
      examId: examId || null,
      professionalId,
      professionalName: professionalName.trim(),
      designation: designation.trim() || null,
      organization: organization.trim() || null,
      contactNumber: contactNumber.trim() || null,
      email: email.trim() || null,
      bankName: bankName.trim() || null,
      accountHolderName: accountHolderName.trim() || null,
      accountNumber: accountNumber.trim() || null,
      ifscCode: ifscCode.trim() || null,
      bankAddress: bankAddress.trim() || null,
      academicYear: academicYear.trim() || null,
      branch: branch || null,
      course: branchMeta?.course || selectedExam?.course || null,
      batch: branchMeta?.batch || selectedExam?.batch || null,
      yearOfStudy:
        branchMeta?.yearOfStudy ?? selectedExam?.yearOfStudy ?? null,
      semester: branchMeta?.semester ?? selectedExam?.semester ?? null,
      subjects: selectedSubjects,
      durationFrom: durationFrom || null,
      durationTo: durationTo || null,
      numberOfDays: numberOfDays ? Number(numberOfDays) : null,
      lineItems,
      billDate: billDate || null,
      officeNotes: officeNotes.trim() || null,
      saveToDirectory,
    };

    setSaving(true);
    try {
      const bill = initial
        ? await api.updateRemunerationBill(initial.id, payload)
        : await api.createRemunerationBill(payload);
      onSaved(bill);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to save remuneration bill.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadingMeta) {
    return (
      <p className="text-xs text-[var(--muted)]">Loading remuneration form…</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader title="Bill type & examination" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Bill type"
            value={billType}
            onChange={(e) =>
              onBillTypeChange(e.target.value as RemunerationBillType)
            }
          >
            {(meta?.billTypes || Object.entries(BILL_TYPE_LABELS).map(
              ([value, label]) => ({ value, label }),
            )).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectField>

          <Input
            label="Bill date"
            type="date"
            value={billDate}
            onChange={(e) => setBillDate(e.target.value)}
          />

          <SelectField
            label="Examination"
            value={examId === '' ? '' : String(examId)}
            onChange={(e) => {
              const next = e.target.value ? Number(e.target.value) : '';
              setExamId(next);
              setBranch('');
              setSelectedSubjects([]);
            }}
          >
            <option value="">Select exam…</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} ({exam.status})
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Branch"
            value={branch}
            disabled={!examId}
            onChange={(e) => {
              setBranch(e.target.value);
              setSelectedSubjects([]);
            }}
          >
            <option value="">Select branch…</option>
            {branches.map((b) => (
              <option key={b.branch} value={b.branch}>
                {b.branch}
              </option>
            ))}
          </SelectField>

          <Input
            label="Academic year"
            placeholder="e.g. AY 25 to 26"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />

          {selectedExam ? (
            <div className="sm:col-span-2 lg:col-span-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-xs text-slate-700">
              <span className="font-semibold">Exam context: </span>
              {[
                selectedExam.course,
                branch || selectedExam.branch,
                `Year ${selectedExam.yearOfStudy}`,
                `Sem ${selectedExam.semester}`,
                selectedExam.batch,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Subjects / papers"
          description="Listed from the selected exam, filtered by branch. Select one or more."
        />
        <CardBody>
          {!examId ? (
            <p className="text-xs text-[var(--muted)]">
              Select an examination to load its papers.
            </p>
          ) : examSubjects.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              No subjects found for this exam{branch ? ` / ${branch}` : ''}.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {examSubjects.map((subject) => {
                const checked = selectedSubjects.some(
                  (s) =>
                    s.examSubjectId === subject.examSubjectId ||
                    (s.subjectId === subject.subjectId &&
                      s.name === subject.name),
                );
                return (
                  <li key={subject.examSubjectId}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-xs hover:border-[var(--primary)]">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => toggleSubject(subject)}
                      />
                      <span>
                        <span className="font-semibold text-slate-900">
                          {subject.name}
                        </span>
                        <span className="mt-0.5 block text-[0.6875rem] text-[var(--muted)]">
                          {[subject.code, subject.branch, subject.section]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Professional details"
          description="Type a name to suggest from the professionals directory and pre-fill bank & contact fields."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ProfessionalSuggest
              value={professionalName}
              onChange={(name) => {
                setProfessionalName(name);
                setProfessionalId(null);
              }}
              onSelect={applyProfessional}
            />
          </div>
          <Input
            label="Designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          />
          <Input
            label="Contact number"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
          />
          <div className="sm:col-span-2">
            <TextareaField
              label="Name and address of the organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              rows={2}
            />
          </div>
          <Input
            label="Email Id"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex items-end">
            <Checkbox
              label="Save / update this professional in the directory"
              checked={saveToDirectory}
              onChange={(e) => setSaveToDirectory(e.target.checked)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Bank account details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Bank name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
          <Input
            label="Name of the account holder"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
          />
          <Input
            label="Account number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
          <Input
            label="IFSC code"
            value={ifscCode}
            onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
          />
          <div className="sm:col-span-2">
            <TextareaField
              label="Name and address of the bank"
              value={bankAddress}
              onChange={(e) => setBankAddress(e.target.value)}
              rows={2}
            />
          </div>
        </CardBody>
      </Card>

      {needsDuration ? (
        <Card>
          <CardHeader title="Duration of work" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Input
              label="From"
              type="date"
              value={durationFrom}
              onChange={(e) => setDurationFrom(e.target.value)}
            />
            <Input
              label="To"
              type="date"
              value={durationTo}
              onChange={(e) => setDurationTo(e.target.value)}
            />
            <Input
              label="No. of days"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={numberOfDays}
              placeholder="0"
              onChange={(e) =>
                setNumberOfDays(e.target.value.replace(/[^\d]/g, ''))
              }
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Remuneration"
          description="Enter quantity and unit price — amount and grand total calculate automatically."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              Add row
            </Button>
          }
        />
        <CardBody className="overflow-x-auto p-0">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Sl.</th>
                <th className="px-4 py-2.5 font-semibold">Remuneration for</th>
                <th className="px-4 py-2.5 font-semibold">No. of scripts / units</th>
                <th className="px-4 py-2.5 font-semibold">Unit price (₹)</th>
                <th className="px-4 py-2.5 font-semibold">Amount (₹)</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((row, index) => {
                const amount =
                  parseAmount(row.quantity) * parseAmount(row.unitPrice);
                return (
                  <tr
                    key={row.key}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-2 tabular-nums text-slate-500">
                      {index + 1}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full min-w-[10rem] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-1.5 outline-none focus:border-[var(--primary)] focus:bg-white"
                        value={row.remunerationFor}
                        list={`remuneration-suggestions-${billType}`}
                        onChange={(e) =>
                          updateLine(row.key, {
                            remunerationFor: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-24 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-1.5 outline-none focus:border-[var(--primary)] focus:bg-white"
                        value={row.quantity}
                        placeholder="0"
                        onChange={(e) =>
                          updateLine(row.key, {
                            quantity: e.target.value.replace(/[^\d.]/g, ''),
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-28 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-1.5 outline-none focus:border-[var(--primary)] focus:bg-white"
                        value={row.unitPrice}
                        placeholder="0"
                        onChange={(e) =>
                          updateLine(row.key, {
                            unitPrice: e.target.value.replace(/[^\d.]/g, ''),
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 font-semibold tabular-nums">
                      <Money amount={amount} />
                    </td>
                    <td className="px-4 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((r) => r.key !== row.key),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--surface-subtle)] font-semibold">
                <td className="px-4 py-3" colSpan={2}>
                  Grand total
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {totals.grandTotalQuantity}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3">
                  <Money amount={totals.grandTotalAmount} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <datalist id={`remuneration-suggestions-${billType}`}>
            {(meta?.defaultLineSuggestions[billType] || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Office notes" />
        <CardBody>
          <TextareaField
            label="Notes (optional)"
            value={officeNotes}
            onChange={(e) => setOfficeNotes(e.target.value)}
            rows={2}
            hint='Certification: "I certify that the work assigned is completed and this bill is not claimed earlier from any source."'
          />
        </CardBody>
      </Card>

      <FormActions>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving}>
          {initial ? 'Update bill' : 'Create bill'}
        </Button>
      </FormActions>
    </form>
  );
}
