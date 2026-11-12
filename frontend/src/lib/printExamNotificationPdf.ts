import jsPDF from 'jspdf';
import { Exam, ExamSubject } from '@/types/exam';
import { Regulation } from '@/types/regulation';

export interface TimetableNotificationPdfOptions {
  exam: Exam;
  regulations?: Regulation[];
  collegeName?: string;
  isRevised?: boolean;
}

export interface FeeNotificationPdfOptions {
  exam: Exam;
  regulations?: Regulation[];
  collegeName?: string;
}

function toRoman(num: number | string | undefined | null): string {
  const n = Number(num);
  switch (n) {
    case 1:
      return 'I';
    case 2:
      return 'II';
    case 3:
      return 'III';
    case 4:
      return 'IV';
    case 5:
      return 'V';
    case 6:
      return 'VI';
    default:
      return String(num || '');
  }
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      return `${d}-${m}-${y}`;
    }
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return String(value);
  }
}

function getDayOfWeek(dateStr: string): string {
  try {
    const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
      return dt.toLocaleDateString('en-IN', { weekday: 'long' });
    }
    const dt = new Date(dateStr);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-IN', { weekday: 'long' });
    }
  } catch {
    // fallback
  }
  return '';
}

function normalizeAlpha(str: string | null | undefined): string {
  return (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Robust branch disambiguation matching.
 * Guarantees CSE Core subjects do NOT bleed into CSE(AI) or CSE(AI&ML),
 * and matches branches accurately whether using abbreviations or full names.
 */
function matchesBranch(subjectBranch: string | null | undefined, targetBranch: string, subjectCode?: string): boolean {
  const s = (subjectBranch || '').trim();
  const t = targetBranch.trim();

  // If subject has no branch specified or marked COMMON/ALL, it belongs to all branches in this exam
  if (!s || s.toUpperCase() === 'ALL' || s.toUpperCase() === 'COMMON') {
    return true;
  }

  // Exact match
  if (s.toLowerCase() === t.toLowerCase()) return true;

  const sNorm = normalizeAlpha(s.replace(/&/g, 'AND'));
  const tNorm = normalizeAlpha(t.replace(/&/g, 'AND'));
  if (sNorm === tNorm) return true;

  // Branch Category Helpers
  const isCSECore = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return (
      n === 'CSE' ||
      n === 'COMPUTERSCIENCE' ||
      n === 'COMPUTERSCIENCEANDENGINEERING' ||
      n === 'COMPUTERSCIENCEENGINEERING' ||
      n === '05CSE' ||
      n === 'CSE05'
    );
  };

  const isCSEAI = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return n === 'CSEAI' || n === 'AI' || n === 'ARTIFICIALINTELLIGENCE' || n === '43CSD';
  };

  const isCSEML = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return (
      n === 'CSEAIML' ||
      n === 'CSEAIANDML' ||
      n === 'AIML' ||
      n === 'CSM' ||
      n === '42CSM' ||
      n === 'ARTIFICIALINTELLIGENCEANDMACHINELEARNING'
    );
  };

  const isECE = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return (
      n === 'ECE' ||
      n === 'ELECTRONICS' ||
      n === 'ELECTRONICSANDCOMMUNICATION' ||
      n === 'ELECTRONICSCOMMUNICATION' ||
      n === 'ELECTRONICSANDCOMMUNICATIONENGINEERING' ||
      n === 'ELECTRONICSCOMMUNICATIONENGINEERING' ||
      n === '04ECE'
    );
  };

  const isME = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return (
      n === 'ME' ||
      n === 'MEC' ||
      n === 'MECHANICAL' ||
      n === 'MECHANICALENGINEERING' ||
      n === '03ME'
    );
  };

  const isCE = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return n === 'CE' || n === 'CIVIL' || n === 'CIVILENGINEERING' || n === '01CE';
  };

  const isEEE = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return (
      n === 'EEE' ||
      n === 'ELECTRICAL' ||
      n === 'ELECTRICALANDELECTRONICSENGINEERING' ||
      n === 'ELECTRICALELECTRONICSENGINEERING' ||
      n === '02EEE'
    );
  };

  const isIT = (v: string) => {
    const n = normalizeAlpha(v.replace(/&/g, 'AND'));
    return n === 'IT' || n === 'INFORMATIONTECHNOLOGY' || n === '12IT';
  };

  if (isCSECore(s)) return isCSECore(t);
  if (isCSEAI(s)) return isCSEAI(t);
  if (isCSEML(s)) return isCSEML(t);
  if (isECE(s)) return isECE(t);
  if (isME(s)) return isME(t);
  if (isCE(s)) return isCE(t);
  if (isEEE(s)) return isEEE(t);
  if (isIT(s)) return isIT(t);

  return false;
}

function formatBranchTitle(branch: string): string {
  const b = branch.trim();
  const norm = normalizeAlpha(b);

  if (norm === 'CSE' || norm === 'COMPUTERSCIENCEANDENGINEERING' || norm === '05CSE') {
    return 'COMPUTER SCIENCE AND\nENGINEERING\n(05-CSE)';
  }
  if (norm === 'CSEAI' || norm === 'AI') {
    return 'CSE (AI)\n(43-CSD)';
  }
  if (norm === 'CSEAIML' || norm === 'AIML' || norm === 'CSM' || norm === '42CSM') {
    return 'CSE (AI & ML)\n(42-CSM)';
  }
  if (norm === 'ECE' || norm === 'ELECTRONICSANDCOMMUNICATIONENGINEERING' || norm === '04ECE') {
    return 'ELECTRONICS AND\nCOMMUNICATION\nENGINEERING\n(04-ECE)';
  }
  if (norm === 'ME' || norm === 'MEC' || norm === 'MECHANICALENGINEERING' || norm === '03ME') {
    return 'MECHANICAL\nENGINEERING\n(03-ME)';
  }
  if (norm === 'CE' || norm === 'CIVIL' || norm === 'CIVILENGINEERING' || norm === '01CE') {
    return 'CIVIL ENGINEERING\n(01-CE)';
  }
  if (norm === 'EEE' || norm === 'ELECTRICALANDELECTRONICSENGINEERING' || norm === '02EEE') {
    return 'ELECTRICAL AND\nELECTRONICS\nENGINEERING\n(02-EEE)';
  }
  if (norm === 'IT' || norm === 'INFORMATIONTECHNOLOGY' || norm === '12IT') {
    return 'INFORMATION TECHNOLOGY\n(12-IT)';
  }

  // Preserve existing branch name with clean line wrap
  const words = b.toUpperCase().split(/\s+/);
  if (words.length > 2) {
    const mid = Math.ceil(words.length / 2);
    return `${words.slice(0, mid).join(' ')}\n${words.slice(mid).join(' ')}`;
  }
  return b.toUpperCase();
}

/**
 * Downloads a high-quality Timetable Notification PDF matching the university/autonomous
 * college matrix format (clean stroke borders, Day & Date headers, Branch rows, Subject Code & Name).
 */
export function downloadTimetableNotificationPdf(options: TimetableNotificationPdfOptions) {
  const { exam, regulations = [], isRevised } = options;
  const collegeName = (
    options.collegeName ||
    exam.college ||
    exam.scopes?.[0]?.college ||
    'PYDAH COLLEGE OF ENGINEERING'
  ).toUpperCase();

  // Find regulation code
  const regCode =
    regulations.find((r) => r.id === exam.regulationId)?.code ||
    (exam.regulationId ? `R${exam.regulationId}` : 'R23');

  // Page setup: Landscape A4
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const xStart = margin;
  const xEnd = pageWidth - margin;
  const contentWidth = xEnd - xStart;

  let y = margin;

  // Collect distinct branches in scoped order
  const branchMap = new Map<string, string>();
  if (exam.scopes && exam.scopes.length > 0) {
    exam.scopes.forEach((s) => {
      if (s.branch?.trim()) {
        const raw = s.branch.trim();
        if (!branchMap.has(raw.toLowerCase())) {
          branchMap.set(raw.toLowerCase(), raw);
        }
      }
    });
  }
  if (exam.examSubjects && exam.examSubjects.length > 0) {
    exam.examSubjects.forEach((s) => {
      if (s.branch?.trim()) {
        const raw = s.branch.trim();
        if (!branchMap.has(raw.toLowerCase())) {
          branchMap.set(raw.toLowerCase(), raw);
        }
      }
    });
  }
  if (exam.branch?.trim()) {
    exam.branch
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)
      .forEach((raw) => {
        if (!branchMap.has(raw.toLowerCase())) {
          branchMap.set(raw.toLowerCase(), raw);
        }
      });
  }

  const branches =
    branchMap.size > 0
      ? Array.from(branchMap.values())
      : [exam.branch || exam.course || 'GENERAL'];

  // Collect distinct scheduled dates
  const distinctDateStrings = Array.from(
    new Set(
      (exam.examSubjects || [])
        .map((s) => (s.examDate ? String(s.examDate).slice(0, 10) : null))
        .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ).sort();

  // Detect session/time
  let timeStr = '10.00 AM TO 12.00 PM';
  const firstWithTime = (exam.examSubjects || []).find((s) => !!s.startTime && !!s.endTime);
  if (firstWithTime?.startTime && firstWithTime?.endTime) {
    timeStr = `${firstWithTime.startTime} TO ${firstWithTime.endTime}`;
  } else {
    const firstWithSession = (exam.examSubjects || []).find((s) => !!s.session);
    if (firstWithSession?.session === 'AN') {
      timeStr = '02.00 PM TO 05.00 PM';
    } else if (exam.examCategory === 'INTERNAL') {
      timeStr = '10.00 AM TO 12.00 PM';
    } else {
      timeStr = '10.00 AM TO 01.00 PM';
    }
  }

  const courses = exam.scopes?.length
    ? [...new Set(exam.scopes.map((s) => s.course).filter(Boolean))]
    : [exam.course].filter(Boolean);
  const courseStr = (courses.length > 0 ? courses.join(', ') : 'B.TECH').toUpperCase();

  const years = exam.scopes?.length
    ? [...new Set(exam.scopes.map((s) => s.yearOfStudy).filter(Boolean))].sort((a, b) => a - b)
    : [exam.yearOfStudy].filter(Boolean);
  const yearStr = years.length > 0 ? years.map(toRoman).join(', ') : toRoman(1);

  const sems = exam.scopes?.length
    ? [...new Set(exam.scopes.map((s) => s.semester).filter(Boolean))].sort((a, b) => a - b)
    : [exam.semester].filter(Boolean);
  const semStr = sems.length > 0 ? sems.map(toRoman).join(', ') : toRoman(1);

  // Header strings
  const topScopeTag = `${yearStr} ${courseStr} ${semStr} SEMESTER (${regCode})`;

  const rawExamName = exam.name.toUpperCase().trim();
  const hasAcademicPrefix =
    rawExamName.includes('SEMESTER') ||
    rawExamName.includes('B.TECH') ||
    rawExamName.includes('M.TECH') ||
    rawExamName.includes('MCA') ||
    rawExamName.includes('MBA');

  let examTitleUpper = '';
  if (hasAcademicPrefix) {
    if (!rawExamName.includes(regCode)) {
      examTitleUpper = `${rawExamName} (${regCode} REGULATION)`;
    } else {
      examTitleUpper = rawExamName;
    }
  } else {
    examTitleUpper = `${yearStr} ${courseStr} ${semStr} SEMESTER (${regCode} REGULATION) - ${rawExamName}`;
  }

  const tableTitle = isRevised ? 'R E V I S E D   T I M E   T A B L E' : 'T I M E   T A B L E';

  // Draw Document Header
  const drawDocumentHeader = () => {
    // Top Right Scope Identifier
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(topScopeTag, xEnd, y + 8, { align: 'right' });

    // Official Emblem / Seal (Top Left)
    const sealX = xStart + 24;
    const sealY = y + 16;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1.2);
    doc.circle(sealX, sealY, 18, 'S');
    doc.setLineWidth(0.6);
    doc.circle(sealX, sealY, 15, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text('EXAM', sealX, sealY - 1, { align: 'center' });
    doc.text('CELL', sealX, sealY + 6, { align: 'center' });

    // College Name (Centered, prominent)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.setTextColor(15, 23, 42);
    doc.text(collegeName, pageWidth / 2, y + 8, { align: 'center' });

    // Subtitle Line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('EXAMINATION CELL / EXAMINATION CENTER', pageWidth / 2, y + 21, {
      align: 'center',
    });

    // Exam Full Title Line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(examTitleUpper, pageWidth / 2, y + 34, { align: 'center' });

    // TIME TABLE
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(0, 0, 0);
    doc.text(tableTitle, pageWidth / 2, y + 49, { align: 'center' });

    // Session / Timing (Right aligned)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`T I M E : ${timeStr}`, xEnd, y + 62, { align: 'right' });

    y += 68;
  };

  drawDocumentHeader();

  // Helper: Find subjects scheduled for branch B on date D (deduplicating identical subjects in same cell)
  const getSubjectsForCell = (branchName: string, dateStr: string): ExamSubject[] => {
    const matched = (exam.examSubjects || []).filter((s) => {
      if (!s.examDate) return false;
      const sDate = String(s.examDate).slice(0, 10);
      if (sDate !== dateStr) return false;

      return matchesBranch(s.branch, branchName, s.subject?.code);
    });

    const seenKeys = new Set<string>();
    return matched.filter((s) => {
      const key = `${s.subject?.code || s.subjectId}|${s.subject?.name || ''}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  };

  // Table dimensions
  const numDates = distinctDateStrings.length;
  const branchColWidth = Math.min(145, Math.max(120, Math.round(contentWidth * 0.17)));
  const dateColWidth = numDates > 0 ? (contentWidth - branchColWidth) / numDates : contentWidth - branchColWidth;
  const datesStartX = xStart + branchColWidth;
  const datesSpanW = contentWidth - branchColWidth;

  const headerRow1H = 18;
  const headerRow2H = 26;
  const totalHeaderH = headerRow1H + headerRow2H;

  // Draw Grid Header function (used on page 1 and continuation pages)
  const drawGridHeader = (startY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);

    // Col 0: "BRANCH" (Stroke only)
    doc.rect(xStart, startY, branchColWidth, totalHeaderH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('BRANCH', xStart + branchColWidth / 2, startY + totalHeaderH / 2 + 3.5, {
      align: 'center',
    });

    if (numDates === 0) {
      doc.rect(datesStartX, startY, datesSpanW, totalHeaderH, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('SCHEDULED SUBJECTS / TIMETABLE', datesStartX + datesSpanW / 2, startY + totalHeaderH / 2 + 3, {
        align: 'center',
      });
      return;
    }

    // Row 1: "DAY AND DATE" spanning all date columns (Stroke only)
    doc.rect(datesStartX, startY, datesSpanW, headerRow1H, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('DAY AND DATE', datesStartX + datesSpanW / 2, startY + 12.5, {
      align: 'center',
    });

    // Row 2: Date and Day in each column (Stroke only)
    distinctDateStrings.forEach((dateStr, dIdx) => {
      const dx = datesStartX + dIdx * dateColWidth;
      doc.rect(dx, startY + headerRow1H, dateColWidth, headerRow2H, 'S');

      const [yStr, mStr, dStr] = dateStr.slice(0, 10).split('-');
      const formattedDate = `${dStr}-${mStr}-${yStr}`;
      const dayName = getDayOfWeek(dateStr);

      // Date in Line 1
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(formattedDate, dx + dateColWidth / 2, startY + headerRow1H + 11, {
        align: 'center',
      });

      // Day in Line 2
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(`(${dayName})`, dx + dateColWidth / 2, startY + headerRow1H + 21, {
        align: 'center',
      });
    });
  };

  // Draw table
  if (numDates === 0) {
    // Clean fallback when no dates are scheduled yet
    drawGridHeader(y);
    y += totalHeaderH;

    const subjects = exam.examSubjects || [];
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);

    if (subjects.length === 0) {
      doc.rect(xStart, y, contentWidth, 36, 'S');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('No subjects scheduled yet for this notification.', pageWidth / 2, y + 22, {
        align: 'center',
      });
      y += 36;
    } else {
      branches.forEach((branchName) => {
        const branchDisplay = formatBranchTitle(branchName);
        const branchLines = branchDisplay.split('\n');
        const branchSubjects = subjects.filter((s) => matchesBranch(s.branch, branchName, s.subject?.code));

        const rowH = Math.max(40, branchSubjects.length * 16 + 12);
        if (y + rowH > pageHeight - 40) {
          doc.addPage();
          y = margin;
          drawGridHeader(y);
          y += totalHeaderH;
        }

        doc.rect(xStart, y, branchColWidth, rowH, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);

        const textH = branchLines.length * 10;
        const startTextY = y + (rowH - textH) / 2 + 7.5;
        branchLines.forEach((line, lIdx) => {
          doc.text(line, xStart + branchColWidth / 2, startTextY + lIdx * 10, { align: 'center' });
        });

        doc.rect(datesStartX, y, datesSpanW, rowH, 'S');
        let subjY = y + 14;
        branchSubjects.forEach((s) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(`${s.subject?.name || ''} (${s.subject?.code || ''})`, datesStartX + 12, subjY);
          subjY += 15;
        });

        y += rowH;
      });
    }
  } else {
    // MATRIX TIMETABLE
    drawGridHeader(y);
    y += totalHeaderH;

    // Render Each Branch Row
    branches.forEach((branchName) => {
      const branchDisplay = formatBranchTitle(branchName);
      const branchLines = branchDisplay.split('\n');

      // Pre-calculate heights required for each cell
      const cellSubjectsList: ExamSubject[][] = [];
      let maxRequiredHeight = branchLines.length * 11 + 16;

      distinctDateStrings.forEach((dateStr) => {
        const matchingSubjects = getSubjectsForCell(branchName, dateStr);
        cellSubjectsList.push(matchingSubjects);

        let cellH = 12;
        matchingSubjects.forEach((s) => {
          const sName = s.subject?.name || '';
          doc.setFontSize(7.5);
          const wrapped = doc.splitTextToSize(sName, dateColWidth - 12);
          cellH += wrapped.length * 9 + 14; // name lines + code line + gap
        });

        if (cellH > maxRequiredHeight) {
          maxRequiredHeight = cellH;
        }
      });

      const rowH = Math.max(48, Math.round(maxRequiredHeight));

      // Page break check: if row overflows, start a new page with proper header
      if (y + rowH > pageHeight - 45) {
        doc.addPage();
        y = margin;

        // Running continuation header on subsequent page
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(collegeName, pageWidth / 2, y + 8, { align: 'center' });
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        doc.text(`${examTitleUpper} — TIME TABLE (Contd.)`, pageWidth / 2, y + 20, { align: 'center' });
        y += 28;

        drawGridHeader(y);
        y += totalHeaderH;
      }

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);

      // Col 0: Branch cell (Stroke only)
      doc.rect(xStart, y, branchColWidth, rowH, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);

      const branchTextTotalH = branchLines.length * 10;
      const branchStartY = y + (rowH - branchTextTotalH) / 2 + 7.5;
      branchLines.forEach((line, lIdx) => {
        doc.text(line, xStart + branchColWidth / 2, branchStartY + lIdx * 10, {
          align: 'center',
        });
      });

      // Date cells
      distinctDateStrings.forEach((_dateStr, dIdx) => {
        const cellX = datesStartX + dIdx * dateColWidth;
        doc.rect(cellX, y, dateColWidth, rowH, 'S');

        const subjectsInCell = cellSubjectsList[dIdx];
        if (subjectsInCell.length === 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.text('—', cellX + dateColWidth / 2, y + rowH / 2 + 3, { align: 'center' });
        } else {
          // Calculate total subject content height for vertical centering
          let totalSubjectsH = 0;
          const subjectBlocks = subjectsInCell.map((subj) => {
            const name = subj.subject?.name || '';
            const code = subj.subject?.code ? `(${subj.subject.code})` : '';
            doc.setFontSize(7.5);
            const wrappedName = doc.splitTextToSize(name, dateColWidth - 14);
            const blockH = wrappedName.length * 9 + (code ? 10 : 0);
            totalSubjectsH += blockH + 6;
            return { wrappedName, code, blockH };
          });

          let currY = Math.max(y + 8, y + (rowH - totalSubjectsH) / 2 + 8);

          subjectBlocks.forEach(({ wrappedName, code }) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(0, 0, 0);

            wrappedName.forEach((line: string) => {
              if (currY < y + rowH - 4) {
                doc.text(line, cellX + dateColWidth / 2, currY, { align: 'center' });
                currY += 9;
              }
            });

            if (code && currY < y + rowH - 2) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.text(code, cellX + dateColWidth / 2, currY, { align: 'center' });
              currY += 12;
            }
          });
        }
      });

      y += rowH;
    });
  }

  // Footer Notes & Signatures
  if (y + 75 > pageHeight - 20) {
    doc.addPage();
    y = margin;
  }

  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('NOTE:', xStart, y);
  y += 11;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    'i)   ANY OMISSIONS OR CLASHES IN THIS TIME TABLE MAY PLEASE BE INFORMED TO THE CONTROLLER OF EXAMINATIONS IMMEDIATELY.',
    xStart + 10,
    y,
  );
  y += 11;
  doc.text(
    'ii)  EVEN IF GOVERNMENT DECLARES HOLIDAY ON ANY OF THE ABOVE DATES, THE EXAMINATIONS SHALL BE CONDUCTED AS SCHEDULED.',
    xStart + 10,
    y,
  );
  y += 11;
  doc.text(
    'iii) THE PRINCIPALS / HODs ARE REQUESTED TO INFORM THE STUDENTS THAT ANY MOBILE PHONES AND PROGRAMMABLE CALCULATORS ARE NOT PERMITTED.',
    xStart + 10,
    y,
  );
  y += 24;

  // Signatures on right
  const dateFormatted = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Date : ${dateFormatted}`, xStart, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CONTROLLER OF EXAMINATIONS', xEnd - 150, y + 8, { align: 'center' });
  doc.text('PRINCIPAL', xEnd - 20, y + 8, { align: 'right' });

  // Document metadata
  doc.setProperties({
    title: `${exam.name} - Timetable Notification`,
    author: collegeName,
  });

  // Save / trigger download
  const safeFilename = `${exam.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Timetable.pdf`;
  doc.save(safeFilename);
}

/**
 * Downloads the official Examination Fee Notification circular PDF
 * with registration schedule, late fee slabs, package/supply fee tables, and instructions.
 */
export function downloadFeeNotificationPdf(options: FeeNotificationPdfOptions) {
  const { exam, regulations = [] } = options;
  const collegeName = (
    options.collegeName ||
    exam.college ||
    exam.scopes?.[0]?.college ||
    'PYDAH COLLEGE OF ENGINEERING'
  ).toUpperCase();

  const regCode =
    regulations.find((r) => r.id === exam.regulationId)?.code ||
    (exam.regulationId ? `R${exam.regulationId}` : 'R23');

  // Portrait A4
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const xStart = margin;
  const xEnd = pageWidth - margin;
  const contentWidth = xEnd - xStart;

  let y = margin;

  const yearRoman = toRoman(exam.yearOfStudy || 1);
  const semRoman = toRoman(exam.semester || 1);
  const courseUpper = (exam.course || 'B.TECH').toUpperCase();

  // Top Left Circular Emblem / Seal
  const sealX = xStart + 22;
  const sealY = y + 16;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.2);
  doc.circle(sealX, sealY, 18, 'S');
  doc.setLineWidth(0.6);
  doc.circle(sealX, sealY, 15, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text('EXAM', sealX, sealY - 1, { align: 'center' });
  doc.text('CELL', sealX, sealY + 6, { align: 'center' });

  // Top Right Scope Tag
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${yearRoman} ${courseUpper} ${semRoman} SEM (${regCode})`, xEnd, y + 8, {
    align: 'right',
  });

  // College Name & Affiliation Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(15, 23, 42);
  doc.text(collegeName, pageWidth / 2, y + 8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    '(AUTONOMOUS INSTITUTION - AFFILIATED TO JNTUK, ACCREDITED BY NAAC)',
    pageWidth / 2,
    y + 21,
    { align: 'center' },
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('EXAMINATION CELL / NOTIFICATION CIRCULAR', pageWidth / 2, y + 33, {
    align: 'center',
  });

  y += 40;

  // Double horizontal divider
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.2);
  doc.line(xStart, y, xEnd, y);
  doc.setLineWidth(0.4);
  doc.line(xStart, y + 2.5, xEnd, y + 2.5);

  y += 14;

  // Metadata Strip
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const refNo = `Ref: EMS/EXAM/FEE/${exam.id}/${new Date().getFullYear()}`;
  doc.text(refNo, xStart, y);

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  doc.text(`Date: ${todayFormatted}`, xEnd, y, { align: 'right' });

  y += 16;

  // Notification Banner
  const bannerH = 26;
  doc.setFillColor(241, 245, 249);
  doc.rect(xStart, y, contentWidth, bannerH, 'FD');
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1);
  doc.rect(xStart, y, contentWidth, bannerH, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('EXAMINATION FEE NOTIFICATION', pageWidth / 2, y + 17, { align: 'center' });

  y += bannerH + 12;

  // Exam Full Title
  const typesText = (exam.allowedTypes || [exam.type])
    .map((t) => t.toUpperCase().replace(/_/g, ' '))
    .join(' & ');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const titleLine = `${yearRoman} ${courseUpper} ${semRoman} SEMESTER (${regCode} REGULATION) ${typesText} EXAMINATIONS`;
  doc.text(titleLine, pageWidth / 2, y, { align: 'center' });

  y += 13;
  if (exam.name && exam.name.toUpperCase() !== titleLine.toUpperCase()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`[ ${exam.name} ]`, pageWidth / 2, y, { align: 'center' });
    y += 14;
  }

  // Circular Opening Statement
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const introText =
    `All students appearing for the above mentioned ${courseUpper} examination are hereby informed that the ` +
    `examination registration schedule and fee particulars are notified below. Students must pay the prescribed fee ` +
    `online/at the fee collection counter within the stipulated timeline:`;
  const wrappedIntro = doc.splitTextToSize(introText, contentWidth);
  wrappedIntro.forEach((line: string) => {
    doc.text(line, xStart, y);
    y += 11;
  });
  y += 6;

  // TABLE 1: Registration Schedule & Late Fee Slabs
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. FEE PAYMENT SCHEDULE & IMPORTANT CUTOFF DATES', xStart, y);
  y += 6;

  const schedCol1W = 335;
  const schedCol2W = contentWidth - schedCol1W;
  const schedRowH = 20;

  // Header
  doc.setFillColor(248, 250, 252);
  doc.rect(xStart, y, contentWidth, schedRowH, 'FD');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.rect(xStart, y, contentWidth, schedRowH, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('FEE REGISTRATION STAGE / SLAB', xStart + 10, y + 13);
  doc.text('LAST DATE / PERIOD', xStart + schedCol1W + schedCol2W / 2, y + 13, {
    align: 'center',
  });
  y += schedRowH;

  // Slabs
  const scheduleRows: Array<{ label: string; dateText: string; isBold?: boolean }> = [];

  // Without Late Fee
  scheduleRows.push({
    label: 'Without Late Fee (Regular Payment Period)',
    dateText:
      exam.applicationStartDate && exam.applicationEndDate
        ? `${fmtDate(exam.applicationStartDate)} to ${fmtDate(exam.applicationEndDate)}`
        : exam.applicationEndDate
          ? `Up to ${fmtDate(exam.applicationEndDate)}`
          : 'As announced',
    isBold: true,
  });

  // Late Fee Slabs
  if (exam.lateFeeSlabs && exam.lateFeeSlabs.length > 0) {
    exam.lateFeeSlabs.forEach((slab, sIdx) => {
      const amountStr = `Rs. ${Number(slab.amount).toLocaleString('en-IN')}/-`;
      const dateRange =
        slab.fromDate && slab.toDate
          ? `${fmtDate(slab.fromDate)} to ${fmtDate(slab.toDate)}`
          : slab.toDate
            ? `Up to ${fmtDate(slab.toDate)}`
            : slab.fromDate
              ? `From ${fmtDate(slab.fromDate)} onwards`
              : 'As scheduled';

      scheduleRows.push({
        label: `With Late Fee of ${amountStr} (Slab ${sIdx + 1})`,
        dateText: dateRange,
      });
    });
  } else if (exam.lateFeeStartDate) {
    scheduleRows.push({
      label: 'With Standard Late Fee',
      dateText: `From ${fmtDate(exam.lateFeeStartDate)} onwards`,
    });
  }

  // Exam Commencement
  if (exam.examinationStartDate) {
    scheduleRows.push({
      label: 'Commencement of Examinations (Tentative)',
      dateText: exam.examinationEndDate
        ? `${fmtDate(exam.examinationStartDate)} to ${fmtDate(exam.examinationEndDate)}`
        : fmtDate(exam.examinationStartDate),
      isBold: true,
    });
  }

  scheduleRows.forEach((r, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(xStart, y, contentWidth, schedRowH, 'FD');
    }
    doc.rect(xStart, y, contentWidth, schedRowH, 'S');

    doc.setFont('helvetica', r.isBold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(r.label, xStart + 10, y + 13);
    doc.text(r.dateText, xStart + schedCol1W + schedCol2W / 2, y + 13, {
      align: 'center',
    });

    y += schedRowH;
  });

  y += 12;

  // TABLE 2: Examination Fee Structure
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. EXAMINATION FEE PARTICULARS', xStart, y);
  y += 6;

  const feeCol1W = 355;
  const feeCol2W = contentWidth - feeCol1W;
  const feeRowH = 20;

  // Header
  doc.setFillColor(248, 250, 252);
  doc.rect(xStart, y, contentWidth, feeRowH, 'FD');
  doc.rect(xStart, y, contentWidth, feeRowH, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('PARTICULARS / SUBJECT ELIGIBILITY', xStart + 10, y + 13);
  doc.text('AMOUNT (Rs.)', xStart + feeCol1W + feeCol2W - 14, y + 13, { align: 'right' });
  y += feeRowH;

  const feeRows: Array<{ label: string; amount: string; isBold?: boolean }> = [];

  // Whole Exam (Package) Fee
  if (exam.packageFee !== null && exam.packageFee !== undefined) {
    feeRows.push({
      label: 'FOR WHOLE EXAMINATION (ALL SUBJECTS / REGULAR)',
      amount: `Rs. ${Number(exam.packageFee).toLocaleString('en-IN')}/-`,
      isBold: true,
    });
  } else {
    feeRows.push({
      label: 'FOR WHOLE EXAMINATION (ALL SUBJECTS / REGULAR)',
      amount: 'Rs. 1,500/-',
      isBold: true,
    });
  }

  // Supplementary Fees
  if (exam.supplyFeeByCount && exam.supplyFeeByCount.length > 0) {
    const counts = exam.supplyFeeByCount;
    if (counts[0]) {
      feeRows.push({
        label: 'FOR ONE SUBJECT (THEORY / PRACTICAL)',
        amount: `Rs. ${Number(counts[0]).toLocaleString('en-IN')}/-`,
      });
    }
    if (counts[1]) {
      feeRows.push({
        label: 'FOR TWO SUBJECTS (THEORY / PRACTICAL)',
        amount: `Rs. ${Number(counts[1]).toLocaleString('en-IN')}/-`,
      });
    }
    if (counts[2]) {
      feeRows.push({
        label: 'FOR THREE SUBJECTS (THEORY / PRACTICAL)',
        amount: `Rs. ${Number(counts[2]).toLocaleString('en-IN')}/-`,
      });
    }
    if (counts[3]) {
      feeRows.push({
        label: 'FOR FOUR AND ABOVE SUBJECTS',
        amount: `Rs. ${Number(counts[3]).toLocaleString('en-IN')}/-`,
        isBold: true,
      });
    }
  } else {
    feeRows.push({
      label: 'FOR ONE SUBJECT (THEORY / PRACTICAL)',
      amount: 'Rs. 500/-',
    });
    feeRows.push({
      label: 'FOR TWO SUBJECTS (THEORY / PRACTICAL)',
      amount: 'Rs. 800/-',
    });
    feeRows.push({
      label: 'FOR THREE SUBJECTS (THEORY / PRACTICAL)',
      amount: 'Rs. 1,000/-',
    });
    feeRows.push({
      label: 'FOR FOUR AND ABOVE SUBJECTS',
      amount: 'Rs. 1,500/-',
      isBold: true,
    });
  }

  // Duplicate Hall Ticket
  if (exam.duplicateHallTicketFee) {
    feeRows.push({
      label: 'DUPLICATE HALL TICKET ISSUE FEE',
      amount: `Rs. ${Number(exam.duplicateHallTicketFee).toLocaleString('en-IN')}/-`,
    });
  }

  feeRows.forEach((r, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(xStart, y, contentWidth, feeRowH, 'FD');
    }
    doc.rect(xStart, y, contentWidth, feeRowH, 'S');

    doc.setFont('helvetica', r.isBold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(r.label, xStart + 10, y + 13);
    doc.text(r.amount, xStart + feeCol1W + feeCol2W - 14, y + 13, { align: 'right' });

    y += feeRowH;
  });

  y += 12;

  // Instructions
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. IMPORTANT INSTRUCTIONS FOR CANDIDATES', xStart, y);
  y += 8;

  const defaultInstructions = [
    'Registration and fee payment must be completed strictly within the stipulated timeline through the official Examination Management Portal (EMS) or College Counter.',
    'Clearance of all departmental dues and hostel dues is mandatory prior to generating or receiving the Hall Ticket.',
    'Mere payment of examination fee does not confer any eligibility to appear for the examination; attendance criteria must be fulfilled as per Academic Regulations.',
    'Hall tickets will be released online only to registered candidates who have satisfied all attendance and academic prerequisites.',
    'The fee once paid will neither be refunded nor adjusted against any subsequent examination under any circumstances.',
  ];

  const instructionList = exam.instructions
    ? exam.instructions.split('\n').filter((line) => line.trim().length > 0)
    : defaultInstructions;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);

  instructionList.forEach((inst, idx) => {
    const bullet = `${idx + 1}. `;
    const wrapped = doc.splitTextToSize(inst.replace(/^\d+[\.\)]\s*/, ''), contentWidth - 18);
    doc.text(bullet, xStart + 4, y);
    wrapped.forEach((line: string) => {
      doc.text(line, xStart + 18, y);
      y += 9.5;
    });
    y += 2;
  });

  y += 18;

  // Signatures
  if (y + 50 > pageHeight - 20) {
    doc.addPage();
    y = margin + 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);

  doc.text('CONTROLLER OF EXAMINATIONS', xStart + 80, y, { align: 'center' });
  doc.text('PRINCIPAL', xEnd - 60, y, { align: 'center' });

  y += 26;

  // Copy To Distribution List
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Copy to:', xStart, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('1. Notice Boards (All Departments & Examination Cell)', xStart + 10, y);
  y += 7.5;
  doc.text('2. All Heads of Departments (for student circulation)', xStart + 10, y);
  y += 7.5;
  doc.text('3. Administrative Office & Accounts Section', xStart + 10, y);
  y += 7.5;
  doc.text('4. Master Examination File', xStart + 10, y);

  // Document metadata
  doc.setProperties({
    title: `${exam.name} - Fee Notification`,
    author: collegeName,
  });

  const safeFilename = `${exam.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Fee_Notification.pdf`;
  doc.save(safeFilename);
}
