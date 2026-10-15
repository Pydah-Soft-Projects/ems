'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { MarksService } = require('../src/exam/marks.service');

test('internal marks overview ignores result marks from a different notification', async () => {
  const exam = {
    id: 12,
    name: 'TEST',
    type: 'REGULAR',
    course: 'B.Tech',
    branch: 'ALL',
    batch: '2000',
    yearOfStudy: 3,
    semester: 1,
    regulationId: 1,
    regulation: { code: 'TEST' },
    status: 'ACTIVE',
    examSubjects: [
      {
        subjectId: 7,
        subject: {
          code: 'TS01',
          name: 'TESTING SUB 1',
          internalMarks: 30,
          externalMarks: 70,
          totalMarks: 100,
        },
      },
    ],
  };
  const service = new MarksService(
    { find: async () => [] },
    { findOne: async () => exam },
  );
  service.getNotificationDetails = async () => ({
    branches: [],
    subjects: [],
    students: [
      {
        rollNumber: '112233',
        name: 'Test Student',
        branch: 'CAMPUS',
        section: 'A',
      },
    ],
  });
  service.getConsolidatedResults = async () => ({
    students: [
      {
        rollNumber: '112233',
        examGroups: [
          {
            examId: 99,
            revaluationId: null,
            notificationTitle: 'OTHER NOTIFICATION',
            regulationCode: 'TEST',
            semester: '3-1',
            subjects: [{ subjectCode: 'TS01', internalMarks: 15, maxInternalMarks: 30 }],
          },
        ],
      },
    ],
  });

  const overview = await service.getInternalMarksOverview(12);

  assert.equal(overview.studentEntries[0].marksObtained, null);
  assert.equal(overview.studentEntries[0].maxMarks, 30);
  assert.equal(overview.studentEntries[0].isEntered, false);
});

test('internal marks overview does not use a mark from another notification with the same title', async () => {
  const exam = {
    id: 12,
    name: 'MID 2',
    type: 'REGULAR',
    batch: '2000',
    yearOfStudy: 3,
    semester: 1,
    status: 'ACTIVE',
    examSubjects: [
      {
        subjectId: 7,
        subject: { code: 'TS01', name: 'TESTING SUB 1', internalMarks: 30 },
      },
    ],
  };
  const service = new MarksService(
    { find: async () => [] },
    { findOne: async () => exam },
  );
  service.getNotificationDetails = async () => ({
    branches: [],
    subjects: [],
    students: [{ rollNumber: '112233', name: 'Test Student', branch: 'CAMPUS', section: 'A' }],
  });
  service.getConsolidatedResults = async () => {
    throw new Error('Internal marks overview must not infer marks from consolidated groups');
  };

  const overview = await service.getInternalMarksOverview(12);

  assert.equal(overview.studentEntries[0].marksObtained, null);
  assert.equal(overview.studentEntries[0].isEntered, false);
});

test('internal marks overview uses eligible unlinked result marks as a fallback', async () => {
  const exam = {
    id: 12,
    name: 'MID 2',
    type: 'REGULAR',
    batch: '2000',
    yearOfStudy: 3,
    semester: 1,
    status: 'ACTIVE',
    examSubjects: [
      {
        subjectId: 7,
        subject: { code: 'TS02', name: 'TESTING SUB 2', internalMarks: 30 },
      },
    ],
  };
  let findCall = 0;
  const service = new MarksService(
    {
      find: async () => {
        findCall += 1;
        if (findCall === 2) {
          return [
            {
              category: 'INTERNAL',
              examId: null,
              revaluationId: null,
              studentRollNumber: '112233',
              subjectCode: 'TS02',
              internalMarks: 20,
              maxInternalMarks: 30,
            },
          ];
        }
        return [];
      },
    },
    { findOne: async () => exam },
  );
  service.getNotificationDetails = async () => ({
    branches: [],
    subjects: [],
    students: [{ rollNumber: '112233', name: 'Test Student', branch: 'CAMPUS', section: 'A' }],
  });
  service.getConsolidatedResults = async () => ({ students: [] });

  const overview = await service.getInternalMarksOverview(12);

  assert.equal(overview.studentEntries[0].marksObtained, 20);
  assert.equal(overview.studentEntries[0].isEntered, true);
});

test('internal marks overview prefers marks linked directly to the selected notification', async () => {
  const exam = {
    id: 12,
    name: 'MID 2',
    type: 'REGULAR',
    batch: '2000',
    yearOfStudy: 3,
    semester: 1,
    status: 'ACTIVE',
    examSubjects: [
      {
        subjectId: 7,
        subject: { code: 'TS02', name: 'TESTING SUB 2', internalMarks: 30 },
      },
    ],
  };
  let findCall = 0;
  const service = new MarksService(
    {
      find: async () => {
        findCall += 1;
        if (findCall === 1) {
          return [
            {
              category: 'INTERNAL',
              examId: 12,
              studentRollNumber: '112233',
              subjectCode: 'TS02',
              internalMarks: 18,
              maxInternalMarks: 30,
            },
          ];
        }
        if (findCall === 2) {
          return [
            {
              category: 'INTERNAL',
              examId: null,
              studentRollNumber: '112233',
              subjectCode: 'TS02',
              internalMarks: 20,
              maxInternalMarks: 30,
            },
          ];
        }
        return [];
      },
    },
    { findOne: async () => exam },
  );
  service.getNotificationDetails = async () => ({
    branches: [],
    subjects: [],
    students: [{ rollNumber: '112233', name: 'Test Student', branch: 'CAMPUS', section: 'A' }],
  });

  const overview = await service.getInternalMarksOverview(12);

  assert.equal(overview.studentEntries[0].marksObtained, 18);
});

test('consolidated results merges unlinked subjects into a students only exam group', async () => {
  const marks = [
    {
      studentRollNumber: '112233',
      studentName: 'Test Student',
      category: 'INTERNAL',
      examId: 99,
      revaluationId: null,
      subjectCode: 'TS01',
      subjectName: 'TESTING SUB 1',
      internalMarks: 15,
      maxInternalMarks: 30,
      exam: {
        id: 99,
        name: 'TESTING',
        type: 'REGULAR',
        yearOfStudy: 3,
        semester: 1,
        regulation: { code: 'TEST' },
      },
      revaluationNotification: null,
    },
    {
      studentRollNumber: '112233',
      studentName: 'Test Student',
      category: 'INTERNAL',
      examId: null,
      revaluationId: null,
      subjectCode: 'TS02',
      subjectName: 'TESTING SUB 2',
      internalMarks: 20,
      maxInternalMarks: 30,
      exam: null,
      revaluationNotification: null,
    },
  ];
  const queryBuilder = {
    leftJoinAndSelect() {
      return this;
    },
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    orderBy() {
      return this;
    },
    addOrderBy() {
      return this;
    },
    getMany: async () => marks,
  };
  const service = new MarksService(
    { createQueryBuilder: () => queryBuilder },
  );

  const response = await service.getConsolidatedResults({});

  assert.equal(response.students[0].examGroups.length, 1);
  assert.equal(response.students[0].examGroups[0].notificationTitle, 'TESTING');
  assert.deepEqual(
    response.students[0].examGroups[0].subjects.map((subject) => subject.subjectCode),
    ['TS01', 'TS02'],
  );
  assert.equal(response.students[0].examGroups[0].subjects[1].internalMarks, 20);
});
