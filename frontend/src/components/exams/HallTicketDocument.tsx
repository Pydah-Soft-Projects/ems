'use client';

import { HallTicket } from '@/types/exam';
import { DocumentHeader } from '@/components/documents/DocumentHeader';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    return dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
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
  if (p.startTime) return p.startTime;
  if (p.durationMinutes) return `${p.durationMinutes} min`;
  return '—';
}

/** On-screen A5 preview. Printing uses printA5HallTicket() standalone HTML. */
export function HallTicketDocument({ ticket }: { ticket: HallTicket }) {
  const examType = ticket.examType.replace(/_/g, ' ');
  const studentInitials = ticket.studentName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

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

        <div className="relative mt-2">
          <div className="pr-[7rem]">
            <p className="text-center text-sm font-bold text-slate-900">
              {ticket.examName} ({examType})
            </p>
            <p className="text-left text-[10px] font-semibold text-slate-800">
              Center: {ticket.center}
            </p>
          </div>
          <div className="absolute right-0 top-0 flex h-[8rem] w-[6.25rem] items-start justify-center overflow-hidden rounded border border-slate-400 p-0">
            {ticket.studentPhotoUrl ? (
              <img
                src={ticket.studentPhotoUrl}
                alt={`${ticket.studentName} photo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-200 text-base font-bold text-slate-600">
                {studentInitials || '?'}
              </div>
            )}
          </div>
        </div>

        <div className="mr-[7rem] mt-3 text-[10px]">
          <div className="grid grid-cols-3 gap-2 rounded border border-dashed border-slate-400 p-2">
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
            </div>
            <div className="space-y-1 pl-2">
              <p className="text-slate-500">Year / Semester</p>
              <p className="font-bold">Y{ticket.yearOfStudy} / Sem {ticket.semester}</p>
              <p className="text-slate-500">Batch</p>
              <p className="font-bold">{ticket.batch}</p>
            </div>
          </div>
        </div>

        <table className="mt-3 w-full border-collapse border border-slate-800 text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-800 px-2 py-1.5 text-left">#</th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Subject code
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Subject name
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Exam date
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Timing
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Session
              </th>
            </tr>
          </thead>
          <tbody>
            {ticket.papers.map((p, i) => (
              <tr key={p.subjectId}>
                <td className="border border-slate-800 px-2 py-2 text-center">
                  {i + 1}
                </td>
                <td className="border border-slate-800 px-2 py-2 font-semibold">
                  {p.code}
                </td>
                <td className="border border-slate-800 px-2 py-2 text-[10px] text-slate-600">
                  {p.name}
                </td>
                <td className="border border-slate-800 px-2 py-2 whitespace-nowrap">
                  {formatDate(p.examDate)}
                </td>
                <td className="border border-slate-800 px-2 py-2 whitespace-nowrap">
                  {timingLabel(p)}
                </td>
                <td className="border border-slate-800 px-2 py-2">
                  {sessionLabel(p.session)}
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
