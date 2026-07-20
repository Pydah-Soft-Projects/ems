import { HallTicket } from '@/types/exam';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    // YYYY-MM-DD from DB
    try {
      return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return value;
    }
  }
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

export type PrintHallTicketOptions = {
  collegeName?: string;
  collegePlace?: string;
  signatoryName?: string;
};

function buildHallTicketBlock(
  ticket: HallTicket,
  options: PrintHallTicketOptions,
): string {
  const collegeName =
    options.collegeName || ticket.college || 'Examination Management System';
  const collegePlace = options.collegePlace || '';
  const signer = options.signatoryName || 'Controller of Examinations';
  const generatedOn = new Date().toLocaleString('en-IN');
  const examType = ticket.examType.replace(/_/g, ' ');

  const paperRows = ticket.papers
    .map(
      (p, i) => `
          <tr>
            <td class="sno">${i + 1}</td>
            <td>
              <div><b>${esc(p.code)}</b></div>
              <div class="sub">${esc(p.name)}</div>
            </td>
            <td class="date">${esc(formatDate(p.examDate))}</td>
            <td class="sess">${esc(sessionLabel(p.session))}</td>
            <td class="time">${esc(timingLabel(p))}</td>
          </tr>`,
    )
    .join('');

  return `
  <section class="receipt">
    <div class="frame">
      <div class="header">
        <div class="brand">
          <img class="logo" src="/logo.png" alt="EMS" width="36" height="36" />
          <div class="brand-text"><b>EMS PORTAL</b>Examinations</div>
        </div>
        <div class="college">
          <h1>${esc(collegeName)}</h1>
          ${collegePlace ? `<p>${esc(collegePlace)}</p>` : ''}
        </div>
        <div class="doc-type">
          <b>Hall Ticket</b>
          <span>Admit card · ${esc(examType)}</span>
        </div>
      </div>

      <div class="exam-title">${esc(ticket.examName)}</div>
      <div class="exam-sub">Y${esc(ticket.yearOfStudy)} / Sem ${esc(ticket.semester)} · Batch ${esc(ticket.batch)}</div>

      <div class="meta">
        <div class="meta-col">
          <span class="lbl">Candidate Name</span>
          <span class="val">${esc(ticket.studentName)}</span>
          <span class="lbl">PIN / Roll No.</span>
          <span class="val">${esc(ticket.studentRollNumber)}</span>
        </div>
        <div class="meta-col">
          <span class="lbl">Course / Branch</span>
          <span class="val">${esc(`${ticket.course} — ${ticket.branch}`)}</span>
          <span class="lbl">Enrollment type</span>
          <span class="val">${esc(examType)}</span>
        </div>
        <div class="meta-col">
          <span class="lbl">Fee status</span>
          <span class="val">${esc(ticket.feeStatus)}</span>
          <span class="lbl">Released on</span>
          <span class="val">${esc(formatDate(ticket.hallTicketsReleasedAt))}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="sno">#</th>
            <th>Subject / Paper</th>
            <th class="date">Exam date</th>
            <th class="sess">Session</th>
            <th class="time">Timing</th>
          </tr>
        </thead>
        <tbody>
          ${paperRows || `<tr><td colspan="5" style="text-align:center">No papers listed</td></tr>`}
        </tbody>
      </table>

      <div class="bottom">
        <div class="mid full">
          <div><b>Instructions</b> Carry this hall ticket and a valid photo ID. Only the papers listed above are authorised.</div>
          <div><b>Generated On</b> ${esc(generatedOn)}</div>
        </div>
        <div class="sign">
          <div class="sign-line"></div>
          <div class="name">${esc(signer)}</div>
          <div class="role">Authorized Signatory</div>
        </div>
      </div>

      <div class="note">Note: Please preserve this hall ticket for the examination.</div>
      <div class="foot">
        <span>Examination hall ticket · App #${esc(ticket.applicationId)}</span>
        <span>POWERED BY EMS</span>
      </div>
    </div>
  </section>`;
}

function buildPrintDocument(
  ticket: HallTicket,
  options: PrintHallTicketOptions,
) {
  const body = buildHallTicketBlock(ticket, options);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Hall Ticket — ${esc(ticket.studentRollNumber)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #0f172a;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .sheet {
    width: 210mm;
    height: 297mm;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  /* Top half of A4 — same A5 landscape sizing/padding as fee receipt */
  .receipt {
    width: 210mm;
    height: 148.5mm;
    padding: 6mm 7mm 5mm;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
  }
  .frame {
    width: 100%;
    height: 100%;
    border: 1.5px solid #0f172a;
    padding: 3mm 4mm;
    display: flex;
    flex-direction: column;
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 3mm;
    padding-bottom: 1.8mm;
    border-bottom: 1.5px solid #0f172a;
  }
  .brand { display: flex; align-items: center; gap: 1.8mm; min-width: 28mm; }
  .logo {
    width: 8mm; height: 8mm;
    object-fit: contain;
    border-radius: 1mm;
    background: #0f172a;
    display: block;
  }
  .brand-text { font-size: 6pt; color: #64748b; line-height: 1.2; }
  .brand-text b { display: block; color: #0f172a; font-size: 7pt; }
  .college { flex: 1; text-align: center; }
  .college h1 {
    font-size: 11pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.02em; line-height: 1.15;
  }
  .college p { font-size: 6.5pt; color: #64748b; text-transform: uppercase; margin-top: 0.4mm; }
  .doc-type { text-align: right; min-width: 28mm; }
  .doc-type b { display: block; font-size: 10pt; text-transform: uppercase; }
  .doc-type span { font-size: 7pt; color: #64748b; font-weight: 700; text-transform: capitalize; }

  .exam-title {
    margin-top: 1.5mm;
    text-align: center;
    font-size: 9pt;
    font-weight: 700;
    line-height: 1.2;
  }
  .exam-sub {
    text-align: center;
    font-size: 6.5pt;
    color: #64748b;
    margin-top: 0.4mm;
    margin-bottom: 1.2mm;
  }

  .meta {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border: 1px dashed #94a3b8;
    border-radius: 1.2mm;
    padding: 1.6mm 0;
  }
  .meta-col { padding: 0 2.5mm; }
  .meta-col + .meta-col { border-left: 1px dashed #cbd5e1; }
  .meta-col .lbl { display: block; font-size: 6pt; color: #64748b; }
  .meta-col .val {
    display: block; font-size: 7.5pt; font-weight: 700; margin: 0.3mm 0 1mm;
    word-break: break-word; text-transform: capitalize;
  }
  .meta-col .val:last-child { margin-bottom: 0; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.8mm;
    font-size: 7pt;
  }
  th, td { border: 1px solid #0f172a; padding: 1mm 1.6mm; vertical-align: top; }
  th { background: #f1f5f9; text-align: left; font-size: 6.5pt; }
  .sno { width: 8mm; text-align: center; }
  .date { width: 24mm; white-space: nowrap; }
  .sess { width: 26mm; }
  .time { width: 32mm; white-space: nowrap; }
  .sub { font-size: 6pt; color: #64748b; margin-top: 0.3mm; }

  .bottom {
    margin-top: auto;
    padding-top: 1.5mm;
    border-top: 1px solid #cbd5e1;
    display: grid;
    grid-template-columns: 1fr 34mm;
    gap: 2.5mm;
    align-items: end;
  }
  .mid {
    font-size: 6.5pt;
    line-height: 1.4;
  }
  .mid.full { padding-right: 2mm; }
  .sign { text-align: center; }
  .sign-line {
    border-bottom: 1px solid #0f172a;
    height: 6.5mm;
    margin-bottom: 0.8mm;
  }
  .sign .name {
    font-size: 6.5pt; font-weight: 700; text-transform: uppercase; line-height: 1.15;
  }
  .sign .role { font-size: 5.5pt; color: #64748b; }

  .note {
    margin-top: 1.2mm;
    text-align: center;
    font-size: 6pt;
    font-style: italic;
    color: #64748b;
  }
  .foot {
    margin-top: 0.8mm;
    padding-top: 0.8mm;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 5pt;
    color: #94a3b8;
  }

  @media print {
    html, body, .sheet {
      width: 210mm !important;
      height: 297mm !important;
    }
  }
</style>
</head>
<body>
  <div class="sheet">
    ${body}
  </div>
</body>
</html>`;
}

/**
 * Print hall ticket on the top half of an A4 page (A5 landscape size/padding),
 * matching the fee receipt print layout.
 */
export function printA5HallTicket(
  ticket: HallTicket,
  options: PrintHallTicketOptions = {},
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = buildPrintDocument(ticket, options);
  const iframeId = 'ems-a5-hall-ticket-print-frame';

  let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe) iframe.remove();

  iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    alert('Unable to prepare print document. Please try again.');
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    setTimeout(() => {
      const el = document.getElementById(iframeId);
      if (el) el.remove();
    }, 1000);
  };

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      alert('Print dialog could not be opened. Please try again.');
    } finally {
      cleanup();
    }
  };

  setTimeout(triggerPrint, 250);
}
