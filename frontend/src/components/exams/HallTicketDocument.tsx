'use client';

import { HallTicket } from '@/types/exam';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function HallTicketDocument({ ticket }: { ticket: HallTicket }) {
  return (
    <div className="rounded-2xl border-2 border-slate-800 bg-white p-6 shadow-sm print:border print:shadow-none">
      <div className="border-b border-slate-300 pb-4 text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Examination Management System
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Hall Ticket</h1>
        <p className="mt-1 text-sm text-slate-600">{ticket.examName}</p>
        <p className="text-xs capitalize text-slate-500">
          {ticket.examType.replace(/_/g, ' ')} · Y{ticket.yearOfStudy} / S
          {ticket.semester}
        </p>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Candidate</dt>
          <dd className="font-semibold">{ticket.studentName}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">PIN / Roll</dt>
          <dd className="font-semibold tabular-nums">
            {ticket.studentRollNumber}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">College</dt>
          <dd>{ticket.college ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Programme / Branch</dt>
          <dd>
            {ticket.course} / {ticket.branch}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Batch</dt>
          <dd>{ticket.batch}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Fee status</dt>
          <dd className="capitalize">{ticket.feeStatus}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Papers (paid subjects)
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Code</th>
              <th className="py-2 pr-2">Subject</th>
              <th className="py-2">Exam date</th>
            </tr>
          </thead>
          <tbody>
            {ticket.papers.map((p, i) => (
              <tr key={p.subjectId} className="border-b border-slate-200">
                <td className="py-2.5 pr-2 text-slate-500">{i + 1}</td>
                <td className="py-2.5 pr-2 font-medium">{p.code}</td>
                <td className="py-2.5 pr-2">{p.name}</td>
                <td className="py-2.5">{formatDate(p.examDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Carry this hall ticket and a valid ID to the examination centre. Only
        subjects listed above are authorised.
      </p>
    </div>
  );
}
