const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FeeManagementService,
} = require('../src/fee-management/fee-management.service');
const { RevaluationService } = require('../src/revaluation/revaluation.service');
const { ExamService } = require('../src/exam/exam.service');
const { FeeStatus } = require('../src/exam/schemas/exam.enums');

test('FeeManagementService.checkTransactionStatusForFeeRecord detects cancelled and deleted transactions', async () => {
  const service = new FeeManagementService({});

  // When disabled / not connected
  service.isEnabled = () => false;
  const disabledRes = await service.checkTransactionStatusForFeeRecord({ feeRecordId: 101 });
  assert.equal(disabledRes.available, false);
  assert.equal(disabledRes.shouldRollback, false);

  // When connected and transactions found are cancelled
  service.isEnabled = () => true;
  service.findTransactionsForFeeRecord = async () => [
    { _id: 't1', emsFeeRecordId: 101, status: 'cancelled' },
    { _id: 't2', emsFeeRecordId: 101, status: 'cancelled' },
  ];

  const cancelledRes = await service.checkTransactionStatusForFeeRecord({
    feeRecordId: 101,
    paymentIds: [1],
  });
  assert.equal(cancelledRes.available, true);
  assert.equal(cancelledRes.status, 'cancelled');
  assert.equal(cancelledRes.shouldRollback, true);

  // When connected and transaction was deleted (no rows in Mongo)
  service.findTransactionsForFeeRecord = async () => [];
  const deletedRes = await service.checkTransactionStatusForFeeRecord({
    feeRecordId: 101,
    paymentIds: [1],
    hasPostedMetadata: true,
  });
  assert.equal(deletedRes.available, true);
  assert.equal(deletedRes.status, 'deleted');
  assert.equal(deletedRes.shouldRollback, true);

  // When connected and transaction is active
  service.findTransactionsForFeeRecord = async () => [
    { _id: 't3', emsFeeRecordId: 101, status: 'active' },
  ];
  const activeRes = await service.checkTransactionStatusForFeeRecord({
    feeRecordId: 101,
    paymentIds: [1],
  });
  assert.equal(activeRes.available, true);
  assert.equal(activeRes.status, 'active');
  assert.equal(activeRes.shouldRollback, false);
});

test('ExamService.syncTransactionsWithFeeManagement rolls back cancelled transactions to unpaid', async () => {
  let updatedRecord = null;
  const savedPayments = [];
  let updatedRevalApp = null;

  const mockFeeRecordRepo = {
    createQueryBuilder: () => ({
      leftJoinAndSelect: function () { return this; },
      where: function () { return this; },
      andWhere: function () { return this; },
      getMany: async () => [
        {
          id: 555,
          studentRollNumber: '2023CSE01',
          feeType: 'REVALUATION',
          revaluationNotificationId: 10,
          status: FeeStatus.PAID,
          payments: [
            {
              id: 99,
              status: 'success',
              receiptNumber: 'REC-001',
              gatewayResponse: JSON.stringify({ feeManagement: { transactionId: 'txn-1' } }),
            },
          ],
        },
      ],
    }),
    update: async (id, fields) => {
      updatedRecord = { id, ...fields };
    },
    manager: {
      getRepository: (entityName) => {
        if (entityName === 'RevaluationApplication') {
          return {
            find: async () => [
              {
                id: 1,
                feeRecordId: 555,
                status: 'paid',
              },
            ],
            save: async (app) => {
              updatedRevalApp = app;
              return app;
            },
          };
        }
        return {};
      },
    },
  };

  const mockPaymentRepo = {
    save: async (p) => {
      savedPayments.push(p);
      return p;
    },
  };

  const mockFeeManagement = {
    isEnabled: () => true,
    checkTransactionStatusForFeeRecord: async () => ({
      available: true,
      status: 'cancelled',
      shouldRollback: true,
      reason: 'transaction_cancelled_in_fee_management',
    }),
  };

  const examService = new ExamService(
    { manager: { getRepository: () => ({}) } }, // examRepo
    {}, // examSubjectRepo
    mockFeeRecordRepo,
    mockPaymentRepo,
    {}, // examScopeRepo
    {}, // applicationRepo
    {}, // subjectResultRepo
    {}, // subjectsService
    {}, // regulationsService
    {}, // sdms
    {}, // settings
    mockFeeManagement,
  );

  const result = await examService.syncTransactionsWithFeeManagement({ feeRecordId: 555 });

  assert.equal(result.syncedCount, 1);
  assert.equal(result.rolledBackCount, 1);
  assert.equal(updatedRecord?.status, FeeStatus.PENDING);
  assert.equal(savedPayments[0]?.status, 'cancelled');
  assert.equal(updatedRevalApp?.status, 'pending');
});

test('RevaluationService.apply allows re-applying when existing application is unpaid/pending', async () => {
  let savedFeeRecord = null;
  let savedApplication = null;

  const mockNotificationRepo = {
    findOne: async () => ({
      id: 5,
      title: 'Revaluation Sem 1',
      status: 'published',
      regulationId: 1,
      selectedScopes: [{ collegeName: 'PEC', courseName: 'B.Tech', batch: '2023' }],
      feesByCount: [500, 1000],
      subjectIds: [101, 102],
    }),
  };

  const mockApplicationRepo = {
    findOne: async () => ({
      id: 88,
      notificationId: 5,
      studentRollNumber: '2023CSE01',
      feeRecordId: 200,
      selectedSubjectIds: [101],
      feeAmount: 500,
      status: 'pending',
    }),
    save: async (app) => {
      savedApplication = app;
      return app;
    },
  };

  const mockFeeRecordRepo = {
    findOne: async () => ({
      id: 200,
      status: 'pending', // Unpaid / rolled back
      selectedSubjectIds: [101],
      baseFee: 500,
      totalAmount: 500,
    }),
    save: async (rec) => {
      savedFeeRecord = rec;
      return rec;
    },
    manager: {
      getRepository: () => ({}),
    },
  };

  const mockSdms = {
    listStudents: async () => ({
      items: [
        {
          id: 1,
          studentName: 'Ananya Sharma',
          pinNo: '2023CSE01',
          admissionNumber: 'ADM-01',
          batch: '2023',
          college: 'PEC',
          course: 'B.Tech',
          branch: 'CSE',
        },
      ],
    }),
  };

  const revalService = new RevaluationService(
    mockNotificationRepo,
    mockApplicationRepo,
    { findOne: async () => ({ id: 1, code: 'R23', name: 'Regulation 23' }) }, // regulationRepo
    {}, // subjectRepo
    {
      createQueryBuilder: () => ({
        innerJoinAndSelect: function () { return this; },
        where: function () { return this; },
        andWhere: function () { return this; },
        orderBy: function () { return this; },
        addOrderBy: function () { return this; },
        getMany: async () => [
          { subjectId: 101, subject: { code: 'CS101', name: 'Data Structures' }, yearOfStudy: 1, semester: 1 },
          { subjectId: 102, subject: { code: 'CS102', name: 'Algorithms' }, yearOfStudy: 1, semester: 1 },
        ],
      }),
    },
    mockFeeRecordRepo,
    mockSdms,
    { isEnabled: () => false }, // feeManagement
  );

  // Apply with 2 subjects
  const res = await revalService.apply(5, {
    studentIdentifier: '2023CSE01',
    selectedSubjectIds: [101, 102],
  });

  assert.equal(res.id, 88);
  assert.equal(res.status, 'pending');
  assert.equal(res.feeAmount, 1000);
  assert.deepEqual(res.selectedSubjectIds, [101, 102]);
  assert.equal(savedFeeRecord.totalAmount, 1000);
  assert.equal(savedFeeRecord.status, 'pending');
});
