'use client';

import { ChangeEvent, DragEvent, useState } from 'react';
import { MarksTabType } from '@/types/marks-upload';

interface FileUploadZoneProps {
  activeTab: MarksTabType;
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  selectedFile: File | null;
  onClearFile: () => void;
  subjects?: Array<{ code: string; name: string }>;
  selectedSubjectCode?: string;
}

export function FileUploadZone({
  activeTab,
  onFileSelect,
  isLoading,
  selectedFile,
  onClearFile,
  subjects = [],
  selectedSubjectCode = 'ALL',
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSelect(file);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  const validateAndSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'pdf'].includes(ext || '')) {
      alert('Please select a valid Excel (.xlsx, .xls, .csv) or PDF (.pdf) file.');
      return;
    }
    onFileSelect(file);
  };

  const downloadSampleTemplate = (format: 'CSV' | 'PDF' = 'CSV') => {
    const availableSubjects = subjects.length > 0
      ? subjects
      : [
          { code: 'TS01', name: 'TESTING SUB 1' },
          { code: 'TS02', name: 'TESTING SUB 2' },
        ];

    const isAllSubjects = !selectedSubjectCode || selectedSubjectCode === 'ALL';

    if (format === 'PDF') {
      const printWin = window.open('', '_blank');
      if (!printWin) {
        alert('Please allow popups to generate and view/print the PDF template.');
        return;
      }

      const rowsHtml = availableSubjects.map((sub, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${sub.code}</td>
          <td>${sub.name}</td>
          <td style="text-align: center;">${idx === 0 ? 'F' : 'E'}</td>
          <td style="text-align: center;">${idx === 0 ? '0' : '5'}</td>
          <td style="text-align: center;">${idx === 0 ? '0.0' : '3.0'}</td>
          <td style="text-align: center;">${idx === 0 ? 'F' : 'P'}</td>
        </tr>
      `).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sample_Results_PDF_Template.pdf</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; margin: 35px; color: #111; line-height: 1.4; }
            .header { text-align: center; margin-bottom: 25px; }
            .header h2 { font-size: 15px; font-weight: bold; margin: 0 0 4px 0; }
            .header h3 { font-size: 13px; font-weight: normal; margin: 0 0 6px 0; color: #444; }
            .header p { font-size: 12px; font-weight: bold; margin: 2px 0; }
            .student-block { margin-bottom: 25px; page-break-inside: avoid; }
            .pin-title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            th { background-color: #f6efe0; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; text-align: left; padding: 6px 8px; font-size: 12px; }
            td { border-bottom: 1px solid #eee; padding: 6px 8px; font-size: 12px; }
            @media print {
              body { margin: 15px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>JAWAHARLAL NEHRU TECHNOLOGICAL UNIVERSITY KAKINADA</h2>
            <h3>BTECH I Year II Semester (R23) Regular Examination Results</h3>
            <p>6T: PYDAH COLLEGE OF ENGINEERING</p>
            <p>04: ELECTRONICS & COMMUNICATION ENGINEERING</p>
          </div>

          <div class="student-block">
            <div class="pin-title">PIN: 112233</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 50px;">SlNo</th>
                  <th style="width: 100px;">SubCode</th>
                  <th>SubName</th>
                  <th style="width: 70px; text-align: center;">Grade</th>
                  <th style="width: 90px; text-align: center;">Grade Points</th>
                  <th style="width: 70px; text-align: center;">Credits</th>
                  <th style="width: 70px; text-align: center;">Result</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div class="student-block">
            <div class="pin-title">PIN: 11234</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 50px;">SlNo</th>
                  <th style="width: 100px;">SubCode</th>
                  <th>SubName</th>
                  <th style="width: 70px; text-align: center;">Grade</th>
                  <th style="width: 90px; text-align: center;">Grade Points</th>
                  <th style="width: 70px; text-align: center;">Credits</th>
                  <th style="width: 70px; text-align: center;">Result</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
        </html>
      `;

      printWin.document.open();
      printWin.document.write(htmlContent);
      printWin.document.close();
      return;
    }

    let headers: string[] = [];
    let sampleRows: string[][] = [];

    if (activeTab === 'INTERNAL' || activeTab === 'EXTERNAL') {
      if (isAllSubjects) {
        headers = ['HallTicketNumber', 'SubjectCode', 'Marks'];
        sampleRows = [];
        availableSubjects.forEach((sub, idx) => {
          sampleRows.push(['236T1A0401', sub.code, String(20 + idx * 2)]);
          sampleRows.push(['236T1A0402', sub.code, idx === 1 ? 'AB' : String(18 + idx * 3)]);
        });
      } else {
        headers = ['HallTicketNumber', 'Marks'];
        sampleRows = [
          ['236T1A0401', '24'],
          ['236T1A0402', '18'],
          ['236T1A0403', 'AB'],
          ['236T1A0404', '21'],
        ];
      }
    } else if (activeTab === 'RESULT') {
      headers = ['StudentRollNumber', 'StudentName', 'SubjectCode', 'SubjectName', 'InternalMarks', 'ExternalMarks', 'TotalMarks', 'Grade', 'GradePoints', 'Credits', 'Result'];
      sampleRows = [];
      availableSubjects.forEach((sub, idx) => {
        sampleRows.push(['236T1A0401', 'A. Sharma', sub.code, sub.name, '20', '58', '78', 'A', '8.0', '3.0', 'P']);
        sampleRows.push(['236T1A0402', 'B. Kumar', sub.code, sub.name, '17', '18', '35', 'F', '0.0', '0.0', 'F']);
      });
    } else if (activeTab === 'REVALUATION') {
      headers = ['StudentRollNumber', 'StudentName', 'SubjectCode', 'SubjectName', 'OriginalGrade', 'UpdatedGrade', 'OriginalMarks', 'UpdatedMarks', 'Status', 'Remarks'];
      sampleRows = [];
      availableSubjects.forEach((sub) => {
        sampleRows.push(['236T1A0401', 'A. Sharma', sub.code, sub.name, 'F', 'E', '17', '35', 'GRADE_CHANGED', 'Passed after reval']);
        sampleRows.push(['236T1A0402', 'B. Kumar', sub.code, sub.name, 'F', 'F', '13', '13', 'NO_CHANGE', 'No mark change']);
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...sampleRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeTab.toLowerCase()}_${isAllSubjects ? 'all_subjects' : selectedSubjectCode}_sample_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Import Document (.xlsx, .xls, .csv, .pdf)
          </h3>
          <p className="text-xs text-slate-500">
            Upload Excel sheet or PDF containing student marks and roll numbers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadSampleTemplate('CSV')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors shadow-xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Sample CSV Template
          </button>

          <button
            type="button"
            onClick={() => downloadSampleTemplate('PDF')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors shadow-xs"
          >
            <svg className="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Sample PDF Template
          </button>
        </div>
      </div>

      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 ${
            isDragging
              ? 'border-sky-500 bg-sky-50/70'
              : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">
                Drag & Drop your marks file here, or{' '}
                <span className="text-sky-600 underline">browse</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Supports Excel (.xlsx, .xls, .csv) and PDF (.pdf) documents up to 10MB
              </p>
            </div>

            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Excel Auto-Column Mapping
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> PDF Text & Regex Parser
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-xs uppercase">
              {selectedFile.name.split('.').pop()}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {selectedFile.name}
              </h4>
              <p className="text-xs text-slate-500">
                {(selectedFile.size / 1024).toFixed(1)} KB • Ready for parsing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs font-medium text-sky-600">
                <svg className="animate-spin h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Parsing file...
              </div>
            )}

            <button
              type="button"
              onClick={onClearFile}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Remove file"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
