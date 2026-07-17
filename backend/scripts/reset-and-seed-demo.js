'use strict';

/**
 * Wipe examination_portal (EMS) data and seed a clean demo:
 * regulation → subjects → mapping → one exam (Regular+Supply options) → publish
 * → one student application + offline payment.
 *
 * Does NOT touch student_database (SDMS).
 *
 * Usage: npm run seed:demo
 */

const { DataSource } = require('typeorm');
const { config } = require('../src/config');
const { entities } = require('../src/database/data-source');
const { buildExamPortalMysqlOptions } = require('../src/database/mysql-options');
const { createStudentDataSource } = require('../src/database/student-data-source');
const { createServices } = require('../src/database/container');
const { ExamType, PaymentMethod } = require('../src/exam/schemas/exam.enums');
const { SubjectType } = require('../src/subjects/schemas/subject.enums');

async function wipeExamPortal(ds) {
    console.log('Wiping examination_portal tables…');
    await ds.query('SET FOREIGN_KEY_CHECKS = 0');
    const dropOrder = [
        'payments',
        'exam_applications',
        'exam_fee_records',
        'exam_scopes',
        'exam_subjects',
        'late_fee_slabs',
        'exams',
        'subject_mapping_entries',
        'subjects',
        'regulation_scopes',
        'regulations',
    ];
    for (const table of dropOrder) {
        try {
            await ds.query(`DROP TABLE IF EXISTS \`${table}\``);
            console.log(`  dropped ${table}`);
        }
        catch (err) {
            console.log(`  skip drop ${table}: ${err.message.split('\n')[0]}`);
        }
    }
    await ds.query('SET FOREIGN_KEY_CHECKS = 1');
    await ds.synchronize();
    console.log('  schema recreated');
}
async function pickScope(services) {
    const colleges = await services.sdms.listColleges(true);
    if (!colleges.length)
        throw new Error('No SDMS colleges found');
    const candidates = [];
    for (const college of colleges.slice(0, 12)) {
        const courses = await services.sdms.listCourses(college.id);
        for (const course of courses.slice(0, 8)) {
            const found = await pickScopeFrom(services, college, course);
            if (found)
                candidates.push(found);
        }
    }
    if (!candidates.length) {
        throw new Error('Could not find college/course/branch with students in SDMS');
    }
    // Prefer multi-branch + more students
    candidates.sort((a, b) => {
        const aScore = (a.secondaryBranch ? 1000 : 0) + a.sampleStudents.length;
        const bScore = (b.secondaryBranch ? 1000 : 0) + b.sampleStudents.length;
        return bScore - aScore;
    });
    return candidates[0];
}
async function pickScopeFrom(services, college, course) {
    const branches = await services.sdms.listBranches(course.id);
    if (!branches.length)
        return null;
    for (const branch of branches.slice(0, 8)) {
        const students = await services.sdms.listStudents({
            college: college.name,
            course: course.name,
            branch: branch.name,
            limit: 50,
            page: 1,
        });
        if (!students.items.length)
            continue;
        const groups = new Map();
        for (const s of students.items) {
            if (!s.batch)
                continue;
            const pin = (s.pinNo || '').trim();
            if (!pin || pin.toLowerCase() === 'discontinued')
                continue;
            if (s.studentStatus &&
                /discontinu|cancel|left/i.test(s.studentStatus)) {
                continue;
            }
            const key = `${s.batch}|${s.currentYear}|${s.currentSemester}`;
            const list = groups.get(key) ?? [];
            list.push(s);
            groups.set(key, list);
        }
        const best = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
        if (!best)
            continue;
        const [batch, yearOfStudy, semester] = best[0].split('|');
        const cohort = best[1];
        const secondBranch = branches.find((b) => b.id !== branch.id) ?? null;
        return {
            college,
            course,
            primaryBranch: branch,
            secondaryBranch: secondBranch,
            batch,
            yearOfStudy: parseInt(yearOfStudy, 10),
            semester: parseInt(semester, 10),
            sampleStudents: cohort,
        };
    }
    return null;
}
async function main() {
    console.log('Connecting…');
    console.log(`  exam portal: ${config.examPortalDb.host}/${config.examPortalDb.name}`);
    console.log(`  student db:  ${config.studentDb.host}/${config.studentDb.name}`);
    if (config.simulate.useSqlite) {
        throw new Error('SIMULATE_USE_SQLITE is set. Unset it to seed the real examination_portal MySQL DB.');
    }
    const examDs = new DataSource({
        ...buildExamPortalMysqlOptions(),
        entities,
        // Avoid alter-on-init (unique index swaps fight MySQL FKs). Wipe drops + synchronize().
        synchronize: false,
        logging: false,
    });
    const studentDs = createStudentDataSource();
    await examDs.initialize();
    await studentDs.initialize();
    const services = createServices(examDs, studentDs);
    try {
        await wipeExamPortal(examDs);
        console.log('\nPicking SDMS scope…');
        const scope = await pickScope(services);
        console.log(`  ${scope.college.name} / ${scope.course.name} / ${scope.primaryBranch.name}` +
            (scope.secondaryBranch ? ` + ${scope.secondaryBranch.name}` : '') +
            ` / ${scope.batch} / Y${scope.yearOfStudy} S${scope.semester}`);
        console.log(`  sample student: ${scope.sampleStudents[0].studentName} (${scope.sampleStudents[0].pinNo})`);
        const branchInputs = [
            {
                branch: scope.primaryBranch.name,
                branchId: scope.primaryBranch.id,
            },
            ...(scope.secondaryBranch
                ? [
                    {
                        branch: scope.secondaryBranch.name,
                        branchId: scope.secondaryBranch.id,
                    },
                ]
                : []),
        ];
        console.log('\nCreating regulation…');
        const regulation = await services.regulations.create({
            code: 'R24-DEMO',
            name: 'Regulation 2024 Demo',
            effectiveDate: '2024-06-01',
            description: 'Fresh demo after enrollment redesign',
            scopes: [
                {
                    collegeId: scope.college.id,
                    collegeName: scope.college.name,
                    courseId: scope.course.id,
                    courseName: scope.course.name,
                    batches: [scope.batch],
                },
            ],
        });
        console.log(`  regulation id=${regulation.id}`);
        console.log('\nCreating subjects…');
        const subjectSpecs = [
            { code: 'DEMO101', name: 'Engineering Mathematics', fee: 200 },
            { code: 'DEMO102', name: 'Programming Fundamentals', fee: 200 },
            { code: 'DEMO103', name: 'Digital Logic', fee: 180 },
            { code: 'DEMO104', name: 'Professional Communication', fee: 150 },
        ];
        const subjects = [];
        for (const s of subjectSpecs) {
            subjects.push(await services.subjects.create({
                code: s.code,
                name: s.name,
                type: SubjectType.THEORY,
                credits: 3,
                regulationId: regulation.id,
            }));
        }
        console.log(`  ${subjects.length} subjects`);
        console.log('\nCreating subject mappings (per branch)…');
        for (const b of branchInputs) {
            await services.subjects.createMapping({
                regulationId: regulation.id,
                assignments: subjects.map((sub) => ({
                    subjectId: sub.id,
                    collegeId: scope.college.id,
                    collegeName: scope.college.name,
                    courseId: scope.course.id,
                    courseName: scope.course.name,
                    branchId: b.branchId,
                    branchName: b.branch,
                    batch: scope.batch,
                    yearOfStudy: scope.yearOfStudy,
                    semester: scope.semester,
                    sectionMode: 'all',
                })),
            });
            console.log(`  mapped for ${b.branch}`);
        }
        const today = new Date();
        const start = new Date(today);
        start.setDate(start.getDate() - 2);
        const end = new Date(today);
        end.setDate(end.getDate() + 20);
        const examStart = new Date(today);
        examStart.setDate(examStart.getDate() + 25);
        const examEnd = new Date(today);
        examEnd.setDate(examEnd.getDate() + 35);
        const iso = (d) => d.toISOString().slice(0, 10);
        console.log('\nCreating exam (Regular + Supply enrollment options)…');
        const exam = await services.exam.create({
            name: `${scope.course.name} Sem ${scope.semester} May 2026`,
            types: [ExamType.REGULAR, ExamType.SUPPLY],
            regulationId: regulation.id,
            college: scope.college.name,
            course: scope.course.name,
            batch: scope.batch,
            yearOfStudy: scope.yearOfStudy,
            semester: scope.semester,
            scopes: branchInputs.map((b) => ({
                branch: b.branch,
                branchId: b.branchId,
                sections: [],
            })),
            subjects: subjects.map((sub, i) => ({
                subjectId: sub.id,
                fee: subjectSpecs[i].fee,
                examDate: iso(new Date(examStart.getTime() + i * 86400000)),
            })),
            packageFee: 650,
            applicationStartDate: iso(start),
            applicationEndDate: iso(end),
            examinationStartDate: iso(examStart),
            examinationEndDate: iso(examEnd),
            instructions: 'Select Regular or Supply when applying, then subjects and consent, then pay.',
            submitForApproval: true,
        });
        console.log(`  created #${exam.id} ${exam.name} allowed=[${(exam.allowedTypes ?? [exam.type]).join(', ')}]`);
        console.log('\nApproving + publishing…');
        await services.exam.approve(exam.id, 'demo-seed');
        await services.exam.publish(exam.id, {});
        console.log(`  published #${exam.id}`);
        // Hall tickets stay unreleased until staff clicks "Release hall tickets" in the UI.
        const student = scope.sampleStudents[0];
        const roll = (student.pinNo || student.admissionNumber || '').trim();
        if (!roll)
            throw new Error('Sample student has no PIN');
        console.log('\nStudent application (Regular, all subjects)…');
        const appResult = await services.exam.createStudentApplication(exam.id, student.id, {
            examType: ExamType.REGULAR,
            selectedSubjectIds: subjects.map((s) => s.id),
            declarationAccepted: true,
            consentAccepted: true,
        });
        console.log(`  application #${appResult.application.id} type=${appResult.application.examType} → fee #${appResult.feeRecord.id} amount=${appResult.feeRecord.totalAmount}`);
        console.log('\nOffline payment (staff desk simulation)…');
        const pay = await services.exam.payOffline({
            feeRecordId: appResult.feeRecord.id,
            paymentMethod: PaymentMethod.CASH,
            collectedBy: 'Demo Cashier',
            collectorUsername: 'demo-seed',
            remarks: 'Seed script demo payment',
        });
        console.log(`  payment #${pay.payment.id} receipt=${pay.payment.receiptNumber} status=${pay.feeRecord.status}`);
        const analytics = await services.exam.getExamAnalytics(exam.id);
        console.log('\nAnalytics:');
        console.log(`  eligible=${analytics.eligibleCount} enrolled=${analytics.enrolledCount} paid=${analytics.paidCount} notEnrolled=${analytics.notEnrolledCount}`);
        console.log(`  estimated=${analytics.estimatedRevenue} collected=${analytics.collectedRevenue}`);
        console.log('\n========== DEMO READY ==========');
        console.log(`College:     ${scope.college.name}`);
        console.log(`Programme:   ${scope.course.name}`);
        console.log(`Branches:    ${branchInputs.map((b) => b.branch).join(', ')}`);
        console.log(`Batch/Year:  ${scope.batch} · Y${scope.yearOfStudy} / S${scope.semester}`);
        console.log(`Regulation:  ${regulation.code} (id ${regulation.id})`);
        console.log(`Exam:        #${exam.id} ${(exam.allowedTypes ?? [exam.type]).join(' + ')}`);
        console.log(`Demo PIN:    ${roll} (${student.studentName})`);
        console.log('             Regular applied+paid in seed; open Supply on the same exam to apply again.');
        console.log('Staff:       Dashboard → Examinations → View (analytics)');
        console.log('================================');
    }
    finally {
        await studentDs.destroy().catch(() => undefined);
        await examDs.destroy().catch(() => undefined);
    }
}
main().catch((err) => {
    console.error('\nFAILED:', err);
    process.exit(1);
});
