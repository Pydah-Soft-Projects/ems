import { HallTicket } from '@/types/exam';
import { formatIST } from '@/lib/formatIST';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  if (Number.isNaN(d.getTime())) return String(value);
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

export type PrintHallTicketOptions = {
  collegeName?: string;
  collegePlace?: string;
  signatoryName?: string;
  copies?: ('original' | 'duplicate')[];
};

function buildHallTicketBlock(
  ticket: HallTicket,
  options: PrintHallTicketOptions,
  copyLabel?: string,
): string {
  const collegeName =
    options.collegeName || ticket.college || 'Examination Management System';
  const collegePlace = options.collegePlace || '';
  const signer = options.signatoryName || 'Controller of Examinations';
  const generatedOn = formatIST(new Date());
  const examType = ticket.examType.replace(/_/g, ' ');
  const studentInitials = ticket.studentName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const paperRows = ticket.papers
    .map(
      (p, i) => `
          <tr>
            <td class="sno">${i + 1}</td>
            <td class="code"><b>${esc(p.code)}</b></td>
            <td class="subject-name">${esc(p.name)}</td>
            <td class="date">${esc(formatDate(p.examDate))}</td>
            <td class="time">${esc(timingLabel(p))}</td>
            <td class="sess">${esc(sessionLabel(p.session))}</td>
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
          ${copyLabel ? `<div class="copy-tag">${esc(copyLabel)} COPY</div>` : ''}
        </div>
      </div>

      <div class="exam-summary">
        <div>
          <div class="exam-title">${esc(ticket.examName)} (${esc(examType)})</div>
          <div class="exam-sub center-line">Center: ${esc(ticket.center)}</div>
        </div>
        <div class="photo-panel">
          ${ticket.studentPhotoUrl
            ? `<img class="student-photo" src="${esc(ticket.studentPhotoUrl)}" alt="${esc(ticket.studentName)} photo" />`
            : `<div class="student-photo student-initials">${esc(studentInitials || '?')}</div>`}
        </div>
      </div>

      <div class="candidate-meta">
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
          </div>
          <div class="meta-col">
          <span class="lbl">Year / Semester</span>
          <span class="val">Y${esc(ticket.yearOfStudy)} / Sem ${esc(ticket.semester)}</span>
          <span class="lbl">Batch</span>
          <span class="val">${esc(ticket.batch)}</span>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="sno">#</th>
            <th class="code">Subject code</th>
            <th>Subject name</th>
            <th class="date">Exam date</th>
            <th class="time">Timing</th>
            <th class="sess">Session</th>
          </tr>
        </thead>
        <tbody>
          ${paperRows || `<tr><td colspan="6" style="text-align:center">No papers listed</td></tr>`}
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
  ticketOrTickets: HallTicket | HallTicket[],
  options: PrintHallTicketOptions,
) {
  const tickets = Array.isArray(ticketOrTickets) ? ticketOrTickets : [ticketOrTickets];
  const copies = options.copies && options.copies.length > 0 ? options.copies : ['original'];

  const sheets: string[] = [];

  if (copies.length === 1) {
    const copyLabel = copies[0];
    const labelUpper = copyLabel.toUpperCase();
    for (let i = 0; i < tickets.length; i += 2) {
      const blocks: string[] = [];
      blocks.push(buildHallTicketBlock(tickets[i], options, labelUpper));
      if (i + 1 < tickets.length) {
        blocks.push(buildHallTicketBlock(tickets[i + 1], options, labelUpper));
      }
      sheets.push(`<div class="sheet">${blocks.join('')}</div>`);
    }
  } else {
    tickets.forEach((ticket) => {
      const blocks: string[] = [];
      if (copies.includes('original')) {
        blocks.push(buildHallTicketBlock(ticket, options, 'ORIGINAL'));
      }
      if (copies.includes('duplicate')) {
        blocks.push(buildHallTicketBlock(ticket, options, 'DUPLICATE'));
      }
      sheets.push(`<div class="sheet">${blocks.join('')}</div>`);
    });
  }

  const sheetsHtml = sheets.join('');

  const docTitle =
    tickets.length === 1
      ? `Hall Ticket — ${esc(tickets[0].studentRollNumber)}`
      : `Hall Tickets — Bulk (${tickets.length})`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${docTitle}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
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
    color: #0d1b3d;
    font-family: 'Poppins', Arial, Helvetica, sans-serif;
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
    border: 1.5px solid #0d1b3d;
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
    border-bottom: 1.5px solid #0d1b3d;
  }
  .brand { display: flex; align-items: center; gap: 1.8mm; min-width: 28mm; }
  .logo {
    width: 8mm; height: 8mm;
    object-fit: contain;
    display: block;
  }
  .brand-text { font-size: 6pt; color: #64748b; line-height: 1.2; }
  .brand-text b { display: block; color: #0d1b3d; font-size: 7pt; }
  .college { flex: 1; text-align: center; }
  .college h1 {
    font-size: 11pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.02em; line-height: 1.15;
  }
  .college p { font-size: 6.5pt; color: #64748b; text-transform: uppercase; margin-top: 0.4mm; }
  .doc-type { text-align: right; min-width: 28mm; }
  .doc-type b { display: block; font-size: 10pt; text-transform: uppercase; }
  .doc-type span { font-size: 7pt; color: #64748b; font-weight: 700; text-transform: capitalize; }
  .copy-tag {
    display: inline-block;
    margin-top: 1.5mm;
    font-size: 7pt;
    font-weight: 700;
    color: #0d1b3d;
    border: 1px solid #0d1b3d;
    padding: 0.4mm 1.6mm;
    border-radius: 0.6mm;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

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
  .exam-sub.center-line {
    color: #0d1b3d;
    font-weight: 600;
    text-align: left;
  }

  .exam-summary {
    position: relative;
    min-height: 0;
  }
  .exam-summary > div:first-child {
    margin-right: 30mm;
  }
  .candidate-meta {
    display: grid;
    grid-template-columns: 1fr;
    margin-right: 30mm;
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
  .student-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    margin: 0 auto;
  }
  .student-initials {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e2e8f0;
    color: #475569;
    font-size: 10pt;
    font-weight: 700;
  }
  .photo-panel {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    border: 1px solid #94a3b8;
    padding: 0;
    width: 25mm;
    height: 32mm;
    overflow: hidden;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.8mm;
    font-size: 7pt;
  }
  th, td { border: 1px solid #0d1b3d; padding: 1mm 1.6mm; vertical-align: top; }
  th { background: #f1f5f9; text-align: left; font-size: 6.5pt; }
  .sno { width: 8mm; text-align: center; }
  .code { width: 22mm; }
  .subject-name { width: 35mm; }
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
    border-bottom: 1px solid #0d1b3d;
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
    html, body {
      width: 210mm !important;
      height: 297mm !important;
    }
    .sheet {
      width: 210mm !important;
      height: 297mm !important;
      page-break-after: always !important;
      page-break-inside: avoid !important;
    }
    .sheet:last-child {
      page-break-after: avoid !important;
    }
  }
</style>
</head>
<body>
  ${sheetsHtml}
</body>
</html>`;
}

/**
 * Print hall ticket(s) on A4 portrait, A5 landscape format (top/bottom copy splits).
 */
export function printA5HallTicket(
  ticketOrTickets: HallTicket | HallTicket[],
  options: PrintHallTicketOptions = {},
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = buildPrintDocument(ticketOrTickets, options);
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

  // Wait for student photos to load before triggering print
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) {
    setTimeout(triggerPrint, 250);
    return;
  }

  let left = imgs.length;
  const done = () => {
    left -= 1;
    if (left <= 0) setTimeout(triggerPrint, 200);
  };
  imgs.forEach((img) => {
    if (img.complete) done();
    else {
      img.onload = done;
      img.onerror = done;
    }
  });
  // Safety timeout if images hang
  setTimeout(triggerPrint, 2000);
}
