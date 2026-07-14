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
  SdmsStudentFilters,
} from '@/types/sdms';

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
      const body = await res.json();
      message = body.message || message;
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

  getExams(status?: ExamStatus) {
    const query = status ? `?status=${status}` : '';
    return request<Exam[]>(`/exams${query}`);
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

  getFeeRecords(
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

  getPayments(feeRecordId?: number, rollNumber?: string) {
    const params = new URLSearchParams();
    if (feeRecordId) params.set('feeRecordId', String(feeRecordId));
    if (rollNumber) params.set('rollNumber', rollNumber.trim());
    const query = params.toString() ? `?${params}` : '';
    return request<Payment[]>(`/fees/payments${query}`);
  },

  getPayment(id: number) {
    return request<Payment>(`/fees/payments/${id}`);
  },

  voidPayment(paymentId: number, reason?: string) {
    return request<PaymentResult>(`/fees/payments/${paymentId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  markFeeUnpaid(feeRecordId: number, reason?: string) {
    return request<{ payment: Payment | null; feeRecord: ExamFeeRecord }>(
      `/fees/records/${feeRecordId}/mark-unpaid`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    );
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
  }) {
    return request<import('./razorpayCheckout').PaymentGatewaySettings>(
      '/settings/payments',
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    );
  },
};
