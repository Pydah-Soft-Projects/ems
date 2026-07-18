'use client';

import { HallTicket } from '@/types/exam';
import {
  DocumentHeader,
  DocumentMetaGrid,
} from '@/components/documents/DocumentHeader';

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
    <div className="mx-auto max-w-[210mm] rounded-[var(--radius-xl)] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-md)] print:rounded-none print:border print:border-slate-800 print:shadow-none">
      <DocumentHeader
        collegeName={ticket.college || 'Examination Management System'}
        documentTitle="Hall ticket"
        subtitle={`${ticket.examType.replace(/_/g, ' ')} · Y${ticket.yearOfStudy} / S${ticket.semester}`}
        rightSlot={
          <p className="text-[10px] font-semibold uppercase text-slate-600">
            Admit card
          </p>
        }
      />

      <p className="mt-3 text-center text-sm font-semibold text-slate-800">
        {ticket.examName}
      </p>

      <DocumentMetaGrid
        items={[
          { label: 'Candidate', value: ticket.studentName },
          {
            label: 'PIN / Roll',
            value: (
              <span className="tabular-nums">{ticket.studentRollNumber}</span>
            ),
          },
          { label: 'College', value: ticket.college ?? '—' },
          {
            label: 'Programme / Branch',
            value: `${ticket.course} / ${ticket.branch}`,
          },
          { label: 'Batch', value: ticket.batch },
          {
            label: 'Fee status',
            value: <span className="capitalize">{ticket.feeStatus}</span>,
          },
        ]}
      />

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Papers (paid subjects)
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
              <th className="py-2 pr-2" scope="col">
                #
              </th>
              <th className="py-2 pr-2" scope="col">
                Code
              </th>
              <th className="py-2 pr-2" scope="col">
                Subject
              </th>
              <th className="py-2 pr-2" scope="col">
                Exam date
              </th>
              <th className="py-2 pr-2" scope="col">
                Session
              </th>
              <th className="py-2" scope="col">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {ticket.papers.map((p, i) => (
              <tr key={p.subjectId} className="border-b border-slate-200">
                <td className="py-2.5 pr-2 text-slate-500">{i + 1}</td>
                <td className="py-2.5 pr-2 font-medium">{p.code}</td>
                <td className="py-2.5 pr-2">{p.name}</td>
                <td className="py-2.5 pr-2">{formatDate(p.examDate)}</td>
                <td className="py-2.5 pr-2">
                  {p.session === 'FN'
                    ? 'Forenoon'
                    : p.session === 'AN'
                      ? 'Afternoon'
                      : '—'}
                </td>
                <td className="py-2.5">
                  {p.startTime && p.endTime
                    ? `${p.startTime}–${p.endTime}`
                    : p.startTime || '—'}
                  {p.durationMinutes ? ` (${p.durationMinutes} min)` : ''}
                </td>
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
