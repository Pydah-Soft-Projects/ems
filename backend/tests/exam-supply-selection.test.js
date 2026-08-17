'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ExamService } = require('../src/exam/exam.service');

function makeResultQueryBuilder(rows = []) {
  return {
    where() { return this; },
    andWhere() { return this; },
    orderBy() { return this; },
    addOrderBy() { return this; },
    getMany: async () => rows,
  };
}

test('supply selection treats missing results as manual selection allowed', async () => {
  const service = new ExamService(
    { manager: { getRepository: () => ({}) } },
    {},
    {},
    {},
    {},
    {},
    { createQueryBuilder: () => makeResultQueryBuilder([]) },
    {},
    {},
    {},
    {},
  );

  const status = await service.supplyResultStatus(
    { yearOfStudy: 2, semester: 3 },
    'R001',
    [
      { subjectId: 11, subject: { code: 'CS101' } },
      { subjectId: 22, subject: { code: 'CS202' } },
    ],
  );

  assert.equal(status.get(11).eligible, true);
  assert.equal(status.get(22).eligible, true);
  assert.equal(status.get(11).passed, null);
  assert.equal(status.get(22).passed, null);
});
