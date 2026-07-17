'use strict';

/**
 * End-to-end workflow simulation — Express + TypeORM + in-memory MongoDB
 * Usage: npm run simulate
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const {
    ExamStatus,
    PaymentMethod,
} = require('../src/exam/schemas/exam.enums');
const { SubjectType } = require('../src/subjects/schemas/subject.enums');

const results = [];
function record(step, ok, detail) {
    results.push({ step, ok, detail });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step}${detail ? ` — ${detail}` : ''}`);
}
async function run() {
    const mongod = await MongoMemoryServer.create();
    process.env.HRMS_MONGODB_URI = mongod.getUri();
    process.env.SIMULATE_USE_SQLITE = 'true';
    process.env.SIMULATE_SQLITE_PATH = `./data/simulate-${Date.now()}.sqlite`;
    process.env.JWT_SECRET = 'simulate-secret';
    const { createExamPortalDataSource } = require('../src/database/data-source');
    const { createServices } = require('../src/database/container');
    const { HrmsUserModel } = require('../src/auth/hrms-user.model');

    await mongoose.connect(process.env.HRMS_MONGODB_URI);
    await HrmsUserModel.create({
        email: 'superadmin@example.com',
        password: await bcrypt.hash('admin123', 10),
        role: 'super_admin',
        roles: ['super_admin'],
        name: 'Super Administrator',
        isActive: true,
    });
    const dataSource = createExamPortalDataSource();
    await dataSource.initialize();
    const services = createServices(dataSource);
    try {
        const login = await services.auth.login({
            username: 'superadmin@example.com',
            password: 'admin123',
        });
        record('Super Admin login', !!login.accessToken, `token for ${login.user.username}`);
        const regulation = await services.regulations.create({
            code: 'R20',
            name: 'Regulation 2020',
            effectiveDate: '2020-01-01',
            scopes: [
                {
                    collegeId: 1,
                    collegeName: 'Simulation College',
                    courseId: 1,
                    courseName: 'B.Tech',
                    batches: ['2022-2026'],
                },
            ],
        });
        record('Create regulation', regulation.id > 0, `id=${regulation.id}`);
        const updatedReg = await services.regulations.update(regulation.id, {
            description: 'Simulation regulation',
        });
        record('Update regulation', updatedReg.description === 'Simulation regulation');
        const s1 = await services.subjects.create({
            regulationId: regulation.id,
            code: 'CS501',
            name: 'Operating Systems',
            type: SubjectType.THEORY,
            credits: 3,
            internalMarks: 40,
            externalMarks: 60,
        });
        const s2 = await services.subjects.create({
            regulationId: regulation.id,
            code: 'CS502',
            name: 'DBMS',
            type: SubjectType.THEORY,
            credits: 3,
            internalMarks: 40,
            externalMarks: 60,
        });
        const s3 = await services.subjects.create({
            regulationId: regulation.id,
            code: 'CS503',
            name: 'Computer Networks',
            type: SubjectType.THEORY,
            credits: 3,
            internalMarks: 40,
            externalMarks: 60,
        });
        record('Create subjects', !!(s1.id && s2.id && s3.id), '3 subjects');
        const dupCheck = await services.subjects
            .create({
            regulationId: regulation.id,
            code: 'CS501',
            name: 'Duplicate',
        })
            .then(() => false)
            .catch(() => true);
        record('Reject duplicate subject code', dupCheck);
        await services.subjects.createMapping({
            regulationId: regulation.id,
            assignments: [
                {
                    subjectId: s1.id,
                    collegeId: 1,
                    collegeName: 'Simulation College',
                    courseId: 1,
                    courseName: 'B.Tech',
                    branchId: 1,
                    branchName: 'CSE',
                    batch: '2022-2026',
                    yearOfStudy: 3,
                    semester: 5,
                    sectionMode: 'all',
                },
                {
                    subjectId: s2.id,
                    collegeId: 1,
                    collegeName: 'Simulation College',
                    courseId: 1,
                    courseName: 'B.Tech',
                    branchId: 1,
                    branchName: 'CSE',
                    batch: '2022-2026',
                    yearOfStudy: 3,
                    semester: 5,
                    sectionMode: 'all',
                },
                {
                    subjectId: s3.id,
                    collegeId: 1,
                    collegeName: 'Simulation College',
                    courseId: 1,
                    courseName: 'B.Tech',
                    branchId: 1,
                    branchName: 'CSE',
                    batch: '2022-2026',
                    yearOfStudy: 3,
                    semester: 5,
                    sectionMode: 'all',
                },
            ],
        });
        record('Create subject mapping', true);
        const exam = await services.exam.create({
            name: 'B.Tech 5th Sem Regular May 2026',
            regulationId: regulation.id,
            college: 'Simulation College',
            course: 'B.Tech',
            branch: 'CSE',
            batch: '2022-2026',
            yearOfStudy: 3,
            semester: 5,
            subjects: [
                { subjectId: s1.id, fee: 180, examDate: '2026-05-10' },
                { subjectId: s2.id, fee: 180, examDate: '2026-05-12' },
                { subjectId: s3.id, fee: 180, examDate: '2026-05-14' },
            ],
            packageFee: 500,
            applicationStartDate: '2026-04-01',
            applicationEndDate: '2026-04-30',
            examinationStartDate: '2026-05-10',
            examinationEndDate: '2026-05-20',
            submitForApproval: true,
        });
        record('Create exam', exam.status === ExamStatus.PENDING_APPROVAL, `status=${exam.status}`);
        const rejectBlocked = await services.exam
            .publish(exam.id, {})
            .then(() => false)
            .catch(() => true);
        record('Block publish before approval', rejectBlocked);
        await services.exam.approve(exam.id, 'admin');
        const published = await services.exam.publish(exam.id, {
            students: [
                { rollNumber: '21CS001', name: 'Alice' },
                { rollNumber: '21CS002', name: 'Bob' },
            ],
        });
        record('Publish exam + fees', published.status === ExamStatus.PUBLISHED);
        const feeRecords = await services.exam.listFeeRecords(published.id);
        record('Fee records', feeRecords.length === 2, `count=${feeRecords.length}`);
        const aliceFee = feeRecords.find((f) => f.studentRollNumber === '21CS001');
        record('Package fee applied', !!aliceFee && Number(aliceFee.baseFee) === 500, aliceFee ? `baseFee=${aliceFee.baseFee}` : '');
        await services.exam.payOffline({
            feeRecordId: aliceFee.id,
            paymentMethod: PaymentMethod.UPI,
            collectedBy: 'Self-service counter',
            remarks: 'Simulated online/UPI collection',
        });
        record('Online-style payment (offline UPI record)', true);
        await services.exam.payOffline({
            studentRollNumber: '21CS002',
            examId: published.id,
            paymentMethod: PaymentMethod.CASH,
            collectedBy: 'Accounts Officer',
        });
        record('Offline payment', true);
        const payments = await services.exam.listPayments();
        record('Payment history', payments.length === 2, `count=${payments.length}`);
    }
    catch (err) {
        record('Unexpected error', false, err.message);
        console.error(err);
    }
    await dataSource.destroy();
    await mongoose.disconnect();
    await mongod.stop();
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log('\n========== SIMULATION REPORT ==========');
    console.log(`Passed: ${passed} / ${results.length}`);
    console.log(`Accuracy: ${((passed / results.length) * 100).toFixed(1)}%`);
    process.exit(failed > 0 ? 1 : 0);
}
run();
