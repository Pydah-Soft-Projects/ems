'use client';

import { HallTicket } from '@/types/exam';
import { DocumentHeader } from '@/components/documents/DocumentHeader';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function sessionLabel(session?: string | null) {
  if (session === 'FN') return 'Forenoon (FN)';
  if (session === 'AN') return 'Afternoon (AN)';
  return '—';
}

function timingLabel(p: HallTicket['papers'][number]) {
  if (p.startTime && p.endTime) {
    return `${p.startTime}–${p.endTime}${
      p.durationMinutes ? ` (${p.durationMinutes} min)` : ''
    }`;
  }
  if (p.startTime) return `from ${p.startTime}`;
  if (p.durationMinutes) return `${p.durationMinutes} min`;
  return '—';
}

/** On-screen A5 preview. Printing uses printA5HallTicket() standalone HTML. */
export function HallTicketDocument({ ticket }: { ticket: HallTicket }) {
  const examType = ticket.examType.replace(/_/g, ' ');

  return (
    <div className="hall-ticket-preview mx-auto bg-white text-black shadow-sm">
      <div className="border border-slate-800 p-4">
        <DocumentHeader
          collegeName={ticket.college || 'Examination Management System'}
          documentTitle="Hall ticket"
          subtitle={`Admit card · ${examType}`}
          rightSlot={
            <p className="text-[10px] font-semibold uppercase text-slate-600">
              App #{ticket.applicationId}
            </p>
          }
        />

        <p className="mt-2 text-center text-sm font-bold text-slate-900">
          {ticket.examName}
        </p>
        <p className="text-center text-[10px] text-slate-500">
          Y{ticket.yearOfStudy} / Sem {ticket.semester} · Batch {ticket.batch}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded border border-dashed border-slate-400 p-2 text-[10px]">
          <div className="space-y-1 border-r border-dashed border-slate-300 pr-2">
            <p className="text-slate-500">Candidate Name</p>
            <p className="font-bold">{ticket.studentName}</p>
            <p className="text-slate-500">PIN / Roll No.</p>
            <p className="font-mono font-bold">{ticket.studentRollNumber}</p>
          </div>
          <div className="space-y-1 border-r border-dashed border-slate-300 px-2">
            <p className="text-slate-500">Course / Branch</p>
            <p className="font-bold">
              {ticket.course} — {ticket.branch}
            </p>
            <p className="text-slate-500">Enrollment type</p>
            <p className="font-bold capitalize">{examType}</p>
          </div>
          <div className="space-y-1 pl-2">
            <p className="text-slate-500">Fee status</p>
            <p className="font-bold capitalize">{ticket.feeStatus}</p>
            <p className="text-slate-500">Released on</p>
            <p className="font-bold">
              {formatDate(ticket.hallTicketsReleasedAt)}
            </p>
          </div>
        </div>

        <table className="mt-3 w-full border-collapse border border-slate-800 text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-800 px-2 py-1.5 text-left">#</th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Subject / Paper
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Exam date
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Session
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Timing
              </th>
            </tr>
          </thead>
          <tbody>
            {ticket.papers.map((p, i) => (
              <tr key={p.subjectId}>
                <td className="border border-slate-800 px-2 py-2 text-center">
                  {i + 1}
                </td>
                <td className="border border-slate-800 px-2 py-2">
                  <p className="font-semibold">{p.code}</p>
                  <p className="text-[10px] text-slate-600">{p.name}</p>
                </td>
                <td className="border border-slate-800 px-2 py-2 whitespace-nowrap">
                  {formatDate(p.examDate)}
                </td>
                <td className="border border-slate-800 px-2 py-2">
                  {sessionLabel(p.session)}
                </td>
                <td className="border border-slate-800 px-2 py-2 whitespace-nowrap">
                  {timingLabel(p)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-[1fr_120px] gap-2 border-t border-slate-300 pt-3 text-[9px]">
          <div className="flex flex-col justify-center gap-1.5 px-1">
            <p>
              <strong>Instructions</strong> Carry this hall ticket and a valid
              photo ID. Only the papers listed above are authorised.
            </p>
          </div>
          <div className="flex flex-col items-center justify-end pb-1 text-center">
            <div className="mb-6 w-full border-b border-slate-800" />
            <p className="text-[9px] font-bold uppercase">
              Controller of Examinations
            </p>
            <p className="text-[8px] text-slate-600">Authorized Signatory</p>
          </div>
        </div>

        <p className="mt-3 text-center text-[9px] italic text-slate-500">
          Note: Please preserve this hall ticket for the examination.
        </p>
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[8px] text-slate-500">
          <span>Examination hall ticket</span>
          <span>POWERED BY EMS</span>
        </div>
      </div>
    </div>
  );
}
