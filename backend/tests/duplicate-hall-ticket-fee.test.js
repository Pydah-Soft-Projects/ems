'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { ExamService } = require('../src/exam/exam.service');
const { createFeesRoutes } = require('../src/exam/exam.routes');

test('duplicate hall ticket fee falls back to configured default when exam value is blank', async () => {
  const service = new ExamService(
    { manager: { getRepository: () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {
      async getPaymentSettingsPublic() {
        return { duplicateHallTicketFee: 250 };
      },
    },
    {},
  );

  const fee = await service.resolveDuplicateHallTicketFee({ duplicateHallTicketFee: '' });
  assert.equal(fee, 250);
});

test('duplicate hall ticket fee creates a fresh record for repeated payments', async () => {
  const service = new ExamService(
    { manager: { getRepository: () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {
      async getPaymentSettingsPublic() {
        return { duplicateHallTicketFee: 250 };
      },
    },
    {},
  );

  service.findOne = async () => ({
    id: 12,
    type: 'regular',
    applicationEndDate: null,
  });
  service.listFeeRecords = async () => [{
    id: 1,
    studentRollNumber: 'A-101',
    studentName: 'Alice',
    status: 'paid',
    feeBreakdown: [{ subjectCode: 'DHT', fee: 250 }],
  }];

  let createdCount = 0;
  service.feeRecordRepo = {
    create(payload) {
      createdCount += 1;
      return { ...payload, id: createdCount * 100 };
    },
    save(payload) {
      return payload;
    },
  };

  const first = await service.createDuplicateHallTicketFeeRecord(12, 'A-101', 'Alice');
  const second = await service.createDuplicateHallTicketFeeRecord(12, 'A-101', 'Alice');

  assert.equal(createdCount, 2);
  assert.equal(first.status, 'pending');
  assert.equal(second.status, 'pending');
  assert.notEqual(first.id, second.id);
});

test('duplicate hall ticket fee does not create a second pending record when one already exists', async () => {
  const service = new ExamService(
    { manager: { getRepository: () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {
      async getPaymentSettingsPublic() {
        return { duplicateHallTicketFee: 250 };
      },
    },
    {},
  );

  service.findOne = async () => ({
    id: 12,
    type: 'regular',
    applicationEndDate: null,
  });
  service.listFeeRecords = async () => [{
    id: 7,
    studentRollNumber: 'A-101',
    studentName: 'Alice',
    status: 'pending',
    feeBreakdown: [{ subjectCode: 'DHT', fee: 250 }],
  }];

  let createdCount = 0;
  service.feeRecordRepo = {
    create(payload) {
      createdCount += 1;
      return { ...payload, id: createdCount * 100 };
    },
    save(payload) {
      return payload;
    },
  };

  const result = await service.createDuplicateHallTicketFeeRecord(12, 'A-101', 'Alice');

  assert.equal(createdCount, 0);
  assert.equal(result.status, 'pending');
  assert.equal(result.id, 7);
});

test('duplicate hall ticket fee list route is exposed on the fees router', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      role: 'staff',
      isSuperAdmin: true,
      privileges: ['fees:read', 'exams:hall_tickets'],
      username: 'staff',
    };
    next();
  });
  app.use('/api/fees', createFeesRoutes({
    exam: {
      async listDuplicateHallTicketFeeRecords(filters) {
        return [{
          id: 9,
          examId: filters.examId,
          status: filters.status,
          studentRollNumber: 'A-101',
          feeBreakdown: [{ subjectCode: 'DHT', fee: 250 }],
        }];
      },
    },
    settings: {},
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const port = server.address().port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/fees/duplicate-hall-ticket-fee?examId=12&status=paid`,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body[0].id, 9);
    assert.equal(body[0].examId, 12);
    assert.equal(body[0].status, 'paid');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('duplicate hall ticket fee route is exposed on the fees router', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      role: 'staff',
      isSuperAdmin: true,
      privileges: ['fees:collect', 'exams:hall_tickets'],
      username: 'staff',
    };
    next();
  });
  app.use('/api/fees', createFeesRoutes({
    exam: {
      async createDuplicateHallTicketFeeRecord(examId, rollNumber, studentName) {
        return {
          id: 42,
          examId,
          rollNumber,
          studentName,
          status: 'pending',
        };
      },
    },
    settings: {},
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/fees/duplicate-hall-ticket-fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId: 12, rollNumber: 'A-101', studentName: 'Alice' }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.id, 42);
    assert.equal(body.rollNumber, 'A-101');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});
