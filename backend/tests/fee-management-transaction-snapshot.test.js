const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FeeManagementService,
} = require('../src/fee-management/fee-management.service');

test('buildTransactionDoc stores student college course and branch snapshots', () => {
  const service = new FeeManagementService({});

  const doc = service.buildTransactionDoc({
    paymentDate: '2026-08-12T10:00:00.000Z',
    paymentMethod: 'upi',
    student: {
      admissionNumber: 'ADM-2023-001',
      studentName: 'Ravi Kumar',
      currentSemester: 2,
      currentYear: 2,
      college: 'Pydah Engineering College',
      course: 'B.Tech',
      branch: 'CSE',
      collegeId: 12,
      courseId: 7,
      branchId: 3,
    },
    exam: {
      semester: 2,
      yearOfStudy: 2,
      name: 'Semester 2 Exam',
    },
    emsPaymentId: 98765,
    emsFeeRecordId: 456,
    gatewayPaymentId: 'rzp_test_123',
  });

  assert.equal(doc.studentId, 'ADM-2023-001');
  assert.equal(doc.studentName, 'Ravi Kumar');
  assert.equal(doc.college, 'Pydah Engineering College');
  assert.equal(doc.collegeId, 12);
  assert.equal(doc.course, 'B.Tech');
  assert.equal(doc.courseId, 7);
  assert.equal(doc.branch, 'CSE');
  assert.equal(doc.branchId, 3);
  assert.equal(doc.paymentMode, 'UPI');
  assert.equal(doc.transactionType, 'DEBIT');
  assert.equal(doc.source, 'ems');
  assert.equal(doc.gatewayPaymentId, 'rzp_test_123');
});
