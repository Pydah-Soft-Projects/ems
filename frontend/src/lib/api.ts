import { clearAuth, getToken, LoginResponse, AuthUser } from './auth';
import {
  Regulation,
  CreateRegulationInput,
  UpdateRegulationInput,
  RegulationDetail,
  RegulationBatchInsight,
  ClaimedRegulationBatch,
} from '@/types/regulation';
import {
  Subject,
  CreateSubjectInput,
  UpdateSubjectInput,
  SubjectMappingEntry,
  CreateSubjectMappingInput,
  UpdateSubjectMappingInput,
  ReplaceScopeMappingInput,
  SubjectMappingFilters,
  SubjectTypeOption,
  CreateSubjectTypeInput,
  UpdateSubjectTypeInput,
  SubjectTypeUsage,
  ReassignSubjectTypeInput,
  ReassignSubjectTypeResult,
} from '@/types/subject';
import {
  Exam,
  CreateExamInput,
  UpdateExamInput,
  PublishExamInput,
  ExamStatus,
  EligibleStudentsResponse,
  ExamAnalytics,
  StudentExamListItem,
  StudentExamDetail,
  CreateExamApplicationInput,
  HallTicket,
} from '@/types/exam';
import {
  FeeCollectionLookup,
  ExamFeeRecord,
  FeeBreakdownItem,
  OfflinePaymentInput,
  Payment,
  PaymentResult,
  PaymentMethod,
} from '@/types/fee';
import {
  FeeHead,
  CreateFeeHeadInput,
  UpdateFeeHeadInput,
  FeeHeadResolution,
} from '@/types/fee-head';
import {
  ExamResultsResponse,
  ResultRowInput,
  ResultUploadResponse,
  StudentResultsResponse,
} from '@/types/results';
import {
  SdmsCollege,
  SdmsCourse,
  SdmsBranch,
  SdmsAcademicYear,
  SdmsSection,
  SdmsBranchYearSemesters,
  SdmsSemester,
  SdmsStudentListResponse,
  SdmsStudentSection,
  SdmsStudent,
  SdmsEvent,
  SdmsStudentFilters,
} from '@/types/sdms';
import {
  Professional,
  CreateProfessionalInput,
  UpdateProfessionalInput,
  RemunerationBill,
  CreateRemunerationBillInput,
  UpdateRemunerationBillInput,
  RemunerationMeta,
  ExamBillSubject,
  ExamBillBranch,
  RemunerationBillType,
  RemunerationBillStatus,
  RemunerationSimulateResult,
} from '@/types/remuneration';
import {
  PrivilegesCatalog,
  EmsRole,
  EmsUser,
  EmsUserListResponse,
  HrmsUserSearchResponse,
  EmsAuditLog,
  CreateEmsRoleInput,
  UpdateEmsRoleInput,
  CreateEmsUserInput,
  UpdateEmsUserInput,
} from '@/types/user-management';
import type {
  RevaluationNotification,
  RevaluationStudentDetail,
} from '@/types/revaluation';
import type {
  MarksNotificationResponse,
  NotificationDetailsResponse,
  ParseDocumentResponse,
  ParsedMarkRow,
  UploadMarksResult,
  MarksHistoryResponse,
  ConsolidatedResultsResponse,
} from '@/types/marks-upload';

type RevaluationNotificationInput = {
  regulationId: number;
  title: string;
  message: string;
  startDate: string;
  endDate: string;
  selectedScopes: Array<{
    collegeName: string;
    courseName: string;
    batch: string;
  }>;
  selectedYearSemesters: Array<{ yearOfStudy: number; semester: number }>;
  excludedBatches: string[];
  subjectIds: number[];
  feesByCount: number[];
  status: 'draft' | 'published';
};

export type ExamApplicationReportSummary = {
  totalEligible: number;
  totalApplied: number;
  paidCount: number;
  notPaidCount: number;
  paidWithLateFeeCount: number;
  totalAmountCollected: number;
  totalLateFeeCollected: number;
};

export interface ExamApplicationReportBreakdownItem {
  examName?: string;
  batch: string;
  branch: string;
  course: string;
  totalEligible: number;
  totalApplied: number;
  paidCount: number;
  notPaidCount: number;
  paidWithLateFeeCount: number;
  totalAmountCollected: number;
  totalLateFeeCollected: number;
};

export type ExamApplicationReportItem = {
  id: number;
  examId: number;
  examName: string;
  examCode: string | null;
  studentRollNumber: string;
  studentName: string;
  batch: string;
  branch: string;
  course: string;
  baseFee: number;
  lateFee: number;
  totalAmount: number;
  status: string;
  isPaid: boolean;
  isPaidLateFee: boolean;
  paidAt: string | null;
  submittedAt: string;
  paymentMode: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
};

export type ExamApplicationReportResponse = {
  summary: ExamApplicationReportSummary;
  breakdown: ExamApplicationReportBreakdownItem[];
  items: ExamApplicationReportItem[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearAuth();
    }
    let message = 'Request failed';
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await res.json();
        message = body.message || message;
      } else {
        const text = await res.text();
        if (text && text.trim()) {
          message = text.trim();
        }
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: email, password }),
    });
  },

  me() {
    return request<AuthUser>('/auth/me');
  },

  getRegulations() {
    return request<Regulation[]>('/regulations');
  },

  getClaimedRegulationBatches(excludeRegulationId?: number) {
    const query = excludeRegulationId
      ? `?excludeRegulationId=${excludeRegulationId}`
      : '';
    return request<ClaimedRegulationBatch[]>(`/regulations/claimed-batches${query}`);
  },

  getRegulation(id: number) {
    return request<Regulation>(`/regulations/${id}`);
  },

  getRegulationDetail(id: number) {
    return request<RegulationDetail>(`/regulations/${id}/detail`);
  },

  getRegulationBatchInsight(
    id: number,
    params: { collegeId: number; courseId: number; batch: string },
  ) {
    const q = new URLSearchParams({
      collegeId: String(params.collegeId),
      courseId: String(params.courseId),
      batch: params.batch,
    });
    return request<RegulationBatchInsight>(
      `/regulations/${id}/batch-insight?${q.toString()}`,
    );
  },

  createRegulation(data: CreateRegulationInput) {
    return request<Regulation>('/regulations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRegulation(id: number, data: UpdateRegulationInput) {
    return request<Regulation>(`/regulations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteRegulation(id: number) {
    return request<void>(`/regulations/${id}`, { method: 'DELETE' });
  },

  getSubjects(regulationId?: number) {
    const query = regulationId ? `?regulationId=${regulationId}` : '';
    return request<Subject[]>(`/subjects${query}`);
  },

  getRevaluationNotifications() {
    return request<RevaluationNotification[]>('/revaluations');
  },

  getRevaluationNotification(id: number) {
    return request<RevaluationNotification>(`/revaluations/${id}`);
  },

  getRevaluationApplications(id: number) {
    return request<Array<{
      id: number;
      studentRollNumber: string;
      studentName: string;
      selectedSubjectIds: number[];
      feeAmount: number | string;
      status: string;
      feeRecordId: number | null;
      feeRecord?: ExamFeeRecord;
    }>>(`/revaluations/${id}/applications`);
  },

  getRevaluationStudents(id: number) {
    return request<Array<{
      id: number;
      name: string;
      rollNumber: string;
      admissionNumber: string | null;
      college: string | null;
      course: string | null;
      branch: string | null;
      batch: string | null;
      section: string | null;
      currentYear: number;
      currentSemester: number;
      studentStatus: string | null;
      feeRecordId: number | null;
      feeStatus: string;
      feeAmount: number | string | null;
    }>>(`/revaluations/${id}/students`);
  },

  getRevaluationMappedSubjects(
    regulationId: number,
    selectedScopes: Array<{ collegeName: string; courseName: string; batch: string }>,
    selectedYearSemesters: Array<{ yearOfStudy: number; semester: number }> = [],
  ) {
    return request<Array<{ id: number; code: string; name: string; yearOfStudy: number; semester: number }>>('/revaluations/subjects', {
      method: 'POST',
      body: JSON.stringify({ regulationId, selectedScopes, selectedYearSemesters }),
    });
  },

  createRevaluationNotification(data: RevaluationNotificationInput) {
    return request<RevaluationNotification>('/revaluations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRevaluationNotification(id: number, data: RevaluationNotificationInput) {
    return request<RevaluationNotification>(`/revaluations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getRevaluationStudent(notificationId: number, identifier: string) {
    const query = new URLSearchParams({ identifier });
    return request<RevaluationStudentDetail>(
      `/revaluations/student/${notificationId}?${query.toString()}`,
    );
  },

  applyRevaluation(notificationId: number, data: { studentIdentifier: string; selectedSubjectIds: number[] }) {
    return request<{ id: number; feeAmount: number }>(`/revaluations/${notificationId}/applications`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getSubject(id: number) {
    return request<Subject>(`/subjects/${id}`);
  },

  createSubject(data: CreateSubjectInput) {
    return request<Subject>('/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateSubject(id: number, data: UpdateSubjectInput) {
    return request<Subject>(`/subjects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteSubject(id: number) {
    return request<void>(`/subjects/${id}`, { method: 'DELETE' });
  },

  getSubjectTypes(activeOnly = false) {
    const query = activeOnly ? '?activeOnly=true' : '';
    return request<SubjectTypeOption[]>(`/subjects/types${query}`);
  },

  createSubjectType(data: CreateSubjectTypeInput) {
    return request<SubjectTypeOption>('/subjects/types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateSubjectType(id: number, data: UpdateSubjectTypeInput) {
    return request<SubjectTypeOption>(`/subjects/types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteSubjectType(id: number) {
    return request<void>(`/subjects/types/${id}`, { method: 'DELETE' });
  },

  getSubjectTypeUsage(id: number) {
    return request<SubjectTypeUsage>(`/subjects/types/${id}/usage`);
  },

  reassignSubjectType(id: number, data: ReassignSubjectTypeInput) {
    return request<ReassignSubjectTypeResult>(`/subjects/types/${id}/reassign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getSubjectMappings(filters: SubjectMappingFilters = {}) {
    const params = new URLSearchParams();
    if (filters.regulationId) params.set('regulationId', String(filters.regulationId));
    if (filters.course) params.set('course', filters.course);
    if (filters.branch) params.set('branch', filters.branch);
    if (filters.batch) params.set('batch', filters.batch);
    if (filters.yearOfStudy) params.set('yearOfStudy', String(filters.yearOfStudy));
    if (filters.semester) params.set('semester', String(filters.semester));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<SubjectMappingEntry[]>(`/subject-mappings${query}`);
  },

  getSubjectMapping(id: number) {
    return request<SubjectMappingEntry>(`/subject-mappings/${id}`);
  },

  createSubjectMapping(data: CreateSubjectMappingInput) {
    return request<SubjectMappingEntry[]>('/subject-mappings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  replaceSubjectMappingScope(data: ReplaceScopeMappingInput) {
    return request<SubjectMappingEntry[]>('/subject-mappings/scope', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  updateSubjectMapping(id: number, data: UpdateSubjectMappingInput) {
    return request<SubjectMappingEntry>(`/subject-mappings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteSubjectMapping(id: number) {
    return request<void>(`/subject-mappings/${id}`, { method: 'DELETE' });
  },

  getSdmsStatus() {
    return request<{ connected: boolean; database: string; readOnly: boolean }>(
      '/sdms/status',
    );
  },

  getSdmsColleges(activeOnly = true) {
    return request<SdmsCollege[]>(`/sdms/colleges?activeOnly=${activeOnly}`);
  },

  getSdmsCollege(id: number) {
    return request<SdmsCollege>(`/sdms/colleges/${id}`);
  },

  getSdmsCourses(collegeId: number, activeOnly = true) {
    return request<SdmsCourse[]>(
      `/sdms/colleges/${collegeId}/courses?activeOnly=${activeOnly}`,
    );
  },

  getSdmsCourse(id: number) {
    return request<SdmsCourse>(`/sdms/courses/${id}`);
  },

  getSdmsBranches(courseId: number, activeOnly = true) {
    return request<SdmsBranch[]>(
      `/sdms/courses/${courseId}/branches?activeOnly=${activeOnly}`,
    );
  },

  getSdmsBranch(id: number) {
    return request<SdmsBranch>(`/sdms/branches/${id}`);
  },

  getSdmsAcademicYears(activeOnly = true) {
    return request<SdmsAcademicYear[]>(
      `/sdms/academic-years?activeOnly=${activeOnly}`,
    );
  },

  getSdmsBranchAcademicYears(branchId: number) {
    return request<SdmsAcademicYear[]>(`/sdms/branches/${branchId}/academic-years`);
  },

  getSdmsBranchYearSemesters(branchId: number) {
    return request<SdmsBranchYearSemesters>(
      `/sdms/branches/${branchId}/year-semesters`,
    );
  },

  getSdmsBatches(filters: {
    collegeId?: number;
    courseId?: number;
    branchId?: number;
  } = {}) {
    const params = new URLSearchParams();
    if (filters.collegeId) params.set('collegeId', String(filters.collegeId));
    if (filters.courseId) params.set('courseId', String(filters.courseId));
    if (filters.branchId) params.set('branchId', String(filters.branchId));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<string[]>(`/sdms/batches${query}`);
  },

  getSdmsBranchSections(branchId: number, batch?: string) {
    const query = batch ? `?batch=${encodeURIComponent(batch)}` : '';
    return request<SdmsSection[]>(`/sdms/branches/${branchId}/sections${query}`);
  },

  getSdmsSemesters(filters: {
    collegeId?: number;
    courseId?: number;
    academicYearId?: number;
    batch?: string;
    yearOfStudy?: number;
  } = {}) {
    const params = new URLSearchParams();
    if (filters.collegeId) params.set('collegeId', String(filters.collegeId));
    if (filters.courseId) params.set('courseId', String(filters.courseId));
    if (filters.academicYearId) {
      params.set('academicYearId', String(filters.academicYearId));
    }
    if (filters.batch) params.set('batch', filters.batch);
    if (filters.yearOfStudy) params.set('yearOfStudy', String(filters.yearOfStudy));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<SdmsSemester[]>(`/sdms/semesters${query}`);
  },

  getSdmsStudentSections(filters: {
    branchId?: number;
    batch?: string;
    sectionName?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (filters.branchId) params.set('branchId', String(filters.branchId));
    if (filters.batch) params.set('batch', filters.batch);
    if (filters.sectionName) params.set('sectionName', filters.sectionName);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<SdmsStudentSection[]>(`/sdms/student-sections${query}`);
  },

  getSdmsStudents(filters: SdmsStudentFilters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<SdmsStudentListResponse>(`/sdms/students${query}`);
  },

  getSdmsStudent(id: number) {
    return request<SdmsStudent>(`/sdms/students/${id}`);
  },

  getSdmsEvents(filters: {
    from?: string;
    to?: string;
    targetCollege?: string;
    targetCourse?: string;
    targetBranch?: string;
    targetBatch?: string;
    targetYear?: string;
    targetSemester?: string;
  } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<SdmsEvent[]>(`/sdms/events${query}`);
  },

  async syncSdmsEvents() {
    try {
      return await request<{ success: boolean; syncedExams?: number; totalCreated?: number }>(
        '/exams/sync-events',
        { method: 'POST' },
      );
    } catch {
      return await request<{ success: boolean; syncedExams?: number; totalCreated?: number }>(
        '/sdms/events/sync',
        { method: 'POST' },
      );
    }
  },

  getExams(status?: ExamStatus) {
    const query = status ? `?status=${status}` : '';
    return request<Exam[]>(`/exams${query}`);
  },

  getExamApplicationReport(filters: {
    examId?: number;
    batch?: string;
    branch?: string;
    course?: string;
    status?: string;
    search?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (filters.examId) params.set('examId', String(filters.examId));
    if (filters.batch) params.set('batch', filters.batch);
    if (filters.branch) params.set('branch', filters.branch);
    if (filters.course) params.set('course', filters.course);
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<ExamApplicationReportResponse>(`/exams/reports/application-summary${query}`);
  },

  getExam(id: number) {
    return request<Exam>(`/exams/${id}`);
  },

  createExam(data: CreateExamInput) {
    return request<Exam>('/exams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateExam(id: number, data: UpdateExamInput) {
    return request<Exam>(`/exams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  submitExam(id: number) {
    return request<Exam>(`/exams/${id}/submit`, { method: 'POST' });
  },

  approveExam(id: number) {
    return request<Exam>(`/exams/${id}/approve`, { method: 'POST' });
  },

  rejectExam(id: number, remarks: string) {
    return request<Exam>(`/exams/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ remarks }),
    });
  },

  publishExam(id: number, data: PublishExamInput = {}) {
    return request<Exam>(`/exams/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  releaseHallTickets(id: number) {
    return request<Exam>(`/exams/${id}/release-hall-tickets`, {
      method: 'POST',
    });
  },

  getExamHallTickets(id: number) {
    return request<{
      exam: {
        id: number;
        name: string;
        hallTicketsReleasedAt: string | null;
        status: string;
      };
      tickets: HallTicket[];
      total: number;
    }>(`/exams/${id}/hall-tickets`);
  },

  getExamHallTicket(examId: number, applicationId: number) {
    return request<HallTicket>(
      `/exams/${examId}/hall-tickets/${applicationId}`,
    );
  },

  getStudentHallTickets() {
    return request<HallTicket[]>('/student/hall-tickets');
  },

  getStudentHallTicket(applicationId: number) {
    return request<HallTicket>(`/student/hall-tickets/${applicationId}`);
  },

  getExamEligibleStudents(id: number) {
    return request<EligibleStudentsResponse>(`/exams/${id}/eligible-students`);
  },

  getExamAnalytics(id: number) {
    return request<ExamAnalytics>(`/exams/${id}/analytics`);
  },

  uploadExamResults(
    examId: number,
    data: { fileName?: string; rows: ResultRowInput[] },
  ) {
    return request<ResultUploadResponse>(`/exams/${examId}/results`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getExamResults(examId: number) {
    return request<ExamResultsResponse>(`/exams/${examId}/results`);
  },

  getResultsByRoll(rollNumber: string) {
    return request<StudentResultsResponse>(
      `/results/roll/${encodeURIComponent(rollNumber.trim())}`,
    );
  },

  getStudentResults() {
    return request<StudentResultsResponse>('/student/results');
  },

  getStudentExams() {
    return request<StudentExamListItem[]>('/student/exams');
  },

  getStudentExam(id: number) {
    return request<StudentExamDetail>(`/student/exams/${id}`);
  },

  createStudentExamApplication(
    examId: number,
    data: CreateExamApplicationInput,
  ) {
    return request<{
      application: {
        id: number;
        examId: number;
        selectedSubjectIds: number[];
        feeBreakdown: FeeBreakdownItem[];
        feeRecordId: number;
        submittedAt: string;
      };
      feeRecord: ExamFeeRecord;
    }>(`/student/exams/${examId}/applications`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  lookupFeeCollection(rollNumber: string) {
    const q = encodeURIComponent(rollNumber.trim());
    return request<FeeCollectionLookup>(`/fees/collection?rollNumber=${q}`);
  },

  // ── Staff: apply for an exam on behalf of a student (same student flow) ──
  getStudentExamsForStaff(studentId: number) {
    return request<StudentExamListItem[]>(`/fees/students/${studentId}/exams`);
  },

  getStudentExamForStaff(studentId: number, examId: number) {
    return request<StudentExamDetail>(
      `/fees/students/${studentId}/exams/${examId}`,
    );
  },

  applyExamForStudent(
    studentId: number,
    examId: number,
    data: CreateExamApplicationInput,
  ) {
    return request<{
      application: {
        id: number;
        examId: number;
        selectedSubjectIds: number[];
        feeBreakdown: FeeBreakdownItem[];
        feeRecordId: number;
        submittedAt: string;
      };
      feeRecord: ExamFeeRecord;
    }>(`/fees/students/${studentId}/exams/${examId}/apply`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getFeeRecords(
    filters: {
      examId?: number;
      rollNumber?: string;
      status?: 'pending' | 'paid';
      page?: number;
      limit?: number;
      feeType?: 'EXAM' | 'REVALUATION';
      revaluationNotificationId?: number;
    } = {},
  ) {
    const params = new URLSearchParams();
    if (filters.examId) params.set('examId', String(filters.examId));
    if (filters.rollNumber) params.set('rollNumber', filters.rollNumber.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.feeType) params.set('feeType', filters.feeType);
    if (filters.revaluationNotificationId) params.set('revaluationNotificationId', String(filters.revaluationNotificationId));
    const query = params.toString() ? `?${params}` : '';
    return request<ExamFeeRecord[]>(`/fees/records${query}`);
  },

  getFeeRecord(id: number) {
    return request<ExamFeeRecord>(`/fees/records/${id}`);
  },

  payOffline(data: OfflinePaymentInput) {
    return request<PaymentResult>('/fees/pay-offline', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getDuplicateHallTicketFeeRecords(
    filters: {
      examId?: number;
      rollNumber?: string;
      status?: 'pending' | 'paid';
    } = {},
  ) {
    const params = new URLSearchParams();
    if (filters.examId) params.set('examId', String(filters.examId));
    if (filters.rollNumber) params.set('rollNumber', filters.rollNumber.trim());
    if (filters.status) params.set('status', filters.status);
    const query = params.toString() ? `?${params}` : '';
    return request<ExamFeeRecord[]>(`/fees/duplicate-hall-ticket-fee${query}`);
  },

  createDuplicateHallTicketFeeRecord(
    examId: number,
    rollNumber: string,
    studentName?: string,
  ) {
    return request<ExamFeeRecord>('/fees/duplicate-hall-ticket-fee', {
      method: 'POST',
      body: JSON.stringify({ examId, rollNumber, studentName }),
    });
  },

  // ── Fee Heads Creation & Management ──
  getFeeHeads(filters: { search?: string; type?: string; isActive?: boolean | string } = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search.trim());
    if (filters.type) params.set('type', filters.type);
    if (filters.isActive !== undefined && filters.isActive !== '') {
      params.set('isActive', String(filters.isActive));
    }
    const query = params.toString() ? `?${params}` : '';
    return request<FeeHead[]>(`/fees/fee-heads${query}`);
  },

  getFeeHead(id: string | number) {
    return request<FeeHead>(`/fees/fee-heads/${id}`);
  },

  createFeeHead(data: CreateFeeHeadInput) {
    return request<FeeHead>('/fees/fee-heads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateFeeHead(id: string | number, data: UpdateFeeHeadInput) {
    return request<FeeHead>(`/fees/fee-heads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteFeeHead(id: string | number) {
    return request<{ success: boolean; message: string }>(`/fees/fee-heads/${id}`, {
      method: 'DELETE',
    });
  },

  resolveFeeHead(headId: string | number, regulationCode?: string) {
    return request<FeeHeadResolution>('/fees/fee-heads/resolve', {
      method: 'POST',
      body: JSON.stringify({ headId, regulationCode }),
    });
  },

  applyFeeHeadToRecord(data: {
    feeRecordId?: number | null;
    headId: string | number;
    regulationCode?: string;
    customAmount?: number;
    studentRollNumber?: string;
    studentName?: string;
  }) {
    return request<ExamFeeRecord>('/fees/fee-heads/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getPayments(feeRecordId?: number, rollNumber?: string, status?: string) {
    const params = new URLSearchParams();
    if (feeRecordId) params.set('feeRecordId', String(feeRecordId));
    if (rollNumber) params.set('rollNumber', rollNumber.trim());
    if (status) params.set('status', status.trim());
    const query = params.toString() ? `?${params}` : '';
    return request<Payment[]>(`/fees/payments${query}`);
  },

  getPayment(id: number) {
    return request<Payment>(`/fees/payments/${id}`);
  },

  voidPayment(_paymentId: number, _reason?: string) {
    return Promise.reject(
      new ApiError('Voiding payments is not allowed', 400),
    );
  },

  markFeeUnpaid(feeRecordId: number, reason?: string) {
    return request<{ success: boolean; message: string }>(
      `/fees/records/${feeRecordId}/unpaid`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    );
  },

  syncFeeTransactions(filters?: {
    rollNumber?: string;
    feeRecordId?: number;
    examId?: number;
    revaluationNotificationId?: number;
  }) {
    return request<{
      syncedCount: number;
      rolledBackCount: number;
      rolledBackRecords: Array<{
        feeRecordId: number;
        studentRollNumber: string;
        feeType: string;
        reason: string;
      }>;
    }>('/fees/sync-transactions', {
      method: 'POST',
      body: JSON.stringify(filters || {}),
    });
  },

  syncRevaluationTransactions(notificationId: number, rollNumber?: string) {
    return request<{
      syncedCount: number;
      rolledBackCount: number;
      rolledBackRecords: Array<{
        feeRecordId: number;
        studentRollNumber: string;
        reason: string;
      }>;
    }>(`/revaluations/${notificationId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ rollNumber }),
    });
  },

  studentLogin(pinNo: string, password: string) {
    return request<LoginResponse>('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ pinNo, password }),
    });
  },

  getStudentFees() {
    return request<ExamFeeRecord[]>('/student/fees');
  },

  payStudentFee(
    feeRecordId: number,
    data: { paymentMethod?: PaymentMethod; transactionReference?: string } = {},
  ) {
    return request<PaymentResult>(`/student/fees/${feeRecordId}/pay`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getStudentPayment(id: number) {
    return request<Payment>(`/student/payments/${id}`);
  },

  getRazorpayStatus() {
    return request<{ enabled: boolean; configured: boolean; ready: boolean }>(
      '/fees/razorpay/status',
    );
  },

  /** One call for fee desk / student — Razorpay + Self Online + Canara readiness */
  getPaymentMethodsStatus() {
    return request<{
      razorpay: { enabled: boolean; configured: boolean; ready: boolean };
      selfOnline: {
        enabled: boolean;
        configured: boolean;
        ready: boolean;
        upiId: string | null;
        merchantName: string;
      };
      canara: {
        enabled: boolean;
        mockMode: boolean;
        testMode?: boolean;
        configured: boolean;
        ready: boolean;
        oauthReady: boolean;
        upiId: string | null;
        qrCallbackUrl: string;
        missing?: string[];
      };
    }>('/fees/payment-methods/status');
  },

  createRazorpayOrder(
    feeRecordId: number,
    paymentMethod: PaymentMethod = 'upi',
  ) {
    return request<import('./razorpayCheckout').RazorpayOrderResponse>(
      '/fees/razorpay/order',
      {
        method: 'POST',
        body: JSON.stringify({ feeRecordId, paymentMethod }),
      },
    );
  },

  verifyRazorpayPayment(data: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    paymentId?: number;
  }) {
    return request<import('./razorpayCheckout').RazorpayVerifyResult>(
      '/fees/razorpay/verify',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },

  getPaymentStatus(id: number) {
    return request<{
      paymentId: number;
      status: string;
      feeRecordId: number;
      feeStatus: string;
      receiptNumber: string;
      transactionReference: string | null;
      paidAt: string;
    }>(`/fees/payments/${id}/status`);
  },

  getPaymentSettings() {
    return request<import('./razorpayCheckout').PaymentGatewaySettings>(
      '/settings/payments',
    );
  },

  updatePaymentSettings(data: {
    enabled?: boolean;
    razorpayKeyId?: string;
    razorpayKeySecret?: string;
    selfOnlineEnabled?: boolean;
    selfOnlineUpiId?: string;
    selfOnlineMerchantName?: string;
    selfOnlinePaymentNote?: string;
    selfOnlineExpiryHours?: number;
    duplicateHallTicketFee?: number;
    restrictExamApplyOnFeeDues?: boolean;
  }) {
    return request<import('./razorpayCheckout').PaymentGatewaySettings>(
      '/settings/payments',
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    );
  },

  getCanaraStatus() {
    return request<import('@/types/canara').CanaraStatus>(
      '/fees/canara/status',
    );
  },

  /** Canara-only settings (table: canara_payment_settings) */
  getCanaraSettings() {
    return request<import('@/types/canara').CanaraStatus>('/settings/canara');
  },

  updateCanaraSettings(data: {
    enabled?: boolean;
    mockMode?: boolean;
    testMode?: boolean;
    clientId?: string;
    clientSecret?: string;
    baseUrl?: string;
    scope?: string;
    oauthRedirectUri?: string;
    mid?: string;
    accountNumber?: string;
    ifscCode?: string;
    merchantName?: string;
    mcc?: string;
    bankName?: string;
    channel?: string;
    sid?: string;
    terminalId?: string;
    upiId?: string;
    symmetricKey?: string;
    privateKeyPem?: string;
    publicCertPem?: string;
  }) {
    return request<import('@/types/canara').CanaraStatus>('/settings/canara', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getCanaraVpas() {
    return request<import('@/types/canara').CanaraVPARecord[]>('/settings/canara/vpas');
  },

  createCanaraVpa(data: {
    sid: string;
    name?: string;
    mobileNumber?: string;
    additionalNumber?: string;
    usedFor?: string;
  }) {
    return request<{ created: import('@/types/canara').CanaraVPARecord }>(
      '/settings/canara/vpas',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },

  activateCanaraVpa(id: number) {
    return request<import('@/types/canara').CanaraVPARecord>(
      `/settings/canara/vpas/${id}/activate`,
      { method: 'POST' },
    );
  },

  inquireCanaraVpa(id: number) {
    return request<import('@/types/canara').CanaraVPARecord>(
      `/settings/canara/vpas/${id}/enquire`,
      { method: 'POST' },
    );
  },

  deleteCanaraVpa(id: number) {
    return request<{ deleted: boolean; id: number }>(`/settings/canara/vpas/${id}`, {
      method: 'DELETE',
    });
  },

  startCanaraOauth() {
    return request<{ url: string; state: string; redirectUri: string }>(
      '/fees/canara/oauth/start',
      { method: 'POST', body: JSON.stringify({}) },
    );
  },

  createCanaraOrder(feeRecordId: number) {
    return request<import('@/types/canara').CanaraOrder>(
      '/fees/canara/order',
      {
        method: 'POST',
        body: JSON.stringify({ feeRecordId }),
      },
    );
  },

  checkCanaraPaymentStatus(paymentId: number, simulatePaid?: boolean) {
    return request<import('@/types/canara').CanaraStatusCheck>(
      `/fees/canara/${paymentId}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ simulatePaid: Boolean(simulatePaid) }),
      },
    );
  },

  simulateCanaraCallback(paymentId: number, force?: boolean) {
    return request<{ ok: boolean; code?: string; paymentId?: number }>(
      `/fees/canara/${paymentId}/simulate-callback`,
      {
        method: 'POST',
        body: JSON.stringify({ force: Boolean(force) }),
      },
    );
  },

  getSelfOnlineStatus() {
    return request<import('@/types/self-online').SelfOnlineStatus>(
      '/fees/self-online/status',
    );
  },

  createSelfOnlineOrder(feeRecordId: number) {
    return request<import('@/types/self-online').SelfOnlineOrder>(
      '/fees/self-online/order',
      {
        method: 'POST',
        body: JSON.stringify({ feeRecordId }),
      },
    );
  },

  claimSelfOnlinePayment(paymentId: number, utr?: string) {
    return request<import('@/types/self-online').SelfOnlineClaimResult>(
      `/fees/self-online/${paymentId}/claim`,
      {
        method: 'POST',
        body: JSON.stringify({ utr: utr || undefined }),
      },
    );
  },

  listSelfOnlinePending() {
    return request<import('@/types/self-online').SelfOnlinePendingRow[]>(
      '/fees/self-online/pending',
    );
  },

  listSelfOnlineSuggestions() {
    return request<import('@/types/self-online').SelfOnlineSuggestion[]>(
      '/fees/self-online/suggestions',
    );
  },

  listSelfOnlineStatements() {
    return request<
      {
        id: number;
        fileName: string;
        sourceKind: string;
        fileFormat: string;
        rowCount: number;
        uploadedBy: string | null;
        notes: string | null;
        createdAt: string;
      }[]
    >('/fees/self-online/statements');
  },

  listSelfOnlineStatementTxns(params?: {
    statementId?: number;
    matchStatus?: string;
  }) {
    const q = new URLSearchParams();
    if (params?.statementId) q.set('statementId', String(params.statementId));
    if (params?.matchStatus) q.set('matchStatus', params.matchStatus);
    const suffix = q.toString() ? `?${q}` : '';
    return request<import('@/types/self-online').SelfOnlineStatementTxn[]>(
      `/fees/self-online/statement-txns${suffix}`,
    );
  },

  async uploadSelfOnlineStatement(file: File, notes?: string) {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    const headers: HeadersInit = {};
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/fees/self-online/statements`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearAuth();
      }
      let message = 'Upload failed';
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        /* ignore */
      }
      throw new ApiError(message, res.status);
    }
    return res.json() as Promise<{
      statement: {
        id: number;
        fileName: string;
        sourceKind: string;
        rowCount: number;
        createdAt: string;
        notes: string | null;
      };
      parsedCount: number;
      matchSummary: { autoVerified: number; suggested: number };
      warning: string | null;
    }>;
  },

  verifySelfOnlineMatch(paymentId: number, merchantTxnId: number) {
    return request<{
      payment: Payment;
      feeRecord: ExamFeeRecord;
      alreadyVerified?: boolean;
    }>('/fees/self-online/verify', {
      method: 'POST',
      body: JSON.stringify({ paymentId, merchantTxnId }),
    });
  },

  manualVerifySelfOnline(data: {
    paymentId: number;
    utr?: string;
    bankLine?: string;
  }) {
    return request<{
      payment: Payment;
      feeRecord: ExamFeeRecord;
      alreadyVerified?: boolean;
    }>('/fees/self-online/manual-verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  rejectSelfOnlineSuggestion(merchantTxnId: number) {
    return request<{ ok: boolean }>('/fees/self-online/reject-suggestion', {
      method: 'POST',
      body: JSON.stringify({ merchantTxnId }),
    });
  },

  autoMatchAllSelfOnline() {
    return request<{
      awaitingCount: number;
      verifiedCount: number;
    }>('/fees/self-online/auto-match-all', {
      method: 'POST',
    });
  },

  // —— Professionals (external setters / evaluators) ——

  getProfessionals(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<Professional[]>(`/professionals${query}`);
  },

  suggestProfessionals(q: string, limit = 10) {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return request<Professional[]>(`/professionals/suggest?${params}`);
  },

  getProfessional(id: number) {
    return request<Professional>(`/professionals/${id}`);
  },

  createProfessional(data: CreateProfessionalInput) {
    return request<Professional>('/professionals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateProfessional(id: number, data: UpdateProfessionalInput) {
    return request<Professional>(`/professionals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteProfessional(id: number) {
    return request<void>(`/professionals/${id}`, { method: 'DELETE' });
  },

  // —— Remuneration bills ——

  getRemunerationMeta() {
    return request<RemunerationMeta>('/remuneration/meta');
  },

  getRemunerationBills(filters: {
    examId?: number;
    billType?: RemunerationBillType;
    status?: RemunerationBillStatus;
    search?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (filters.examId) params.set('examId', String(filters.examId));
    if (filters.billType) params.set('billType', filters.billType);
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<RemunerationBill[]>(`/remuneration${query}`);
  },

  getRemunerationBill(id: number) {
    return request<RemunerationBill>(`/remuneration/${id}`);
  },

  createRemunerationBill(data: CreateRemunerationBillInput) {
    return request<RemunerationBill>('/remuneration', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRemunerationBill(id: number, data: UpdateRemunerationBillInput) {
    return request<RemunerationBill>(`/remuneration/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updateRemunerationBillStatus(id: number, status: RemunerationBillStatus) {
    return request<RemunerationBill>(`/remuneration/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  deleteRemunerationBill(id: number) {
    return request<void>(`/remuneration/${id}`, { method: 'DELETE' });
  },

  getRemunerationExamSubjects(examId: number, branch?: string) {
    const query = branch ? `?branch=${encodeURIComponent(branch)}` : '';
    return request<ExamBillSubject[]>(
      `/remuneration/exam-subjects/${examId}${query}`,
    );
  },

  getRemunerationExamBranches(examId: number) {
    return request<ExamBillBranch[]>(`/remuneration/exam-branches/${examId}`);
  },

  simulateRemuneration() {
    return request<RemunerationSimulateResult>('/remuneration/simulate', {
      method: 'POST',
    });
  },

  // ── User management / RBAC ──
  getPrivilegeCatalog() {
    return request<PrivilegesCatalog>('/user-management/privileges');
  },

  getEmsRoles() {
    return request<EmsRole[]>('/user-management/roles');
  },

  getEmsRole(id: number) {
    return request<EmsRole>(`/user-management/roles/${id}`);
  },

  createEmsRole(data: CreateEmsRoleInput) {
    return request<EmsRole>('/user-management/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateEmsRole(id: number, data: UpdateEmsRoleInput) {
    return request<EmsRole>(`/user-management/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteEmsRole(id: number) {
    return request<{ success: boolean }>(`/user-management/roles/${id}`, {
      method: 'DELETE',
    });
  },

  getEmsUsers(params?: { q?: string; page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.q) q.set('q', params.q);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<EmsUserListResponse>(
      `/user-management/users${qs ? `?${qs}` : ''}`,
    );
  },

  createEmsUser(data: CreateEmsUserInput) {
    return request<EmsUser>('/user-management/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateEmsUser(id: number, data: UpdateEmsUserInput) {
    return request<EmsUser>(`/user-management/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  searchHrmsUsers(params?: {
    q?: string;
    page?: number;
    limit?: number;
    superAdminsOnly?: boolean;
  }) {
    const q = new URLSearchParams();
    if (params?.q) q.set('q', params.q);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.superAdminsOnly) q.set('superAdminsOnly', 'true');
    const qs = q.toString();
    return request<HrmsUserSearchResponse>(
      `/user-management/hrms-users${qs ? `?${qs}` : ''}`,
    );
  },

  getEmsAuditLogs(params?: { page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<{
      items: EmsAuditLog[];
      total: number;
      page: number;
      limit: number;
    }>(`/user-management/audit-logs${qs ? `?${qs}` : ''}`);
  },

  getMarksNotifications() {
    return request<MarksNotificationResponse>('/marks/notifications');
  },

  async parseMarksFile(formData: FormData) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ems_token') : null;
    const res = await fetch(`${API_URL}/marks/parse`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Parsing failed' }));
      throw new ApiError(err.message || 'Parsing failed', res.status);
    }
    return res.json() as Promise<ParseDocumentResponse>;
  },

  uploadMarks(
    category: 'INTERNAL' | 'EXTERNAL' | 'RESULT' | 'REVALUATION',
    notificationId: number,
    payload: { rows: ParsedMarkRow[]; subjectCode?: string; fileName?: string },
  ) {
    return request<UploadMarksResult>(`/marks/upload/${category}/${notificationId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMarksHistory(
    category: 'INTERNAL' | 'EXTERNAL' | 'RESULT' | 'REVALUATION',
    notificationId: number,
  ) {
    return request<MarksHistoryResponse>(`/marks/history/${category}/${notificationId}`);
  },

  getNotificationDetails(type: 'EXAM' | 'REVALUATION', id: number) {
    return request<NotificationDetailsResponse>(`/marks/notification-details/${type}/${id}`);
  },

  getConsolidatedResults(params?: {
    examId?: number;
    revaluationId?: number;
    rollNumber?: string;
    search?: string;
  }) {
    const q = new URLSearchParams();
    if (params?.examId) q.set('examId', String(params.examId));
    if (params?.revaluationId) q.set('revaluationId', String(params.revaluationId));
    if (params?.rollNumber) q.set('rollNumber', params.rollNumber);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return request<ConsolidatedResultsResponse>(
      `/marks/consolidated-results${qs ? `?${qs}` : ''}`
    );
  },
};
