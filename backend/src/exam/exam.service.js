'use strict';

const { createHmac, timingSafeEqual } = require('crypto');
const Razorpay = require('razorpay');
const { AppError } = require('../common/errors');
const { config } = require('../config');
const { operationLogger } = require('../common/logger');
const { hasPrivilege } = require('../auth/permissions');
const {
    ExamStatus,
    ExamType,
    FeeStatus,
    PaymentMethod,
    PaymentMode,
    PaymentStatus,
    UPI_CONVENIENCE_FEE_RATE,
} = require('./schemas/exam.enums');
const log = operationLogger('examinations');

class ExamService {
    constructor(examRepo, examSubjectRepo, feeRecordRepo, paymentRepo, examScopeRepo, applicationRepo, subjectResultRepo, subjectsService, regulationsService, sdms, settings, feeManagement) {
        this.examRepo = examRepo;
        this.examSubjectRepo = examSubjectRepo;
        this.feeRecordRepo = feeRecordRepo;
        this.paymentRepo = paymentRepo;
        this.examScopeRepo = examScopeRepo;
        this.applicationRepo = applicationRepo;
        this.subjectResultRepo = subjectResultRepo;
        // EntitySchema entities are not constructible classes; use a repo to
        // instantiate late-fee slab rows.
        this.lateFeeSlabRepo = examRepo.manager.getRepository('LateFeeSlab');
        this.subjectsService = subjectsService;
        this.regulationsService = regulationsService;
        this.sdms = sdms;
        this.settings = settings;
        this.feeManagement = feeManagement;
        this.feeRecordRelations = [
            'exam',
            'exam.lateFeeSlabs',
            'exam.examSubjects',
            'exam.examSubjects.subject',
            'payments',
        ];
    }
    parseGateway(raw) {
        if (!raw)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async getRazorpayClient() {
        const cfg = await this.settings.getRazorpayConfig();
        return {
            cfg,
            client: new Razorpay({
                key_id: cfg.keyId,
                key_secret: cfg.keySecret,
            }),
        };
    }
    safeEqualHex(a, b) {
        const ba = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ba.length !== bb.length)
            return false;
        return timingSafeEqual(ba, bb);
    }
    roundMoney(amount) {
        return Math.round(Number(amount) * 100) / 100;
    }
    applyUpiConvenienceFee(baseAmount, paymentMethod) {
        const base = this.roundMoney(baseAmount);
        const isUpi = (paymentMethod ?? PaymentMethod.UPI) === PaymentMethod.UPI;
        if (!isUpi) {
            return {
                base,
                convenienceFee: 0,
                total: base,
                applies: false,
                rate: 0,
            };
        }
        const convenienceFee = this.roundMoney(base * UPI_CONVENIENCE_FEE_RATE);
        const total = this.roundMoney(base + convenienceFee);
        return {
            base,
            convenienceFee,
            total,
            applies: true,
            rate: UPI_CONVENIENCE_FEE_RATE,
        };
    }
    isExamFeeLine(gw) {
        return !gw?.lineType || gw.lineType === 'exam_fee';
    }
    async getLinkedPayment(paymentId) {
        if (!paymentId)
            return null;
        return this.paymentRepo.findOne({ where: { id: paymentId } });
    }
    async validateExamSubjects(regulationId, course, branch, batch, yearOfStudy, semester, subjectFees) {
        const mapped = await this.subjectsService.getMappedSubjectsForExam({
            regulationId,
            course,
            branch,
            batch,
            yearOfStudy,
            semester,
        });
        const mappedIds = new Set(mapped.map((s) => s.id));
        for (const sf of subjectFees) {
            if (!mappedIds.has(sf.subjectId)) {
                throw AppError.badRequest(`Subject ${sf.subjectId} is not mapped for this academic scope`);
            }
        }
    }
    /**
     * Subjects may be grouped per branch (and optionally per section):
     * - entries carrying a `branch` validate against that branch's mappings;
     * - entries also carrying a `section` validate against mappings that
     *   apply to that section (mapped to all sections or listing it);
     * - entries without a branch are common papers and must be mapped for
     *   every branch in the exam scope.
     */
    async validateExamSubjectsPerBranch(regulationId, course, branches, batch, yearOfStudy, semester, subjectFees) {
        const branchSet = new Set(branches.map((b) => b.trim().toLowerCase()));
        const common = [];
        const byBranch = new Map();
        for (const sf of subjectFees) {
            const branch = (sf.branch ?? '').trim();
            if (!branch) {
                common.push(sf);
                continue;
            }
            if (!branchSet.has(branch.toLowerCase())) {
                throw AppError.badRequest(`Subject ${sf.subjectId} is grouped under branch "${branch}", which is not in the exam scope`);
            }
            const list = byBranch.get(branch) ?? [];
            list.push(sf);
            byBranch.set(branch, list);
        }
        for (const branch of branches) {
            const own = byBranch.get(branch) ?? [];
            const toCheck = [...own, ...common];
            if (toCheck.length === 0) {
                throw AppError.badRequest(`No subjects selected for branch "${branch}" — every branch in scope needs at least one paper`);
            }
            const entries = await this.subjectsService.getMappedSubjectEntriesForExam({
                regulationId,
                course,
                branch,
                batch,
                yearOfStudy,
                semester,
            });
            const allMappedIds = new Set(entries.map((e) => e.subjectId));
            const idsForSection = (section) => {
                const wanted = section.trim().toLowerCase();
                return new Set(entries
                    .filter((e) => e.sectionMode !== 'selected' ||
                    (e.sections ?? []).some((x) => x.trim().toLowerCase() === wanted))
                    .map((e) => e.subjectId));
            };
            const sectionIdCache = new Map();
            for (const sf of toCheck) {
                const section = (sf.section ?? '').trim();
                if (!section || !(sf.branch ?? '').trim()) {
                    if (!allMappedIds.has(sf.subjectId)) {
                        throw AppError.badRequest(`Subject ${sf.subjectId} is not mapped for ${branch} in this academic scope`);
                    }
                    continue;
                }
                const key = section.toLowerCase();
                if (!sectionIdCache.has(key)) {
                    sectionIdCache.set(key, idsForSection(section));
                }
                if (!sectionIdCache.get(key).has(sf.subjectId)) {
                    throw AppError.badRequest(`Subject ${sf.subjectId} is not mapped for ${branch} section ${section} in this academic scope`);
                }
            }
        }
    }
    validateDates(dto) {
        if (dto.applicationEndDate &&
            dto.examinationStartDate &&
            dto.applicationEndDate >= dto.examinationStartDate) {
            throw AppError.badRequest('Application end date must be earlier than examination start date');
        }
        if (dto.examinationStartDate &&
            dto.examinationEndDate &&
            dto.examinationStartDate > dto.examinationEndDate) {
            throw AppError.badRequest('Examination start date cannot be after end date');
        }
    }
    normalizeSubjectFees(subjects) {
        if (!subjects?.length) {
            throw AppError.badRequest('Select at least one subject');
        }
        const timeToMinutes = (value) => {
            const [h, m] = value.split(':').map((x) => parseInt(x, 10));
            return h * 60 + m;
        };
        return subjects.map((s) => {
            const examDate = (s.examDate ?? '').trim();
            if (!examDate) {
                throw AppError.badRequest(`Exam date is required for subject ${s.subjectId}`);
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
                throw AppError.badRequest(`Invalid exam date for subject ${s.subjectId} (use YYYY-MM-DD)`);
            }
            const branch = (s.branch ?? '').trim() || null;
            const section = (s.section ?? '').trim() || null;
            if (section && !branch) {
                throw AppError.badRequest(`Subject ${s.subjectId} has a section but no branch — section-specific papers must be grouped under a branch`);
            }
            let session = (s.session ?? '').trim().toUpperCase() || null;
            if (session && session !== 'FN' && session !== 'AN') {
                throw AppError.badRequest(`Session for subject ${s.subjectId} must be FN (forenoon) or AN (afternoon)`);
            }
            const startTime = (s.startTime ?? '').trim() || null;
            const endTime = (s.endTime ?? '').trim() || null;
            for (const [label, value] of [['start', startTime], ['end', endTime]]) {
                if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
                    throw AppError.badRequest(`Invalid ${label} time for subject ${s.subjectId} (use HH:MM, 24-hour)`);
                }
            }
            let durationMinutes = s.durationMinutes != null && s.durationMinutes !== ''
                ? parseInt(String(s.durationMinutes), 10)
                : null;
            if (durationMinutes != null && (Number.isNaN(durationMinutes) || durationMinutes <= 0)) {
                throw AppError.badRequest(`Duration for subject ${s.subjectId} must be a positive number of minutes`);
            }
            if (startTime && endTime) {
                const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
                if (diff <= 0) {
                    throw AppError.badRequest(`End time must be after start time for subject ${s.subjectId}`);
                }
                if (durationMinutes == null)
                    durationMinutes = diff;
            }
            if (!session && startTime) {
                session = timeToMinutes(startTime) < 12 * 60 ? 'FN' : 'AN';
            }
            return {
                ...s,
                fee: Number.isFinite(Number(s.fee)) && Number(s.fee) >= 0 ? Number(s.fee) : 0,
                examDate,
                branch,
                section,
                session,
                startTime,
                endTime,
                durationMinutes,
            };
        });
    }
    /**
     * Normalizes branch/section-wise package fees:
     * [{ branch, section|null, amount }]. Branch must be in the exam scope.
     */
    normalizePackageFees(packageFees, branches) {
        if (!packageFees)
            return null;
        if (!Array.isArray(packageFees)) {
            throw AppError.badRequest('packageFees must be an array');
        }
        const branchSet = new Set(branches.map((b) => b.trim().toLowerCase()));
        const seen = new Set();
        const rows = [];
        for (const pf of packageFees) {
            const branch = (pf.branch ?? '').trim();
            if (!branch) {
                throw AppError.badRequest('Each package fee needs a branch');
            }
            if (!branchSet.has(branch.toLowerCase())) {
                throw AppError.badRequest(`Package fee branch "${branch}" is not in the exam scope`);
            }
            const section = (pf.section ?? '').trim() || null;
            const amount = Number(pf.amount);
            if (Number.isNaN(amount) || amount < 0) {
                throw AppError.badRequest(`Package fee for ${branch}${section ? ` / ${section}` : ''} must be a non-negative number`);
            }
            const key = `${branch.toLowerCase()}|${(section ?? '').toLowerCase()}`;
            if (seen.has(key)) {
                throw AppError.badRequest(`Duplicate package fee for ${branch}${section ? ` / ${section}` : ''}`);
            }
            seen.add(key);
            rows.push({ branch, section, amount });
        }
        return rows.length ? rows : null;
    }
    /**
     * Package fee applicable to a student: section-specific first, then
     * branch-wide, then the exam-level default.
     */
    packageFeeForScope(exam, branch, section) {
        const fees = Array.isArray(exam.packageFees) ? exam.packageFees : [];
        const b = (branch ?? '').trim().toLowerCase();
        const s = (section ?? '').trim().toLowerCase();
        if (b && s) {
            const exact = fees.find((f) => (f.branch ?? '').trim().toLowerCase() === b &&
                (f.section ?? '').trim().toLowerCase() === s);
            if (exact)
                return Number(exact.amount);
        }
        if (b) {
            const branchWide = fees.find((f) => (f.branch ?? '').trim().toLowerCase() === b && !f.section);
            if (branchWide)
                return Number(branchWide.amount);
        }
        return exam.packageFee != null ? Number(exam.packageFee) : null;
    }
    /** Supply / improvement / special_supply use count-tier fees + subject pick. */
    isCountBasedExamType(examType) {
        return (examType === ExamType.SUPPLY ||
            examType === ExamType.IMPROVEMENT ||
            examType === ExamType.SPECIAL_SUPPLY);
    }
    /**
     * Normalizes default supply fee tiers: [feeFor1, feeFor2, ...].
     * When requiredLength is set, the array must match that length.
     */
    normalizeSupplyFeeByCount(raw, { required = false, requiredLength } = {}) {
        if (raw == null || raw === '') {
            if (required) {
                throw AppError.badRequest('Supply fee schedule (by subject count) is required');
            }
            return null;
        }
        if (!Array.isArray(raw)) {
            throw AppError.badRequest('supplyFeeByCount must be an array');
        }
        if (raw.length === 0) {
            if (required) {
                throw AppError.badRequest('Supply fee schedule must include at least one tier');
            }
            return null;
        }
        if (requiredLength != null && raw.length !== requiredLength) {
            throw AppError.badRequest(`Supply fee schedule must have exactly ${requiredLength} tier(s) (1…${requiredLength} subjects)`);
        }
        const fees = raw.map((value, index) => {
            const amount = Number(value);
            if (Number.isNaN(amount) || amount < 0) {
                throw AppError.badRequest(`Supply fee for ${index + 1} subject(s) must be a non-negative number`);
            }
            return amount;
        });
        return fees;
    }
    /**
     * Normalizes per-branch supply fee overrides:
     * [{ branch, feesByCount: number[] }].
     */
    normalizeSupplyFeesByBranch(raw, branches, { defaultLength } = {}) {
        if (raw == null || raw === '')
            return null;
        if (!Array.isArray(raw)) {
            throw AppError.badRequest('supplyFeesByBranch must be an array');
        }
        const branchSet = new Set(branches.map((b) => b.trim().toLowerCase()));
        const seen = new Set();
        const rows = [];
        for (const entry of raw) {
            const branch = (entry?.branch ?? '').trim();
            if (!branch) {
                throw AppError.badRequest('Each supply fee branch override needs a branch');
            }
            if (!branchSet.has(branch.toLowerCase())) {
                throw AppError.badRequest(`Supply fee branch "${branch}" is not in the exam scope`);
            }
            const key = branch.toLowerCase();
            if (seen.has(key)) {
                throw AppError.badRequest(`Duplicate supply fee schedule for branch ${branch}`);
            }
            seen.add(key);
            const feesByCount = this.normalizeSupplyFeeByCount(entry.feesByCount, {
                required: true,
                requiredLength: defaultLength,
            });
            rows.push({ branch, feesByCount });
        }
        return rows.length ? rows : null;
    }
    /**
     * Supply fee tiers for a student's branch: branch override → exam default.
     */
    supplyFeeForScope(exam, branch) {
        const overrides = Array.isArray(exam.supplyFeesByBranch)
            ? exam.supplyFeesByBranch
            : [];
        const b = (branch ?? '').trim().toLowerCase();
        if (b) {
            const match = overrides.find((f) => (f.branch ?? '').trim().toLowerCase() === b);
            if (match && Array.isArray(match.feesByCount) && match.feesByCount.length > 0) {
                return match.feesByCount.map((n) => Number(n));
            }
        }
        if (Array.isArray(exam.supplyFeeByCount) && exam.supplyFeeByCount.length > 0) {
            return exam.supplyFeeByCount.map((n) => Number(n));
        }
        return null;
    }
    maxSubjectCountAcrossBranches(examSubjects, branches) {
        let max = 0;
        for (const branch of branches) {
            const ids = new Set(this.examSubjectsForBranch({ examSubjects }, branch, null).map((es) => es.subjectId));
            if (ids.size > max)
                max = ids.size;
        }
        if (max === 0 && Array.isArray(examSubjects)) {
            max = new Set(examSubjects.map((es) => es.subjectId)).size;
        }
        return max;
    }
    /** Supply tiers cover 1 … (N − 1) papers; N = max papers on the exam. */
    supplyTierCountFromMaxPapers(maxPapers) {
        const n = Number(maxPapers) || 0;
        if (n <= 0)
            return 0;
        if (n === 1)
            return 1;
        return n - 1;
    }
    assertSubjectDatesInWindow(subjects, examinationStartDate, examinationEndDate) {
        for (const s of subjects) {
            if (examinationStartDate && s.examDate < examinationStartDate) {
                throw AppError.badRequest(`Subject ${s.subjectId} exam date is before examination start`);
            }
            if (examinationEndDate && s.examDate > examinationEndDate) {
                throw AppError.badRequest(`Subject ${s.subjectId} exam date is after examination end`);
            }
        }
    }
    resolveCreateTypes(dto) {
        const fromList = (dto.types ?? []).filter(Boolean);
        if (fromList.length > 0) {
            return [...new Set(fromList)];
        }
        return [dto.type ?? ExamType.REGULAR];
    }
    getAllowedTypes(exam) {
        const raw = exam.allowedTypes;
        if (Array.isArray(raw) && raw.length > 0) {
            return [...new Set(raw.filter(Boolean))];
        }
        return [exam.type ?? ExamType.REGULAR];
    }
    resolveEnrollmentType(allowed, requested) {
        if (requested) {
            if (!allowed.includes(requested)) {
                throw AppError.badRequest(`This examination does not allow enrollment as ${this.typeLabel(requested)} for this student`);
            }
            return requested;
        }
        if (allowed.length === 1)
            return allowed[0];
        throw AppError.badRequest('Select whether you are applying for Regular or Supply');
    }
    resolveCreateScopes(dto) {
        if (dto.scopes?.length) {
            return dto.scopes.filter((s) => s.branch?.trim());
        }
        if (dto.branch?.trim()) {
            return [{ branch: dto.branch.trim() }];
        }
        throw AppError.badRequest('Select at least one branch');
    }
    expandScopeRows(dto, scopeInputs) {
        const rows = [];
        for (const s of scopeInputs) {
            const branch = s.branch.trim();
            const sections = (s.sections ?? [])
                .map((x) => x.trim())
                .filter(Boolean);
            if (sections.length === 0) {
                rows.push({
                    college: dto.college,
                    course: dto.course,
                    branch,
                    branchId: s.branchId ?? null,
                    batch: dto.batch,
                    yearOfStudy: dto.yearOfStudy,
                    semester: dto.semester,
                    section: null,
                });
            }
            else {
                for (const section of sections) {
                    rows.push({
                        college: dto.college,
                        course: dto.course,
                        branch,
                        branchId: s.branchId ?? null,
                        batch: dto.batch,
                        yearOfStudy: dto.yearOfStudy,
                        semester: dto.semester,
                        section,
                    });
                }
            }
        }
        if (rows.length === 0) {
            throw AppError.badRequest('Select at least one branch');
        }
        return rows;
    }
    typeLabel(type) {
        return String(type).replace(/_/g, ' ');
    }
    async create(dto) {
        if (!dto.college?.trim()) {
            throw AppError.badRequest('College is required');
        }
        await this.regulationsService.findOne(dto.regulationId);
        const allowedTypes = this.resolveCreateTypes(dto);
        if (allowedTypes.length === 0) {
            throw AppError.badRequest('Select at least one exam type');
        }
        const scopeInputs = this.resolveCreateScopes(dto);
        const scopeRows = this.expandScopeRows(dto, scopeInputs);
        const uniqueBranches = [...new Set(scopeRows.map((r) => r.branch))];
        await this.validateExamSubjectsPerBranch(dto.regulationId, dto.course, uniqueBranches, dto.batch, dto.yearOfStudy, dto.semester, dto.subjects);
        this.validateDates(dto);
        const subjectFees = this.normalizeSubjectFees(dto.subjects);
        this.assertSubjectDatesInWindow(subjectFees, dto.examinationStartDate, dto.examinationEndDate);
        const allowsRegular = allowedTypes.includes(ExamType.REGULAR);
        const allowsSupply = allowedTypes.some((t) => this.isCountBasedExamType(t));
        const packageFees = this.normalizePackageFees(dto.packageFees, uniqueBranches);
        const packageFee = dto.packageFee != null && dto.packageFee !== ''
            ? Number(dto.packageFee)
            : null;
        if (allowsRegular) {
            const hasDefault = packageFee != null && !Number.isNaN(packageFee) && packageFee >= 0;
            const hasScoped = Array.isArray(packageFees) && packageFees.length > 0;
            if (!hasDefault && !hasScoped) {
                throw AppError.badRequest('Package fee is required when Regular enrollment is allowed');
            }
        }
        const maxSupplyTiers = this.supplyTierCountFromMaxPapers(this.maxSubjectCountAcrossBranches(subjectFees.map((s) => ({
            ...s,
            subjectId: s.subjectId,
        })), uniqueBranches));
        const supplyFeeByCount = this.normalizeSupplyFeeByCount(dto.supplyFeeByCount, {
            required: allowsSupply,
            requiredLength: allowsSupply ? Math.max(maxSupplyTiers, 1) : undefined,
        });
        const supplyFeesByBranch = allowsSupply
            ? this.normalizeSupplyFeesByBranch(dto.supplyFeesByBranch, uniqueBranches, {
                defaultLength: supplyFeeByCount?.length,
            })
            : null;
        const primaryBranch = scopeRows[0].branch;
        const branchSummary = uniqueBranches.length === 1
            ? uniqueBranches[0]
            : uniqueBranches.join(', ');
        const exam = this.examRepo.create({
            name: dto.name.trim(),
            type: allowedTypes[0],
            allowedTypes,
            regulationId: dto.regulationId,
            college: dto.college,
            course: dto.course,
            branch: branchSummary.slice(0, 100) || primaryBranch,
            batch: dto.batch,
            yearOfStudy: dto.yearOfStudy,
            semester: dto.semester,
            packageFee,
            packageFees,
            supplyFeeByCount,
            supplyFeesByBranch,
            examinationStartDate: dto.examinationStartDate,
            examinationEndDate: dto.examinationEndDate,
            applicationStartDate: dto.applicationStartDate,
            applicationEndDate: dto.applicationEndDate,
            lateFeeStartDate: dto.lateFeeStartDate,
            instructions: dto.instructions,
            status: dto.submitForApproval
                ? ExamStatus.PENDING_APPROVAL
                : ExamStatus.DRAFT,
            hallTicketsReleasedAt: null,
            examSubjects: subjectFees.map((s) => this.examSubjectRepo.create({
                subjectId: s.subjectId,
                branch: s.branch,
                section: s.section,
                fee: s.fee,
                examDate: s.examDate,
                session: s.session,
                startTime: s.startTime,
                endTime: s.endTime,
                durationMinutes: s.durationMinutes,
            })),
            lateFeeSlabs: this.normalizeLateFeeSlabs(dto.lateFeeSlabs ?? []).map((slab) => this.lateFeeSlabRepo.create({ ...slab })),
            scopes: scopeRows.map((row) => this.examScopeRepo.create({ ...row })),
        });
        return this.examRepo.save(exam);
    }
    findAll(status) {
        const where = status ? { status } : {};
        return this.examRepo.find({ where, order: { createdAt: 'DESC' } });
    }
    async findOne(id) {
        const exam = await this.examRepo.findOne({ where: { id } });
        if (!exam)
            throw AppError.notFound('Examination not found');
        return exam;
    }
    async update(id, dto) {
        const exam = await this.findOne(id);
        if (exam.status !== ExamStatus.DRAFT &&
            exam.status !== ExamStatus.REJECTED) {
            throw AppError.badRequest('Only draft or rejected examinations can be updated');
        }
        if (dto.subjects) {
            const branch = dto.branch ??
                exam.scopes?.[0]?.branch ??
                exam.branch;
            const branches = dto.scopes?.map((s) => s.branch).filter(Boolean) ??
                (exam.scopes?.length
                    ? [...new Set(exam.scopes.map((s) => s.branch))]
                    : [branch]);
            await this.validateExamSubjectsPerBranch(dto.regulationId ?? exam.regulationId, dto.course ?? exam.course, branches, dto.batch ?? exam.batch, dto.yearOfStudy ?? exam.yearOfStudy, dto.semester ?? exam.semester, dto.subjects);
            await this.examSubjectRepo.delete({ examId: id });
            const subjectFees = this.normalizeSubjectFees(dto.subjects);
            this.assertSubjectDatesInWindow(subjectFees, dto.examinationStartDate ?? exam.examinationStartDate, dto.examinationEndDate ?? exam.examinationEndDate);
            exam.examSubjects = subjectFees.map((s) => this.examSubjectRepo.create({
                examId: id,
                subjectId: s.subjectId,
                branch: s.branch,
                section: s.section,
                fee: s.fee,
                examDate: s.examDate,
                session: s.session,
                startTime: s.startTime,
                endTime: s.endTime,
                durationMinutes: s.durationMinutes,
            }));
        }
        if (dto.scopes?.length) {
            await this.examScopeRepo.delete({ examId: id });
            const scopeRows = this.expandScopeRows({
                ...dto,
                college: dto.college ?? exam.college ?? '',
                course: dto.course ?? exam.course,
                batch: dto.batch ?? exam.batch,
                yearOfStudy: dto.yearOfStudy ?? exam.yearOfStudy,
                semester: dto.semester ?? exam.semester,
                regulationId: dto.regulationId ?? exam.regulationId,
                name: dto.name ?? exam.name,
                subjects: dto.subjects ?? [],
            }, dto.scopes);
            exam.scopes = scopeRows.map((row) => this.examScopeRepo.create({ ...row, examId: id }));
            const uniqueBranches = [...new Set(scopeRows.map((r) => r.branch))];
            exam.branch =
                uniqueBranches.length === 1
                    ? uniqueBranches[0]
                    : uniqueBranches.join(', ').slice(0, 100);
        }
        if (dto.lateFeeSlabs) {
            await this.lateFeeSlabRepo.delete({ examId: id });
            exam.lateFeeSlabs = this.normalizeLateFeeSlabs(dto.lateFeeSlabs).map((slab) => this.lateFeeSlabRepo.create({ ...slab, examId: id }));
        }
        this.validateDates({
            applicationEndDate: dto.applicationEndDate ?? exam.applicationEndDate,
            examinationStartDate: dto.examinationStartDate ?? exam.examinationStartDate,
            examinationEndDate: dto.examinationEndDate ?? exam.examinationEndDate,
        });
        if (dto.types?.length || dto.type) {
            const allowed = this.resolveCreateTypes({
                name: exam.name,
                regulationId: exam.regulationId,
                college: exam.college ?? '',
                course: exam.course,
                batch: exam.batch,
                yearOfStudy: exam.yearOfStudy,
                semester: exam.semester,
                subjects: [],
                type: dto.type,
                types: dto.types,
            });
            exam.allowedTypes = allowed;
            exam.type = allowed[0];
        }
        const nextAllowed = this.getAllowedTypes(exam);
        const scopeBranches = exam.scopes?.length
            ? [...new Set(exam.scopes.map((s) => s.branch))]
            : [exam.branch];
        const nextPackageFees = dto.packageFees !== undefined
            ? this.normalizePackageFees(dto.packageFees, scopeBranches)
            : exam.packageFees;
        const nextPackageFee = dto.packageFee !== undefined
            ? (dto.packageFee != null && dto.packageFee !== ''
                ? Number(dto.packageFee)
                : null)
            : exam.packageFee;
        if (nextAllowed.includes(ExamType.REGULAR)) {
            const hasDefault = nextPackageFee != null &&
                !Number.isNaN(Number(nextPackageFee)) &&
                Number(nextPackageFee) >= 0;
            const hasScoped = Array.isArray(nextPackageFees) && nextPackageFees.length > 0;
            if (!hasDefault && !hasScoped) {
                throw AppError.badRequest('Package fee is required when Regular enrollment is allowed');
            }
        }
        let nextSupplyFeeByCount = exam.supplyFeeByCount;
        let nextSupplyFeesByBranch = exam.supplyFeesByBranch;
        const allowsSupply = nextAllowed.some((t) => this.isCountBasedExamType(t));
        if (dto.supplyFeeByCount !== undefined ||
            dto.supplyFeesByBranch !== undefined ||
            allowsSupply) {
            const maxSupplyTiers = this.supplyTierCountFromMaxPapers(this.maxSubjectCountAcrossBranches(exam.examSubjects, scopeBranches));
            nextSupplyFeeByCount = this.normalizeSupplyFeeByCount(dto.supplyFeeByCount !== undefined
                ? dto.supplyFeeByCount
                : exam.supplyFeeByCount, {
                required: allowsSupply,
                requiredLength: allowsSupply ? Math.max(maxSupplyTiers, 1) : undefined,
            });
            nextSupplyFeesByBranch = this.normalizeSupplyFeesByBranch(dto.supplyFeesByBranch !== undefined
                ? dto.supplyFeesByBranch
                : exam.supplyFeesByBranch, scopeBranches, {
                defaultLength: nextSupplyFeeByCount?.length,
            });
        }
        if (!allowsSupply) {
            nextSupplyFeeByCount = null;
            nextSupplyFeesByBranch = null;
        }
        Object.assign(exam, {
            name: dto.name ?? exam.name,
            type: exam.type,
            regulationId: dto.regulationId ?? exam.regulationId,
            college: dto.college ?? exam.college,
            course: dto.course ?? exam.course,
            branch: dto.branch ?? exam.branch,
            batch: dto.batch ?? exam.batch,
            yearOfStudy: dto.yearOfStudy ?? exam.yearOfStudy,
            semester: dto.semester ?? exam.semester,
            packageFee: nextPackageFee,
            packageFees: nextPackageFees,
            supplyFeeByCount: nextSupplyFeeByCount,
            supplyFeesByBranch: nextSupplyFeesByBranch,
            examinationStartDate: dto.examinationStartDate ?? exam.examinationStartDate,
            examinationEndDate: dto.examinationEndDate ?? exam.examinationEndDate,
            applicationStartDate: dto.applicationStartDate ?? exam.applicationStartDate,
            applicationEndDate: dto.applicationEndDate ?? exam.applicationEndDate,
            lateFeeStartDate: dto.lateFeeStartDate ?? exam.lateFeeStartDate,
            instructions: dto.instructions ?? exam.instructions,
            rejectionRemarks: null,
            status: dto.submitForApproval === true
                ? ExamStatus.PENDING_APPROVAL
                : exam.status === ExamStatus.REJECTED
                    ? ExamStatus.DRAFT
                    : exam.status,
        });
        return this.examRepo.save(exam);
    }
    async submitForApproval(id) {
        const exam = await this.findOne(id);
        if (exam.status !== ExamStatus.DRAFT && exam.status !== ExamStatus.REJECTED) {
            throw AppError.badRequest('Examination cannot be submitted');
        }
        if (!exam.examSubjects?.length) {
            throw AppError.badRequest('At least one subject is required');
        }
        exam.status = ExamStatus.PENDING_APPROVAL;
        exam.rejectionRemarks = null;
        return this.examRepo.save(exam);
    }
    async approve(id, approverName) {
        const exam = await this.findOne(id);
        if (exam.status !== ExamStatus.PENDING_APPROVAL) {
            throw AppError.badRequest('Examination is not pending approval');
        }
        exam.status = ExamStatus.APPROVED;
        exam.approvedBy = approverName;
        exam.approvedAt = new Date();
        exam.rejectionRemarks = null;
        return this.examRepo.save(exam);
    }
    async reject(id, dto) {
        const exam = await this.findOne(id);
        if (exam.status !== ExamStatus.PENDING_APPROVAL) {
            throw AppError.badRequest('Examination is not pending approval');
        }
        exam.status = ExamStatus.REJECTED;
        exam.rejectionRemarks = dto.remarks;
        return this.examRepo.save(exam);
    }
    async publish(id, _dto, actor) {
        const exam = await this.findOne(id);
        if (exam.status !== ExamStatus.APPROVED) {
            throw AppError.badRequest('Only approved examinations can be published');
        }
        const missingDates = (exam.examSubjects ?? []).filter((es) => !es.examDate);
        if (missingDates.length) {
            throw AppError.badRequest('Set an exam date for every subject before publishing');
        }
        exam.status = ExamStatus.PUBLISHED;
        exam.publishedAt = new Date();
        await this.examRepo.save(exam);
        const publishedExam = await this.findOne(id);
        // Create SDMS timeline events for scoped students (admin calendar).
        // Don't block publication if SDMS is temporarily unreachable.
        try {
            await this.sdms.createOrReplaceExamEventsForPublishedExam(publishedExam, actor);
        }
        catch (err) {
            log.error({ err, examId: id }, 'Failed to create SDMS exam events');
        }
        // Due clearance snapshot for eligible students (does not block publish).
        let dueSummary = null;
        try {
            const eligible = await this.listEligibleStudents(id);
            dueSummary = eligible.dueSummary ?? null;
        }
        catch (err) {
            log.error({ err, examId: id }, 'Failed to compute due clearance on publish');
        }
        return Object.assign(publishedExam, { dueSummary });
    }
    async releaseHallTickets(id) {
        const exam = await this.findOne(id);
        if (exam.status !== ExamStatus.PUBLISHED) {
            throw AppError.badRequest('Only published examinations can release hall tickets');
        }
        const missingDates = (exam.examSubjects ?? []).filter((es) => !es.examDate);
        if (missingDates.length) {
            throw AppError.badRequest('Every subject must have an exam date before releasing hall tickets');
        }
        if (!exam.hallTicketsReleasedAt) {
            exam.hallTicketsReleasedAt = new Date();
            await this.examRepo.save(exam);
        }
        return this.findOne(id);
    }
    async resolveExamCollege(exam) {
        if (exam.college?.trim())
            return exam.college.trim();
        try {
            const regulation = await this.regulationsService.findOne(exam.regulationId);
            const scopes = regulation.scopes ?? [];
            const match = scopes.find((s) => s.courseName === exam.course &&
                (s.batch === exam.batch || !exam.batch));
            if (match?.collegeName)
                return match.collegeName;
            const byCourse = scopes.find((s) => s.courseName === exam.course);
            if (byCourse?.collegeName)
                return byCourse.collegeName;
        }
        catch {
        }
        throw AppError.badRequest('Exam has no college set. Edit the examination and select a college before publishing.');
    }
    canOverrideDues(actor) {
        if (!actor) return false;
        if (actor.isSuperAdmin) return true;
        return hasPrivilege(actor.privileges, 'fees:due_override');
    }
    async isExamDueRestrictionEnabled() {
        if (!this.settings?.isExamDueRestrictionEnabled) return true;
        try {
            return await this.settings.isExamDueRestrictionEnabled();
        }
        catch {
            return true;
        }
    }
    async getDueClearanceForStudent(student) {
        const restrictionEnabled = await this.isExamDueRestrictionEnabled();
        const applyRestriction = (due) => {
            const hasOverdue = Boolean(due?.blocked);
            return {
                ...due,
                hasOverdue,
                restrictionEnabled,
                // canApply respects the Settings toggle; blocked still means overdue exists
                canApply: !restrictionEnabled || !hasOverdue,
                blocked: hasOverdue,
            };
        };
        if (!this.feeManagement?.getStudentDueClearance) {
            return applyRestriction({
                blocked: false,
                canApply: true,
                asOfDate: new Date().toISOString().slice(0, 10),
                totalDue: 0,
                currency: 'INR',
                byHead: [],
                byTerm: [],
                message: 'Due check unavailable.',
                verification: { matched: true, notes: [] },
                skipped: true,
                reason: 'fee_management_service_missing',
            });
        }
        try {
            const due = await this.feeManagement.getStudentDueClearance(student);
            return applyRestriction(due);
        }
        catch (err) {
            log.error({ err, studentId: student?.id }, 'Fee due clearance check failed');
            return applyRestriction({
                blocked: false,
                canApply: true,
                asOfDate: new Date().toISOString().slice(0, 10),
                totalDue: 0,
                currency: 'INR',
                byHead: [],
                byTerm: [],
                message: 'Due check failed; treating as clear.',
                verification: { matched: true, notes: [] },
                skipped: true,
                reason: 'due_check_failed',
            });
        }
    }
    async assertNoOverdueDues(student, { overrideDues = false, actor = null } = {}) {
        const dueClearance = await this.getDueClearanceForStudent(student);
        if (!dueClearance.restrictionEnabled) {
            return { ...dueClearance, canApply: true };
        }
        if (!dueClearance.hasOverdue && !dueClearance.blocked) {
            return dueClearance;
        }
        if (dueClearance.blocked || dueClearance.hasOverdue) {
            if (overrideDues && this.canOverrideDues(actor)) {
                return { ...dueClearance, overridden: true, canApply: true };
            }
            throw AppError.badRequest(dueClearance.message || 'Clear all overdue fee dues before continuing.');
        }
        return dueClearance;
    }
    summarizeDueClearance(studentsWithDue) {
        let blockedCount = 0;
        let clearCount = 0;
        let skippedCount = 0;
        let totalOverdue = 0;
        for (const row of studentsWithDue) {
            const d = row.dueClearance;
            if (!d || d.skipped) {
                skippedCount += 1;
                continue;
            }
            if (d.blocked) {
                blockedCount += 1;
                totalOverdue += Number(d.totalDue) || 0;
            }
            else {
                clearCount += 1;
            }
        }
        return {
            asOfDate: new Date().toISOString().slice(0, 10),
            eligible: studentsWithDue.length,
            clearCount,
            blockedCount,
            skippedCount,
            totalOverdueAmount: Math.round(totalOverdue * 100) / 100,
        };
    }
    async listEligibleStudents(examId) {
        const exam = await this.findOne(examId);
        const college = await this.resolveExamCollege(exam);
        const scopes = exam.scopes?.length > 0
            ? exam.scopes.map((s) => ({
                college: s.college,
                course: s.course,
                branch: s.branch,
                branchId: s.branchId,
                batch: s.batch,
                yearOfStudy: s.yearOfStudy,
                semester: s.semester,
                section: s.section,
            }))
            : [
                {
                    college: exam.college,
                    course: exam.course,
                    branch: exam.branch,
                    branchId: null,
                    batch: exam.batch,
                    yearOfStudy: exam.yearOfStudy,
                    semester: exam.semester,
                    section: null,
                },
            ];
        const byRoll = new Map();
        // Backlog-style exams (supply etc.) are also open to students who have
        // moved past the scoped semester, so widen the SDMS query and filter here.
        const includeAhead = this.getAllowedTypes(exam).some((t) => t !== ExamType.REGULAR);
        const fetchForScope = async (scope) => {
            let page = 1;
            let totalPages = 1;
            do {
                const result = await this.sdms.listStudents({
                    college,
                    course: scope.course || exam.course,
                    branch: scope.branch,
                    batch: scope.batch || exam.batch,
                    currentYear: includeAhead ? undefined : scope.yearOfStudy,
                    currentSemester: includeAhead ? undefined : scope.semester,
                    section: includeAhead ? undefined : scope.section || undefined,
                    page,
                    limit: 200,
                });
                totalPages = result.totalPages;
                for (const s of result.items) {
                    if (includeAhead) {
                        const year = Number(s.currentYear);
                        const sem = Number(s.currentSemester);
                        const scopeYear = Number(scope.yearOfStudy);
                        const scopeSem = Number(scope.semester);
                        const exact = year === scopeYear && sem === scopeSem;
                        const ahead = year > scopeYear ||
                            (year === scopeYear && sem > scopeSem);
                        if (!exact && !ahead)
                            continue;
                        if (exact &&
                            scope.section &&
                            (s.section ?? '').trim().toLowerCase() !==
                                scope.section.trim().toLowerCase()) {
                            continue;
                        }
                    }
                    const roll = (s.pinNo || s.admissionNumber || '').trim();
                    if (!roll)
                        continue;
                    const key = roll.toLowerCase();
                    if (byRoll.has(key))
                        continue;
                    byRoll.set(key, {
                        id: s.id,
                        rollNumber: roll,
                        name: s.studentName,
                        admissionNumber: s.admissionNumber,
                        section: s.section,
                        studentStatus: s.studentStatus,
                        college: s.college,
                        course: s.course,
                        branch: s.branch,
                        batch: s.batch,
                        currentYear: s.currentYear,
                        currentSemester: s.currentSemester,
                    });
                }
                page += 1;
            } while (page <= totalPages);
        };
        const byBranch = new Map();
        for (const s of scopes) {
            const list = byBranch.get(s.branch) ?? [];
            list.push(s);
            byBranch.set(s.branch, list);
        }
        for (const [, branchScopes] of byBranch) {
            const allSections = branchScopes.every((s) => !s.section);
            if (allSections) {
                await fetchForScope({
                    branch: branchScopes[0].branch,
                    section: null,
                    yearOfStudy: branchScopes[0].yearOfStudy,
                    semester: branchScopes[0].semester,
                    batch: branchScopes[0].batch,
                    course: branchScopes[0].course,
                });
            }
            else {
                for (const s of branchScopes) {
                    await fetchForScope({
                        branch: s.branch,
                        section: s.section,
                        yearOfStudy: s.yearOfStudy,
                        semester: s.semester,
                        batch: s.batch,
                        course: s.course,
                    });
                }
            }
        }
        const students = Array.from(byRoll.values()).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
        const withDue = [];
        for (const s of students) {
            const dueClearance = await this.getDueClearanceForStudent(s);
            withDue.push({
                ...s,
                dueClearance: {
                    blocked: Boolean(dueClearance.blocked),
                    canApply: Boolean(dueClearance.canApply),
                    totalDue: Number(dueClearance.totalDue) || 0,
                    asOfDate: dueClearance.asOfDate,
                    message: dueClearance.message,
                    skipped: Boolean(dueClearance.skipped),
                    byHead: dueClearance.byHead ?? [],
                    byTerm: dueClearance.byTerm ?? [],
                },
            });
        }
        const dueSummary = this.summarizeDueClearance(withDue);
        return {
            exam: {
                id: exam.id,
                name: exam.name,
                college,
                course: exam.course,
                branch: exam.branch,
                batch: exam.batch,
                yearOfStudy: exam.yearOfStudy,
                semester: exam.semester,
                scopes: scopes.map((s) => ({
                    branch: s.branch,
                    section: s.section,
                    yearOfStudy: s.yearOfStudy,
                    semester: s.semester,
                })),
            },
            students: withDue,
            total: withDue.length,
            dueSummary,
        };
    }
    /**
     * The papers a given student sits for: common papers (no branch), their
     * branch's papers (no section), and their section's papers.
     */
    examSubjectsForBranch(exam, branch, section) {
        const wantedBranch = (branch ?? '').trim().toLowerCase();
        const wantedSection = (section ?? '').trim().toLowerCase();
        return (exam.examSubjects ?? []).filter((es) => {
            const b = (es.branch ?? '').trim().toLowerCase();
            const s = (es.section ?? '').trim().toLowerCase();
            if (b && wantedBranch && b !== wantedBranch)
                return false;
            if (s && s !== wantedSection)
                return false;
            return true;
        });
    }
    /**
     * Latest result for each paper in this exam's semester. Supply enrollment
     * is allowed only when the latest recorded attempt is explicitly failed.
     */
    async supplyResultStatus(exam, roll, branchSubjects) {
        const codeToSubjectIds = new Map();
        for (const es of branchSubjects) {
            const code = es.subject?.code?.trim().toLowerCase();
            if (!code)
                continue;
            const ids = codeToSubjectIds.get(code) ?? [];
            ids.push(es.subjectId);
            codeToSubjectIds.set(code, ids);
        }
        const statusBySubjectId = new Map();
        if (codeToSubjectIds.size === 0)
            return statusBySubjectId;
        const results = await this.subjectResultRepo
            .createQueryBuilder('r')
            .where('LOWER(r.studentRollNumber) = LOWER(:roll)', { roll })
            .andWhere('r.yearOfStudy = :yearOfStudy', { yearOfStudy: exam.yearOfStudy })
            .andWhere('r.semester = :semester', { semester: exam.semester })
            .andWhere('LOWER(r.subjectCode) IN (:...codes)', {
            codes: [...codeToSubjectIds.keys()],
        })
            .orderBy('r.attemptNumber', 'DESC')
            .addOrderBy('r.updatedAt', 'DESC')
            .addOrderBy('r.id', 'DESC')
            .getMany();
        const latestByCode = new Map();
        for (const result of results) {
            const code = result.subjectCode.trim().toLowerCase();
            if (!latestByCode.has(code))
                latestByCode.set(code, result);
        }
        for (const [code, subjectIds] of codeToSubjectIds) {
            const result = latestByCode.get(code);
            const status = result
                ? {
                    eligible: !result.passed,
                    grade: result.grade,
                    gradePoints: result.gradePoints == null ? null : Number(result.gradePoints),
                    passed: !!result.passed,
                    attemptNumber: result.attemptNumber,
                }
                : {
                    eligible: false,
                    grade: null,
                    gradePoints: null,
                    passed: null,
                    attemptNumber: null,
                };
            for (const subjectId of subjectIds)
                statusBySubjectId.set(subjectId, status);
        }
        return statusBySubjectId;
    }
    examScopeRows(exam) {
        if (exam.scopes?.length) {
            return exam.scopes.map((s) => ({
                college: s.college,
                course: s.course,
                branch: s.branch,
                batch: s.batch,
                yearOfStudy: s.yearOfStudy,
                semester: s.semester,
                section: s.section,
            }));
        }
        return [
            {
                college: exam.college,
                course: exam.course,
                branch: exam.branch,
                batch: exam.batch,
                yearOfStudy: exam.yearOfStudy,
                semester: exam.semester,
                section: null,
            },
        ];
    }
    /**
     * Where the student stands relative to the exam's scope rows:
     * - exact: same year/semester (and section when scoped)
     * - ahead: past the exam's semester — may hold backlogs from it
     * Section is ignored for "ahead" students since their current section
     * belongs to their current semester, not the scoped one.
     */
    studentScopePosition(exam, student) {
        const scopes = this.examScopeRows(exam);
        const studentBranch = (student.branch ?? '').trim().toLowerCase();
        const studentCourse = (student.course ?? '').trim().toLowerCase();
        const studentBatch = (student.batch ?? '').trim().toLowerCase();
        const studentSection = (student.section ?? '').trim().toLowerCase();
        const year = Number(student.currentYear);
        const sem = Number(student.currentSemester);
        let exact = false;
        let ahead = false;
        for (const s of scopes) {
            if (s.course?.trim() &&
                studentCourse &&
                s.course.trim().toLowerCase() !== studentCourse) {
                continue;
            }
            if (s.batch?.trim() &&
                studentBatch &&
                s.batch.trim().toLowerCase() !== studentBatch) {
                continue;
            }
            if (s.branch.trim().toLowerCase() !== studentBranch)
                continue;
            const scopeYear = Number(s.yearOfStudy);
            const scopeSem = Number(s.semester);
            if (scopeYear === year && scopeSem === sem) {
                if (s.section &&
                    s.section.trim().toLowerCase() !== studentSection) {
                    continue;
                }
                exact = true;
            }
            else if (year > scopeYear ||
                (year === scopeYear && sem > scopeSem)) {
                ahead = true;
            }
        }
        return { exact, ahead };
    }
    /**
     * Exam types this specific student may enroll as. Students exactly in
     * the scoped semester get every allowed type; students in a higher
     * semester get only the backlog-style types (supply / improvement /
     * special supply), never regular.
     */
    eligibleTypesForStudent(exam, student) {
        const allowed = this.getAllowedTypes(exam);
        const { exact, ahead } = this.studentScopePosition(exam, student);
        if (exact)
            return allowed;
        if (ahead)
            return allowed.filter((t) => t !== ExamType.REGULAR);
        return [];
    }
    studentMatchesExam(exam, student) {
        return this.eligibleTypesForStudent(exam, student).length > 0;
    }
    assertApplicationWindow(exam) {
        const today = new Date().toISOString().slice(0, 10);
        if (exam.applicationStartDate && today < exam.applicationStartDate) {
            throw AppError.badRequest('Applications have not opened yet');
        }
        if (exam.applicationEndDate && today > exam.applicationEndDate) {
            throw AppError.badRequest('Application window has closed');
        }
    }
    async loadStudentForEnrollment(studentId) {
        const student = await this.sdms.getStudent(studentId);
        if (!student)
            throw AppError.notFound('Student profile not found');
        const section = student.section?.trim() ||
            student.studentSection?.sectionName?.trim() ||
            null;
        return {
            id: student.id,
            studentName: student.studentName,
            pinNo: student.pinNo,
            admissionNumber: student.admissionNumber,
            college: student.college,
            course: student.course,
            branch: student.branch,
            batch: student.batch,
            section,
            currentYear: student.currentYear,
            currentSemester: student.currentSemester,
        };
    }
    resolveRoll(student) {
        const roll = (student.pinNo || student.admissionNumber || '').trim();
        if (!roll) {
            throw AppError.badRequest('Student has no PIN / roll number');
        }
        return roll;
    }
    async listPublishedExamsForStudent(studentId) {
        const student = await this.loadStudentForEnrollment(studentId);
        const exams = await this.examRepo.find({
            where: { status: ExamStatus.PUBLISHED },
            order: { createdAt: 'DESC' },
        });
        const inScope = exams.filter((e) => this.studentMatchesExam(e, student));
        const roll = this.resolveRoll(student);
        const appsByExam = new Map();
        if (inScope.length > 0) {
            const allApps = await this.applicationRepo
                .createQueryBuilder('a')
                .leftJoinAndSelect('a.feeRecord', 'fee')
                .where('a.examId IN (:...ids)', { ids: inScope.map((e) => e.id) })
                .andWhere('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
                .getMany();
            for (const app of allApps) {
                const list = appsByExam.get(app.examId) ?? [];
                list.push(app);
                appsByExam.set(app.examId, list);
            }
        }
        const dueClearance = await this.getDueClearanceForStudent(student);
        return inScope.map((exam) => {
            const apps = appsByExam.get(exam.id) ?? [];
            const allowedTypes = this.eligibleTypesForStudent(exam, student);
            const openTypes = apps.length === 0 ? allowedTypes : [];
            return {
                id: exam.id,
                name: exam.name,
                type: exam.type,
                allowedTypes,
                college: exam.college,
                course: exam.course,
                branch: exam.branch,
                batch: exam.batch,
                yearOfStudy: exam.yearOfStudy,
                semester: exam.semester,
                applicationStartDate: exam.applicationStartDate,
                applicationEndDate: exam.applicationEndDate,
                examinationStartDate: exam.examinationStartDate,
                examinationEndDate: exam.examinationEndDate,
                packageFee: this.packageFeeForScope(exam, student.branch, student.section),
                supplyFeeByCount: this.supplyFeeForScope(exam, student.branch),
                subjectCount: this.examSubjectsForBranch(exam, student.branch, student.section).length,
                alreadyApplied: openTypes.length === 0,
                openTypes,
                applications: apps.map((a) => ({
                    id: a.id,
                    examType: a.examType,
                    feeRecordId: a.feeRecordId,
                    feeStatus: a.feeRecord?.status ?? null,
                })),
                dueClearance,
                canApply: Boolean(dueClearance.canApply) && openTypes.length > 0,
            };
        });
    }
    async getPublishedExamForStudent(examId, studentId) {
        const student = await this.loadStudentForEnrollment(studentId);
        const exam = await this.findOne(examId);
        if (exam.status !== ExamStatus.PUBLISHED) {
            throw AppError.badRequest('Examination is not published');
        }
        if (!this.studentMatchesExam(exam, student)) {
            throw AppError.forbidden('You are not in the scope of this examination');
        }
        const roll = this.resolveRoll(student);
        const applications = await this.applicationRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.feeRecord', 'fee')
            .where('a.examId = :examId', { examId })
            .andWhere('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
            .getMany();
        const allowedTypes = this.eligibleTypesForStudent(exam, student);
        const openTypes = applications.length === 0 ? allowedTypes : [];
        const branchSubjects = this.examSubjectsForBranch(exam, student.branch, student.section);
        const supplyStatuses = allowedTypes.includes(ExamType.SUPPLY)
            ? await this.supplyResultStatus(exam, roll, branchSubjects)
            : new Map();
        const subjects = branchSubjects.map((es) => ({
            subjectId: es.subjectId,
            fee: Number(es.fee),
            examDate: es.examDate,
            session: es.session ?? null,
            startTime: es.startTime ?? null,
            endTime: es.endTime ?? null,
            durationMinutes: es.durationMinutes ?? null,
            code: es.subject?.code ?? String(es.subjectId),
            name: es.subject?.name ?? '',
            supplyStatus: supplyStatuses.get(es.subjectId) ?? null,
        }));
        const dueClearance = await this.getDueClearanceForStudent(student);
        return {
            exam: {
                id: exam.id,
                name: exam.name,
                type: exam.type,
                allowedTypes,
                college: exam.college,
                course: exam.course,
                branch: exam.branch,
                batch: exam.batch,
                yearOfStudy: exam.yearOfStudy,
                semester: exam.semester,
                packageFee: this.packageFeeForScope(exam, student.branch, student.section),
                supplyFeeByCount: this.supplyFeeForScope(exam, student.branch),
                applicationStartDate: exam.applicationStartDate,
                applicationEndDate: exam.applicationEndDate,
                examinationStartDate: exam.examinationStartDate,
                examinationEndDate: exam.examinationEndDate,
                instructions: exam.instructions,
                subjects,
            },
            openTypes,
            alreadyApplied: openTypes.length === 0,
            dueClearance,
            canApply: Boolean(dueClearance.canApply) && openTypes.length > 0,
            applications: applications.map((a) => ({
                id: a.id,
                examType: a.examType,
                selectedSubjectIds: a.selectedSubjectIds,
                feeRecordId: a.feeRecordId,
                feeStatus: a.feeRecord?.status ?? null,
                submittedAt: a.submittedAt,
            })),
            application: applications[0]
                ? {
                    id: applications[0].id,
                    examType: applications[0].examType,
                    selectedSubjectIds: applications[0].selectedSubjectIds,
                    feeRecordId: applications[0].feeRecordId,
                    feeStatus: applications[0].feeRecord?.status ?? null,
                    submittedAt: applications[0].submittedAt,
                }
                : null,
        };
    }
    async createStudentApplication(examId, studentId, dto, options = {}) {
        if (!dto.declarationAccepted || !dto.consentAccepted) {
            throw AppError.badRequest('Declaration and consent are required');
        }
        const student = await this.loadStudentForEnrollment(studentId);
        const exam = await this.findOne(examId);
        if (exam.status !== ExamStatus.PUBLISHED) {
            throw AppError.badRequest('Examination is not published');
        }
        const eligibleTypes = this.eligibleTypesForStudent(exam, student);
        if (eligibleTypes.length === 0) {
            throw AppError.forbidden('You are not in the scope of this examination');
        }
        this.assertApplicationWindow(exam);
        await this.assertNoOverdueDues(student, {
            overrideDues: Boolean(dto.overrideDues || options.overrideDues),
            actor: options.actor || null,
        });
        const examType = this.resolveEnrollmentType(eligibleTypes, dto.examType);
        const roll = this.resolveRoll(student);
        const existing = await this.applicationRepo
            .createQueryBuilder('a')
            .where('a.examId = :examId', { examId })
            .andWhere('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
            .getOne();
        if (existing) {
            throw AppError.badRequest(`You have already applied for this examination as ${this.typeLabel(existing.examType)}. Another enrollment type requires a separate examination`);
        }
        const existingFee = await this.feeRecordRepo
            .createQueryBuilder('f')
            .where('f.examId = :examId', { examId })
            .andWhere('LOWER(f.studentRollNumber) = LOWER(:roll)', { roll })
            .getOne();
        if (existingFee) {
            throw AppError.badRequest('A fee record already exists for this examination');
        }
        // Students only sit for the papers grouped under their own branch
        // (and section, when papers are section-specific).
        const branchSubjects = this.examSubjectsForBranch(exam, student.branch, student.section);
        let allowedSubjects = branchSubjects;
        if (this.isCountBasedExamType(examType)) {
            const supplyStatuses = await this.supplyResultStatus(exam, roll, branchSubjects);
            // Supply: only failed papers. Improvement/special_supply: keep all scope papers
            // until those flows define their own filters (same selection UI as supply).
            if (examType === ExamType.SUPPLY) {
                allowedSubjects = branchSubjects.filter((es) => supplyStatuses.get(es.subjectId)?.eligible);
                if (allowedSubjects.length === 0) {
                    throw AppError.badRequest('You have no failed subjects eligible for Supply in this semester');
                }
            }
        }
        const allIds = [...new Set(allowedSubjects.map((es) => es.subjectId))];
        let selectedSubjectIds;
        if (examType === ExamType.REGULAR) {
            // Regular: no subject selection — enroll for every paper in scope.
            selectedSubjectIds = [...allIds];
        }
        else {
            const requestedIds = dto.selectedSubjectIds ?? [];
            const invalidIds = requestedIds.filter((id) => !allIds.includes(id));
            if (invalidIds.length > 0) {
                throw AppError.badRequest(examType === ExamType.SUPPLY
                    ? 'Supply applications may include only subjects whose latest result is not passed'
                    : `Subject ${invalidIds[0]} is not part of this exam`);
            }
            selectedSubjectIds = [...new Set(requestedIds)];
            if (selectedSubjectIds.length === 0) {
                selectedSubjectIds = [...allIds];
            }
        }
        if (selectedSubjectIds.length === 0) {
            throw AppError.badRequest('No subjects available for this examination');
        }
        const { breakdown, baseFee } = this.calculateFee(exam, selectedSubjectIds, branchSubjects, {
            examType,
            packageFee: this.packageFeeForScope(exam, student.branch, student.section),
            supplyFeesByCount: this.supplyFeeForScope(exam, student.branch),
        });
        // Save the fee and application atomically. The database uniqueness
        // constraint prevents concurrent Regular/Supply submissions for one
        // student on the same examination.
        let saved;
        try {
            saved = await this.applicationRepo.manager.transaction(async (manager) => {
                const feeRepo = manager.getRepository('ExamFeeRecord');
                const appRepo = manager.getRepository('ExamApplication');
                const savedFee = await feeRepo.save(feeRepo.create({
                examId,
                examType,
                studentRollNumber: roll,
                studentName: student.studentName,
                selectedSubjectIds,
                feeBreakdown: breakdown,
                baseFee,
                lateFee: 0,
                totalAmount: baseFee,
                status: FeeStatus.PENDING,
                dueDate: exam.applicationEndDate,
                }));
                const savedApplication = await appRepo.save(appRepo.create({
                examId,
                examType,
                studentRollNumber: roll,
                studentName: student.studentName,
                studentBranch: student.branch ?? null,
                studentSection: student.section ?? null,
                selectedSubjectIds,
                feeBreakdown: breakdown,
                declarationAccepted: true,
                consentAccepted: true,
                feeRecordId: savedFee.id,
                }));
                return { feeRecord: savedFee, application: savedApplication };
            });
        }
        catch (error) {
            if (error?.code === 'ER_DUP_ENTRY' ||
                error?.code === 'SQLITE_CONSTRAINT') {
                throw AppError.badRequest('You have already applied for this examination. Another enrollment type requires a separate examination');
            }
            throw error;
        }
        const { feeRecord, application } = saved;
        const refreshed = await this.getFeeRecord(feeRecord.id);
        return {
            application: {
                id: application.id,
                examId: application.examId,
                examType: application.examType,
                selectedSubjectIds: application.selectedSubjectIds,
                feeBreakdown: application.feeBreakdown,
                feeRecordId: application.feeRecordId,
                submittedAt: application.submittedAt,
            },
            feeRecord: refreshed,
        };
    }
    buildHallTicketPayload(exam, application, feeRecord) {
        // Prefer the paper row scoped to the applicant's branch/section so
        // branch- or section-specific schedules print correctly.
        const scoped = this.examSubjectsForBranch(exam, application.studentBranch, application.studentSection)
            .slice()
            .sort((a, b) => {
            const rank = (es) => (es.section ? 2 : es.branch ? 1 : 0);
            return rank(b) - rank(a);
        });
        const bySubjectId = new Map();
        for (const list of [scoped, exam.examSubjects ?? []]) {
            for (const es of list) {
                if (!bySubjectId.has(es.subjectId))
                    bySubjectId.set(es.subjectId, es);
            }
        }
        const papers = (application.selectedSubjectIds ?? [])
            .map((sid) => {
            const es = bySubjectId.get(sid);
            if (!es)
                return null;
            return {
                subjectId: sid,
                code: es.subject?.code ?? String(sid),
                name: es.subject?.name ?? '',
                examDate: es.examDate,
                session: es.session ?? null,
                startTime: es.startTime ?? null,
                endTime: es.endTime ?? null,
                durationMinutes: es.durationMinutes ?? null,
                fee: Number(es.fee),
            };
        })
            .filter((p) => !!p)
            .sort((a, b) => (a.examDate ?? '').localeCompare(b.examDate ?? '') ||
            a.code.localeCompare(b.code));
        return {
            applicationId: application.id,
            examId: exam.id,
            examName: exam.name,
            examType: application.examType,
            college: exam.college,
            course: exam.course,
            branch: application.studentBranch || exam.branch,
            batch: exam.batch,
            yearOfStudy: exam.yearOfStudy,
            semester: exam.semester,
            studentRollNumber: application.studentRollNumber,
            studentName: application.studentName,
            feeRecordId: feeRecord.id,
            feeStatus: feeRecord.status,
            paidAt: feeRecord.payments?.find((p) => p.status === PaymentStatus.SUCCESS)
                ?.paidAt ?? null,
            hallTicketsReleasedAt: exam.hallTicketsReleasedAt,
            papers,
        };
    }
    async listHallTicketsForExam(examId) {
        const exam = await this.findOne(examId);
        const apps = await this.applicationRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.feeRecord', 'fee')
            .leftJoinAndSelect('fee.payments', 'payments')
            .where('a.examId = :examId', { examId })
            .andWhere('fee.status = :paid', { paid: FeeStatus.PAID })
            .orderBy('a.studentName', 'ASC')
            .addOrderBy('a.examType', 'ASC')
            .getMany();
        return {
            exam: {
                id: exam.id,
                name: exam.name,
                hallTicketsReleasedAt: exam.hallTicketsReleasedAt,
                status: exam.status,
            },
            tickets: apps.map((a) => this.buildHallTicketPayload(exam, a, a.feeRecord)),
            total: apps.length,
        };
    }
    async getHallTicketForExam(examId, applicationId) {
        const exam = await this.findOne(examId);
        const application = await this.applicationRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.feeRecord', 'fee')
            .leftJoinAndSelect('fee.payments', 'payments')
            .where('a.id = :applicationId', { applicationId })
            .andWhere('a.examId = :examId', { examId })
            .getOne();
        if (!application)
            throw AppError.notFound('Application not found');
        if (application.feeRecord?.status !== FeeStatus.PAID) {
            throw AppError.badRequest('Hall ticket is only available after examination fee is paid');
        }
        return this.buildHallTicketPayload(exam, application, application.feeRecord);
    }
    async listHallTicketsForStudent(studentId) {
        const student = await this.loadStudentForEnrollment(studentId);
        await this.assertNoOverdueDues(student);
        const roll = this.resolveRoll(student);
        const apps = await this.applicationRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.feeRecord', 'fee')
            .leftJoinAndSelect('fee.payments', 'payments')
            .leftJoinAndSelect('a.exam', 'exam')
            .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
            .leftJoinAndSelect('examSubjects.subject', 'subject')
            .where('LOWER(a.studentRollNumber) = LOWER(:roll)', { roll })
            .andWhere('fee.status = :paid', { paid: FeeStatus.PAID })
            .andWhere('exam.hallTicketsReleasedAt IS NOT NULL')
            .orderBy('a.submittedAt', 'DESC')
            .getMany();
        return apps.map((a) => this.buildHallTicketPayload(a.exam, a, a.feeRecord));
    }
    async getHallTicketForStudent(applicationId, studentId) {
        const student = await this.loadStudentForEnrollment(studentId);
        await this.assertNoOverdueDues(student);
        const roll = this.resolveRoll(student);
        const application = await this.applicationRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.feeRecord', 'fee')
            .leftJoinAndSelect('fee.payments', 'payments')
            .leftJoinAndSelect('a.exam', 'exam')
            .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
            .leftJoinAndSelect('examSubjects.subject', 'subject')
            .where('a.id = :applicationId', { applicationId })
            .getOne();
        if (!application)
            throw AppError.notFound('Application not found');
        if (application.studentRollNumber.toLowerCase() !== roll.toLowerCase()) {
            throw AppError.forbidden('Hall ticket not found for your account');
        }
        if (!application.exam?.hallTicketsReleasedAt) {
            throw AppError.badRequest('Hall tickets have not been released yet');
        }
        if (application.feeRecord?.status !== FeeStatus.PAID) {
            throw AppError.badRequest('Hall ticket is available only after the examination fee is paid');
        }
        return this.buildHallTicketPayload(application.exam, application, application.feeRecord);
    }
    async getExamAnalytics(examId) {
        const eligible = await this.listEligibleStudents(examId);
        const exam = await this.findOne(examId);
        const applications = await this.applicationRepo.find({
            where: { examId },
            relations: ['feeRecord'],
        });
        const feeRecords = await this.feeRecordRepo.find({ where: { examId } });
        const enrolledRolls = new Set(applications.map((a) => a.studentRollNumber.toLowerCase()));
        const paidRolls = new Set(feeRecords
            .filter((f) => f.status === FeeStatus.PAID)
            .map((f) => f.studentRollNumber.toLowerCase()));
        const pendingPayRolls = new Set(feeRecords
            .filter((f) => f.status === FeeStatus.PENDING)
            .map((f) => f.studentRollNumber.toLowerCase()));
        // Estimate per student against their own branch's papers (subjects may
        // be grouped per branch, so the union across branches would overcount).
        const branchFeeCache = new Map();
        const estimateForBranch = (branch, section) => {
            const key = `${(branch ?? '').trim().toLowerCase()}|${(section ?? '').trim().toLowerCase()}`;
            if (branchFeeCache.has(key))
                return branchFeeCache.get(key);
            const subjects = this.examSubjectsForBranch(exam, branch, section);
            const ids = [...new Set(subjects.map((es) => es.subjectId))];
            const allowed = this.getAllowedTypes(exam);
            const estimateType = allowed.includes(ExamType.REGULAR)
                ? ExamType.REGULAR
                : allowed.find((t) => this.isCountBasedExamType(t)) ?? allowed[0];
            const fee = ids.length
                ? this.calculateFee(exam, ids, subjects, {
                    examType: estimateType,
                    packageFee: this.packageFeeForScope(exam, branch, section),
                    supplyFeesByCount: this.supplyFeeForScope(exam, branch),
                }).baseFee
                : 0;
            branchFeeCache.set(key, fee);
            return fee;
        };
        const estimatedPerStudent = eligible.students.length
            ? this.roundMoney(eligible.students.reduce((sum, s) => sum + estimateForBranch(s.branch, s.section), 0) /
                eligible.students.length)
            : estimateForBranch(null, null);
        const eligibleCount = eligible.total;
        const enrolledCount = enrolledRolls.size;
        const paidCount = paidRolls.size;
        const pendingPaymentCount = pendingPayRolls.size;
        const notEnrolledCount = Math.max(0, eligibleCount - enrolledCount);
        const buckets = new Map();
        const keyFor = (s) => `${s.course ?? exam.course}|${s.branch ?? ''}|Y${s.currentYear}|S${s.currentSemester}`;
        for (const s of eligible.students) {
            const key = keyFor(s);
            let b = buckets.get(key);
            if (!b) {
                b = {
                    course: s.course ?? exam.course,
                    branch: s.branch ?? '',
                    semester: s.currentSemester,
                    yearOfStudy: s.currentYear,
                    eligible: 0,
                    enrolled: 0,
                    paid: 0,
                    pendingPayment: 0,
                    notEnrolled: 0,
                    estimatedRevenue: 0,
                    collectedRevenue: 0,
                };
                buckets.set(key, b);
            }
            b.eligible += 1;
            b.estimatedRevenue += estimateForBranch(s.branch, s.section);
            const roll = s.rollNumber.toLowerCase();
            if (enrolledRolls.has(roll))
                b.enrolled += 1;
            else
                b.notEnrolled += 1;
            if (paidRolls.has(roll))
                b.paid += 1;
            if (pendingPayRolls.has(roll))
                b.pendingPayment += 1;
        }
        let collectedRevenue = 0;
        const feeByRoll = new Map(feeRecords.map((f) => [f.studentRollNumber.toLowerCase(), f]));
        for (const s of eligible.students) {
            const fee = feeByRoll.get(s.rollNumber.toLowerCase());
            if (fee?.status === FeeStatus.PAID) {
                const b = buckets.get(keyFor(s));
                if (b)
                    b.collectedRevenue += Number(fee.totalAmount);
            }
        }
        collectedRevenue = [...buckets.values()].reduce((sum, b) => sum + b.collectedRevenue, 0);
        return {
            examId: exam.id,
            examName: exam.name,
            type: exam.type,
            eligibleCount,
            enrolledCount,
            paidCount,
            pendingPaymentCount,
            notEnrolledCount,
            estimatedPerStudent,
            estimatedRevenue: this.roundMoney([...buckets.values()].reduce((sum, b) => sum + b.estimatedRevenue, 0)),
            collectedRevenue: this.roundMoney(collectedRevenue),
            byScope: Array.from(buckets.values()).sort((a, b) => `${a.course}${a.branch}`.localeCompare(`${b.course}${b.branch}`)),
        };
    }
    calculateFee(exam, selectedSubjectIds, scopeSubjects, optionsOrPackage) {
        const pool = scopeSubjects ?? exam.examSubjects;
        const allExamSubjectIds = [...new Set(pool.map((es) => es.subjectId))];
        for (const sid of selectedSubjectIds) {
            if (!allExamSubjectIds.includes(sid)) {
                throw AppError.badRequest(`Subject ${sid} is not part of this exam`);
            }
        }
        const uniqueSelected = [...new Set(selectedSubjectIds)];
        // Support legacy 4th arg: packageFeeOverride number|null
        const options = typeof optionsOrPackage === 'number' || optionsOrPackage === null
            ? { packageFee: optionsOrPackage }
            : optionsOrPackage && typeof optionsOrPackage === 'object'
                ? optionsOrPackage
                : {};
        const examType = options.examType ??
            (Array.isArray(exam.allowedTypes) && exam.allowedTypes[0]) ??
            exam.type ??
            ExamType.REGULAR;
        const packageFee = options.packageFee !== undefined
            ? options.packageFee
            : exam.packageFee != null
                ? Number(exam.packageFee)
                : null;
        const supplyFeesByCount = options.supplyFeesByCount !== undefined
            ? options.supplyFeesByCount
            : Array.isArray(exam.supplyFeeByCount)
                ? exam.supplyFeeByCount.map((n) => Number(n))
                : null;
        if (this.isCountBasedExamType(examType)) {
            const n = uniqueSelected.length;
            if (n < 1) {
                throw AppError.badRequest('Select at least one subject');
            }
            const allSelected = n === allExamSubjectIds.length &&
                allExamSubjectIds.every((sid) => uniqueSelected.includes(sid));
            // Selecting every paper in scope uses the package fee (tiers are 1…N−1 only).
            if (allSelected) {
                if (packageFee == null || Number.isNaN(Number(packageFee))) {
                    throw AppError.badRequest('Package fee is required when all subjects are selected');
                }
                const baseFee = Number(packageFee);
                return {
                    breakdown: [
                        {
                            subjectId: 0,
                            subjectCode: 'Package fee (all subjects)',
                            fee: baseFee,
                        },
                    ],
                    baseFee,
                };
            }
            if (!Array.isArray(supplyFeesByCount) || supplyFeesByCount.length === 0) {
                throw AppError.badRequest('Supply fee schedule is not configured for this examination');
            }
            if (n > supplyFeesByCount.length) {
                throw AppError.badRequest(`Fee is not configured for ${n} subject(s) (schedule covers 1–${supplyFeesByCount.length}; all subjects use package fee)`);
            }
            const baseFee = Number(supplyFeesByCount[n - 1]);
            if (Number.isNaN(baseFee) || baseFee < 0) {
                throw AppError.badRequest(`Invalid supply fee for ${n} subject(s)`);
            }
            return {
                breakdown: [
                    {
                        subjectId: 0,
                        subjectCode: `${n} subject${n === 1 ? '' : 's'}`,
                        fee: baseFee,
                    },
                ],
                baseFee,
            };
        }
        // Regular (and any non-count type): flat package fee.
        if (packageFee == null || Number.isNaN(Number(packageFee))) {
            throw AppError.badRequest('Package fee is required for Regular enrollment');
        }
        const baseFee = Number(packageFee);
        return {
            breakdown: [
                {
                    subjectId: 0,
                    subjectCode: 'Regular package',
                    fee: baseFee,
                },
            ],
            baseFee,
        };
    }
    async generateFees(examId, students) {
        const exam = await this.findOne(examId);
        if (exam.status !== ExamStatus.PUBLISHED) {
            throw AppError.badRequest('Fee records can only be generated for published examinations');
        }
        const records = [];
        for (const student of students) {
            const existing = await this.feeRecordRepo.findOne({
                where: { examId, studentRollNumber: student.rollNumber },
            });
            if (existing) {
                throw AppError.badRequest(`Fee record already exists for student ${student.rollNumber}`);
            }
            const selectedSubjectIds = student.selectedSubjectIds ??
                exam.examSubjects.map((es) => es.subjectId);
            const examType = this.getAllowedTypes(exam)[0] ?? exam.type;
            const { breakdown, baseFee } = this.calculateFee(exam, selectedSubjectIds, exam.examSubjects, {
                examType,
                packageFee: this.packageFeeForScope(exam, null, null),
                supplyFeesByCount: this.supplyFeeForScope(exam, null),
            });
            const record = this.feeRecordRepo.create({
                examId,
                examType,
                studentRollNumber: student.rollNumber,
                studentName: student.name,
                selectedSubjectIds,
                feeBreakdown: breakdown,
                baseFee,
                lateFee: 0,
                totalAmount: baseFee,
                status: FeeStatus.PENDING,
                dueDate: exam.applicationEndDate,
            });
            records.push(await this.feeRecordRepo.save(record));
        }
        return records;
    }
    /**
     * Last slab may omit toDate (null) — late fee applies from fromDate until
     * application end. Earlier slabs must have an explicit toDate.
     */
    normalizeLateFeeSlabs(slabs) {
        if (!Array.isArray(slabs) || slabs.length === 0)
            return [];
        const toIso = (value) => {
            if (value === '' || value === null || value === undefined)
                return null;
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                const y = value.getFullYear();
                const m = String(value.getMonth() + 1).padStart(2, '0');
                const d = String(value.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            const s = String(value).trim().slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
                return null;
            const parsed = new Date(`${s}T00:00:00`);
            if (Number.isNaN(parsed.getTime()))
                return null;
            return s;
        };
        const nextDate = (isoDate) => {
            const parsed = new Date(`${isoDate}T00:00:00`);
            parsed.setDate(parsed.getDate() + 1);
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };
        const normalized = slabs.map((s) => {
            const fromDate = toIso(s.fromDate);
            const toDate = toIso(s.toDate);
            const amount = Number(s.amount);
            return { fromDate, toDate, amount };
        });
        normalized.sort((a, b) => String(a.fromDate).localeCompare(String(b.fromDate)));
        for (let i = 0; i < normalized.length; i += 1) {
            const s = normalized[i];
            const isLast = i === normalized.length - 1;
            if (!s.fromDate) {
                throw AppError.badRequest('Late fee slab "from date" is required');
            }
            if (!Number.isFinite(s.amount) || s.amount < 0) {
                throw AppError.badRequest('Late fee slab amount must be a non-negative number');
            }
            if (!isLast && s.toDate == null) {
                throw AppError.badRequest('Only the last late fee slab may leave "to date" empty (until application end)');
            }
            if (s.toDate != null && s.fromDate > s.toDate) {
                throw AppError.badRequest('Late fee slab "from date" cannot be after "to date"');
            }
            if (i > 0) {
                const prev = normalized[i - 1];
                if (!prev.toDate) {
                    throw AppError.badRequest('Each late fee slab before the last one must have a "to date"');
                }
                const expectedFrom = nextDate(prev.toDate);
                if (s.fromDate !== expectedFrom) {
                    throw AppError.badRequest(`Late fee slab ${i + 1} must start on ${expectedFrom}, the day after the previous slab ends`);
                }
            }
        }
        return normalized;
    }
    dateOnly(value) {
        if (!value)
            return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            // MySQL DATE values come back as JS Dates; use UTC parts to avoid TZ shift.
            return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
        }
        const s = String(value).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
            return null;
        const d = new Date(`${s}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    slabEffectiveToDate(slab, isLast, exam) {
        if (slab.toDate != null)
            return this.dateOnly(slab.toDate);
        if (isLast)
            return this.dateOnly(exam.applicationEndDate);
        return null;
    }
    calculateLateFee(exam, asOf = new Date()) {
        if (!exam.lateFeeSlabs?.length) {
            return { daysLate: 0, lateFee: 0, matchedSlab: null, beyondLastSlab: false };
        }
        const today = this.dateOnly(asOf);
        if (!today) {
            return { daysLate: 0, lateFee: 0, matchedSlab: null, beyondLastSlab: false };
        }
        const lateStart = this.dateOnly(exam.lateFeeStartDate);
        if (lateStart && today.getTime() < lateStart.getTime()) {
            return { daysLate: 0, lateFee: 0, matchedSlab: null, beyondLastSlab: false };
        }
        const appEnd = this.dateOnly(exam.applicationEndDate);
        if (appEnd && today.getTime() > appEnd.getTime()) {
            const daysLate = lateStart
                ? Math.floor((today.getTime() - lateStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
                : 0;
            return { daysLate, lateFee: 0, matchedSlab: null, beyondLastSlab: true };
        }
        const daysLate = lateStart
            ? Math.max(0, Math.floor((today.getTime() - lateStart.getTime()) / (24 * 60 * 60 * 1000)) + 1)
            : 0;
        const slabs = [...exam.lateFeeSlabs].sort((a, b) => String(a.fromDate).localeCompare(String(b.fromDate)));
        for (let i = 0; i < slabs.length; i += 1) {
            const s = slabs[i];
            const isLast = i === slabs.length - 1;
            const from = this.dateOnly(s.fromDate);
            const end = this.slabEffectiveToDate(s, isLast, exam);
            if (!from)
                continue;
            if (today.getTime() < from.getTime())
                continue;
            if (end && today.getTime() > end.getTime())
                continue;
            if (!end && !isLast)
                continue;
            return {
                daysLate,
                lateFee: Number(s.amount),
                matchedSlab: s,
                beyondLastSlab: false,
            };
        }
        return { daysLate, lateFee: 0, matchedSlab: null, beyondLastSlab: false };
    }
    async refreshLateFee(record) {
        if (record.status === FeeStatus.PAID)
            return record;
        let exam = record.exam;
        if (!exam) {
            exam = await this.findOne(record.examId);
            record.exam = exam;
        }
        const { lateFee } = this.calculateLateFee(exam);
        const nextLate = Number(lateFee);
        const nextTotal = Number(record.baseFee) + nextLate;
        if (Number(record.lateFee) !== nextLate ||
            Number(record.totalAmount) !== nextTotal) {
            record.lateFee = nextLate;
            record.totalAmount = nextTotal;
            await this.feeRecordRepo.update(record.id, {
                lateFee: nextLate,
                totalAmount: nextTotal,
            });
        }
        return record;
    }
    async listFeeRecords(examId, rollNumber, status) {
        const qb = this.feeRecordRepo
            .createQueryBuilder('fr')
            .leftJoinAndSelect('fr.exam', 'exam')
            .leftJoinAndSelect('exam.lateFeeSlabs', 'slabs')
            .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
            .leftJoinAndSelect('examSubjects.subject', 'subject')
            .leftJoinAndSelect('fr.payments', 'payments')
            .orderBy(`CASE WHEN fr.status = :pendingStatus THEN 0 ELSE 1 END`, 'ASC')
            .setParameter('pendingStatus', FeeStatus.PENDING)
            .addOrderBy('fr.studentName', 'ASC')
            .addOrderBy('fr.createdAt', 'DESC');
        if (examId)
            qb.andWhere('fr.examId = :examId', { examId });
        if (rollNumber?.trim()) {
            qb.andWhere('LOWER(fr.studentRollNumber) = LOWER(:roll)', {
                roll: rollNumber.trim(),
            });
        }
        if (status) {
            qb.andWhere('fr.status = :status', { status });
        }
        const records = await qb.getMany();
        for (const record of records) {
            if (record.status !== FeeStatus.PAID) {
                await this.refreshLateFee(record);
            }
        }
        return records;
    }
    async getFeeRecord(id) {
        const record = await this.feeRecordRepo.findOne({
            where: { id },
            relations: [...this.feeRecordRelations],
        });
        if (!record)
            throw AppError.notFound('Fee record not found');
        if (record.status !== FeeStatus.PAID) {
            await this.refreshLateFee(record);
        }
        return record;
    }
    async lookupForCollection(rollNumber) {
        const roll = rollNumber.trim();
        if (!roll)
            throw AppError.badRequest('Roll number is required');
        const records = await this.listFeeRecords(undefined, roll);
        return {
            rollNumber: roll,
            studentName: records[0]?.studentName ?? null,
            records,
            pendingCount: records.filter((r) => r.status === FeeStatus.PENDING).length,
            paidCount: records.filter((r) => r.status === FeeStatus.PAID).length,
        };
    }
    generateReceiptNumber() {
        return `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    /**
     * Post exam-fee collection to Fee Management (append-only).
     * Exam-fee payments split into Exam Fee (EXM01) + Late Fee (LTF) lines;
     * UPI convenience-fee companion payments post under Bank Charges (BNKCH).
     * Updates EMS payment receipt to the Fee Mgmt sequence receipt when posted.
     * Never voids or modifies Fee Management transactions.
     */
    async syncPaymentToFeeManagement(payment, feeRecord, extras = {}) {
        if (!this.feeManagement?.isEnabled?.()) {
            return null;
        }
        const gw = this.parseGateway(payment.gatewayResponse) ?? {};
        const isBankCharges = gw.lineType === 'convenience_fee';
        let student = null;
        try {
            student = await this.sdms.findStudentByPin(feeRecord.studentRollNumber);
        } catch {
            student = null;
        }
        try {
            const payload = {
                emsPaymentId: payment.id,
                emsFeeRecordId: feeRecord.id,
                amount: Number(payment.amountPaid),
                paymentMethod: payment.paymentMethod,
                paymentDate: payment.paidAt || new Date(),
                student,
                studentName: feeRecord.studentName,
                studentRollNumber: feeRecord.studentRollNumber,
                exam: feeRecord.exam,
                collectedBy: payment.collectedBy,
                collectorUsername: payment.collectorUsername,
                referenceNo: payment.transactionReference || extras.referenceNo,
                gatewayPaymentId: extras.gatewayPaymentId || payment.transactionReference || undefined,
                bankName: extras.bankName || gw.bankName || undefined,
                remarks: payment.remarks,
            };
            const result = isBankCharges
                ? await this.feeManagement.postBankChargesTransaction(payload)
                : await this.feeManagement.postExamFeeTransaction({
                    ...payload,
                    lateFeeAmount: Number(feeRecord.lateFee || 0),
                });
            if (result?.receiptNumber && !result.skipped) {
                payment.receiptNumber = result.receiptNumber;
                payment.gatewayResponse = JSON.stringify({
                    ...gw,
                    feeManagement: {
                        transactionId: result.transactionId,
                        receiptNumber: result.receiptNumber,
                        feeHeadCode: result.feeHeadCode,
                        alreadyPosted: result.alreadyPosted === true,
                        postedAt: new Date().toISOString(),
                    },
                });
                await this.paymentRepo.save(payment);
            } else if (result?.skipped) {
                payment.gatewayResponse = JSON.stringify({
                    ...gw,
                    feeManagement: {
                        skipped: true,
                        reason: result.reason,
                    },
                });
                await this.paymentRepo.save(payment);
            }
            return result;
        } catch (err) {
            log.error({
                event: 'fee_management.payment_post_failed',
                paymentId: payment.id,
                feeRecordId: payment.feeRecordId,
                err,
            }, 'Failed to post EMS payment to Fee Management');
            payment.gatewayResponse = JSON.stringify({
                ...gw,
                feeManagement: {
                    error: err.message,
                    failedAt: new Date().toISOString(),
                },
            });
            await this.paymentRepo.save(payment).catch(() => undefined);
            return { error: err.message };
        }
    }

    async payOnline(_feeRecordId, _dto) {
        throw AppError.badRequest('Simulated online pay is disabled. Use Razorpay Checkout (/fees/razorpay/order).');
    }
    async createRazorpayOrder(feeRecordId, opts = {}) {
        const feeRecord = await this.getFeeRecord(feeRecordId);
        if (feeRecord.status === FeeStatus.PAID) {
            throw AppError.badRequest('Fee already paid');
        }
        if (opts.actor?.role === 'student') {
            const pin = opts.actor.pinNo?.toLowerCase() ?? '';
            if (feeRecord.studentRollNumber.toLowerCase() !== pin) {
                throw AppError.forbidden('This fee does not belong to your account');
            }
        }
        await this.refreshLateFee(feeRecord);
        const open = await this.paymentRepo.find({
            where: { feeRecordId },
        });
        for (const p of open) {
            if (p.status === PaymentStatus.PENDING ||
                p.status === PaymentStatus.PROCESSING) {
                p.status = PaymentStatus.FAILED;
                const gw = this.parseGateway(p.gatewayResponse) ?? {
                    provider: 'razorpay',
                };
                p.gatewayResponse = JSON.stringify({
                    ...gw,
                    event: 'superseded',
                });
                await this.paymentRepo.save(p);
            }
        }
        const { cfg, client } = await this.getRazorpayClient();
        const split = this.applyUpiConvenienceFee(feeRecord.totalAmount, opts.paymentMethod);
        const chargePaise = Math.round(split.total * 100);
        if (chargePaise < 100) {
            throw AppError.badRequest('Amount must be at least ₹1.00');
        }
        const examPayment = this.paymentRepo.create({
            feeRecordId,
            amountPaid: split.base,
            paymentMode: PaymentMode.ONLINE,
            paymentMethod: opts.paymentMethod || PaymentMethod.UPI,
            status: PaymentStatus.PENDING,
            receiptNumber: this.generateReceiptNumber(),
            transactionReference: null,
            collectedBy: opts.actor?.fullName || opts.actor?.username || null,
            collectorUsername: opts.actor?.role === 'student'
                ? null
                : opts.actor?.username || null,
            remarks: null,
            gatewayResponse: JSON.stringify({
                provider: 'razorpay',
                lineType: 'exam_fee',
                event: 'order_creating',
                baseFeeAmount: split.base,
                convenienceFeeAmount: split.convenienceFee,
                convenienceFeeRate: split.rate,
            }),
        });
        const savedExam = await this.paymentRepo.save(examPayment);
        let savedConvenience = null;
        if (split.applies && split.convenienceFee > 0) {
            savedConvenience = await this.paymentRepo.save(this.paymentRepo.create({
                feeRecordId,
                amountPaid: split.convenienceFee,
                paymentMode: PaymentMode.ONLINE,
                paymentMethod: PaymentMethod.UPI,
                status: PaymentStatus.PENDING,
                receiptNumber: this.generateReceiptNumber(),
                transactionReference: null,
                collectedBy: savedExam.collectedBy,
                collectorUsername: savedExam.collectorUsername,
                remarks: 'UPI convenience / bank charges (2.2%)',
                gatewayResponse: JSON.stringify({
                    provider: 'razorpay',
                    lineType: 'convenience_fee',
                    event: 'order_creating',
                    companionPaymentId: savedExam.id,
                    convenienceFeeRate: split.rate,
                    baseFeeAmount: split.base,
                }),
            }));
            savedExam.gatewayResponse = JSON.stringify({
                provider: 'razorpay',
                lineType: 'exam_fee',
                event: 'order_creating',
                companionPaymentId: savedConvenience.id,
                baseFeeAmount: split.base,
                convenienceFeeAmount: split.convenienceFee,
                convenienceFeeRate: split.rate,
            });
            await this.paymentRepo.save(savedExam);
            savedConvenience.gatewayResponse = JSON.stringify({
                provider: 'razorpay',
                lineType: 'convenience_fee',
                event: 'order_creating',
                companionPaymentId: savedExam.id,
                convenienceFeeRate: split.rate,
                baseFeeAmount: split.base,
                convenienceFeeAmount: split.convenienceFee,
            });
            await this.paymentRepo.save(savedConvenience);
        }
        const order = await client.orders.create({
            amount: chargePaise,
            currency: 'INR',
            receipt: `fee_${feeRecordId}_p${savedExam.id}`.slice(0, 40),
            notes: {
                feeRecordId: String(feeRecordId),
                primaryPaymentId: String(savedExam.id),
                companionPaymentId: savedConvenience
                    ? String(savedConvenience.id)
                    : '',
                rollNumber: feeRecord.studentRollNumber,
            },
        });
        const orderMeta = {
            provider: 'razorpay',
            orderId: order.id,
            event: 'order_created',
            method: opts.paymentMethod || PaymentMethod.UPI,
        };
        const examGw = this.parseGateway(savedExam.gatewayResponse) ?? {
            provider: 'razorpay',
            lineType: 'exam_fee',
        };
        savedExam.status = PaymentStatus.PROCESSING;
        savedExam.gatewayResponse = JSON.stringify({
            ...examGw,
            ...orderMeta,
        });
        await this.paymentRepo.save(savedExam);
        if (savedConvenience) {
            const convGw = this.parseGateway(savedConvenience.gatewayResponse) ?? {
                provider: 'razorpay',
                lineType: 'convenience_fee',
            };
            savedConvenience.status = PaymentStatus.PROCESSING;
            savedConvenience.gatewayResponse = JSON.stringify({
                ...convGw,
                ...orderMeta,
            });
            await this.paymentRepo.save(savedConvenience);
        }
        let studentContact = null;
        let studentEmail = null;
        try {
            const sdmsStudent = await this.sdms.findStudentByPin(feeRecord.studentRollNumber);
            if (sdmsStudent) {
                studentContact = this.sdms.resolveStudentContact(sdmsStudent);
                studentEmail = sdmsStudent.email?.trim() || null;
            }
        }
        catch {
        }
        return {
            keyId: cfg.keyId,
            orderId: order.id,
            amount: chargePaise,
            currency: 'INR',
            paymentId: savedExam.id,
            companionPaymentId: savedConvenience?.id ?? null,
            receiptNumber: savedExam.receiptNumber,
            feeRecordId,
            studentName: feeRecord.studentName,
            studentRollNumber: feeRecord.studentRollNumber,
            studentContact,
            studentEmail,
            baseAmount: split.base,
            convenienceFee: split.convenienceFee,
            totalAmount: split.total,
            convenienceFeeApplied: split.applies,
            convenienceFeeRate: split.rate,
            description: feeRecord.exam?.name
                ? `Exam fee — ${feeRecord.exam.name}`
                : `Exam fee #${feeRecordId}`,
        };
    }
    async verifyRazorpayPayment(dto) {
        const { cfg } = await this.getRazorpayClient();
        const body = `${dto.razorpayOrderId}|${dto.razorpayPaymentId}`;
        const expected = createHmac('sha256', cfg.keySecret)
            .update(body)
            .digest('hex');
        if (!this.safeEqualHex(expected, dto.razorpaySignature)) {
            throw AppError.forbidden('Invalid Razorpay payment signature');
        }
        const payment = await this.findPaymentForRazorpayOrder(dto.razorpayOrderId, dto.paymentId);
        return this.markRazorpaySuccess(payment, {
            paymentId: dto.razorpayPaymentId,
            orderId: dto.razorpayOrderId,
            signature: dto.razorpaySignature,
            event: 'checkout_verified',
        });
    }
    async handleRazorpayWebhook(rawBody, signatureHeader) {
        const webhookSecret = await this.resolveWebhookSecret();
        if (!webhookSecret) {
            throw AppError.badRequest('Razorpay webhook secret is not configured');
        }
        if (!signatureHeader) {
            throw AppError.forbidden('Missing Razorpay signature');
        }
        const expected = createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');
        if (!this.safeEqualHex(expected, signatureHeader)) {
            throw AppError.forbidden('Invalid webhook signature');
        }
        const payload = JSON.parse(rawBody.toString('utf8'));
        const event = payload.event ?? '';
        const paymentEntity = payload.payload?.payment?.entity;
        const orderEntity = payload.payload?.order?.entity;
        if (event === 'payment.captured' ||
            event === 'payment.authorized' ||
            event === 'order.paid') {
            const orderId = String(paymentEntity?.order_id ?? orderEntity?.id ?? '');
            const rzPaymentId = String(paymentEntity?.id ?? '');
            if (!orderId) {
                return { ok: true, ignored: true, reason: 'no_order_id' };
            }
            let payment;
            try {
                payment = await this.findPaymentForRazorpayOrder(orderId);
            }
            catch {
                return { ok: true, ignored: true, reason: 'payment_not_found' };
            }
            if (payment.status === PaymentStatus.SUCCESS) {
                return { ok: true, alreadyPaid: true, paymentId: payment.id };
            }
            await this.markRazorpaySuccess(payment, {
                paymentId: rzPaymentId || undefined,
                orderId,
                event,
                method: paymentEntity?.method
                    ? String(paymentEntity.method)
                    : undefined,
            });
            return { ok: true, paid: true, paymentId: payment.id };
        }
        if (event === 'payment.failed') {
            const orderId = String(paymentEntity?.order_id ?? '');
            if (!orderId)
                return { ok: true, ignored: true };
            try {
                const payment = await this.findPaymentForRazorpayOrder(orderId);
                if (payment && payment.status !== PaymentStatus.SUCCESS) {
                    const gw = this.parseGateway(payment.gatewayResponse) ?? {
                        provider: 'razorpay',
                    };
                    payment.status = PaymentStatus.FAILED;
                    payment.gatewayResponse = JSON.stringify({
                        ...gw,
                        orderId,
                        paymentId: paymentEntity?.id
                            ? String(paymentEntity.id)
                            : gw.paymentId,
                        event: 'payment.failed',
                    });
                    await this.paymentRepo.save(payment);
                    const companion = await this.getLinkedPayment(gw.companionPaymentId);
                    if (companion &&
                        companion.status !== PaymentStatus.SUCCESS &&
                        companion.status !== PaymentStatus.VOIDED) {
                        const cgw = this.parseGateway(companion.gatewayResponse) ?? {
                            provider: 'razorpay',
                        };
                        companion.status = PaymentStatus.FAILED;
                        companion.gatewayResponse = JSON.stringify({
                            ...cgw,
                            orderId,
                            event: 'payment.failed',
                        });
                        await this.paymentRepo.save(companion);
                    }
                }
            }
            catch {
            }
            return { ok: true, failed: true };
        }
        return { ok: true, ignored: true, event };
    }
    async resolveWebhookSecret() {
        return this.settings.getWebhookSecret();
    }
    async findPaymentForRazorpayOrder(orderId, paymentId) {
        if (paymentId) {
            const byId = await this.paymentRepo.findOne({
                where: { id: paymentId },
                relations: ['feeRecord', 'feeRecord.exam'],
            });
            if (byId) {
                const gw = this.parseGateway(byId.gatewayResponse);
                if (!gw?.orderId || gw.orderId === orderId)
                    return byId;
            }
        }
        const recent = await this.paymentRepo.find({
            where: { paymentMode: PaymentMode.ONLINE },
            relations: ['feeRecord', 'feeRecord.exam'],
            order: { id: 'DESC' },
            take: 200,
        });
        const match = recent.find((p) => {
            const gw = this.parseGateway(p.gatewayResponse);
            return gw?.orderId === orderId && this.isExamFeeLine(gw);
        }) ?? recent.find((p) => {
            const gw = this.parseGateway(p.gatewayResponse);
            return gw?.orderId === orderId;
        });
        if (!match)
            throw AppError.notFound('Payment for this order was not found');
        return match;
    }
    async finalizeRazorpaySuccess(payment, meta) {
        const methodMap = {
            upi: PaymentMethod.UPI,
            card: PaymentMethod.DEBIT_CARD,
            netbanking: PaymentMethod.NET_BANKING,
        };
        const rzMethod = meta.method && methodMap[meta.method]
            ? methodMap[meta.method]
            : payment.paymentMethod;
        const applySuccess = async (row) => {
            const existing = this.parseGateway(row.gatewayResponse) ?? {
                provider: 'razorpay',
            };
            row.status = PaymentStatus.SUCCESS;
            row.transactionReference =
                meta.paymentId || row.transactionReference;
            if (this.isExamFeeLine(existing)) {
                row.paymentMethod = rzMethod;
            }
            row.gatewayResponse = JSON.stringify({
                ...existing,
                provider: 'razorpay',
                orderId: meta.orderId,
                paymentId: meta.paymentId,
                signature: meta.signature,
                event: meta.event ?? 'captured',
                method: meta.method,
            });
            await this.paymentRepo.save(row);
        };
        await applySuccess(payment);
        const gw = this.parseGateway(payment.gatewayResponse);
        const companionId = gw?.companionPaymentId;
        if (companionId) {
            const companion = await this.getLinkedPayment(companionId);
            if (companion && companion.status !== PaymentStatus.SUCCESS) {
                await applySuccess(companion);
            }
        }
        if (this.isExamFeeLine(gw)) {
            await this.feeRecordRepo.update(payment.feeRecordId, {
                status: FeeStatus.PAID,
            });
            const feeRecord = payment.feeRecord?.exam
                ? payment.feeRecord
                : await this.getFeeRecord(payment.feeRecordId);
            const refreshed = await this.getPayment(payment.id);
            await this.syncPaymentToFeeManagement(refreshed, feeRecord, {
                gatewayPaymentId: meta.paymentId,
            });
            // Convenience-fee companion posts to Fee Mgmt as Bank Charges
            if (companionId) {
                const companionRow = await this.getLinkedPayment(companionId);
                if (companionRow && companionRow.status === PaymentStatus.SUCCESS) {
                    await this.syncPaymentToFeeManagement(companionRow, feeRecord, {
                        gatewayPaymentId: meta.paymentId,
                    });
                }
            }
        }
    }
    async markRazorpaySuccess(payment, meta) {
        if (payment.status === PaymentStatus.SUCCESS) {
            return {
                payment: this.withVerificationMeta(payment),
                feeRecord: await this.getFeeRecord(payment.feeRecordId),
                alreadyPaid: true,
            };
        }
        const fee = await this.getFeeRecord(payment.feeRecordId);
        if (fee.status === FeeStatus.PAID) {
            await this.finalizeRazorpaySuccess(payment, meta);
            return {
                payment: this.withVerificationMeta(await this.getPayment(payment.id)),
                feeRecord: fee,
                alreadyPaid: true,
            };
        }
        await this.finalizeRazorpaySuccess(payment, meta);
        return {
            payment: this.withVerificationMeta(await this.getPayment(payment.id)),
            feeRecord: await this.getFeeRecord(payment.feeRecordId),
            alreadyPaid: false,
        };
    }
    async getPaymentStatus(id) {
        const payment = await this.getPayment(id);
        const fee = payment.feeRecord
            ? payment.feeRecord
            : await this.getFeeRecord(payment.feeRecordId);
        return {
            paymentId: payment.id,
            status: payment.status,
            feeRecordId: payment.feeRecordId,
            feeStatus: fee.status,
            receiptNumber: payment.receiptNumber,
            transactionReference: payment.transactionReference,
            paidAt: payment.paidAt,
        };
    }
    async payOffline(dto) {
        const collectedBy = dto.collectedBy?.trim();
        if (!collectedBy) {
            throw AppError.badRequest('Collector name (collectedBy) is required');
        }
        if (!dto.paymentMethod) {
            throw AppError.badRequest('Payment method is required');
        }
        let feeRecord = null;
        if (dto.feeRecordId) {
            feeRecord = await this.feeRecordRepo.findOne({
                where: { id: dto.feeRecordId },
                relations: [...this.feeRecordRelations],
            });
        }
        else if (dto.examId && dto.studentRollNumber?.trim()) {
            feeRecord = await this.feeRecordRepo
                .createQueryBuilder('fr')
                .leftJoinAndSelect('fr.exam', 'exam')
                .leftJoinAndSelect('exam.lateFeeSlabs', 'slabs')
                .leftJoinAndSelect('exam.examSubjects', 'examSubjects')
                .leftJoinAndSelect('examSubjects.subject', 'subject')
                .leftJoinAndSelect('fr.payments', 'payments')
                .where('fr.examId = :examId', { examId: dto.examId })
                .andWhere('LOWER(fr.studentRollNumber) = LOWER(:roll)', {
                roll: dto.studentRollNumber.trim(),
            })
                .getOne();
        }
        else {
            throw AppError.badRequest('Provide feeRecordId, or examId with studentRollNumber');
        }
        if (!feeRecord) {
            throw AppError.notFound('Pending fee record not found for student');
        }
        if (feeRecord.status === FeeStatus.PAID) {
            throw AppError.badRequest('Fee already paid');
        }
        await this.refreshLateFee(feeRecord);
        const payment = this.paymentRepo.create({
            feeRecordId: feeRecord.id,
            amountPaid: feeRecord.totalAmount,
            paymentMode: PaymentMode.OFFLINE,
            paymentMethod: dto.paymentMethod,
            status: PaymentStatus.SUCCESS,
            receiptNumber: this.generateReceiptNumber(),
            transactionReference: dto.transactionNumber?.trim() || null,
            collectedBy,
            collectorUsername: dto.collectorUsername?.trim() || null,
            remarks: dto.remarks?.trim() || null,
            gatewayResponse: JSON.stringify({
                bankName: dto.bankName?.trim() || null,
                offline: true,
            }),
        });
        await this.paymentRepo.save(payment);
        await this.feeRecordRepo.update(feeRecord.id, { status: FeeStatus.PAID });
        let bankName = null;
        try {
            bankName = dto.bankName?.trim() || null;
        } catch {
            bankName = null;
        }
        await this.syncPaymentToFeeManagement(payment, feeRecord, {
            bankName,
            referenceNo: dto.transactionNumber?.trim() || null,
        });
        const savedPayment = await this.getPayment(payment.id);
        return {
            payment: this.withVerificationMeta(savedPayment),
            feeRecord: await this.getFeeRecord(feeRecord.id),
        };
    }
    async voidPayment(_paymentId, _opts = {}) {
        throw AppError.badRequest(
            'Voiding or modifying payments is not allowed. Transactions are final in EMS and Fee Management.',
        );
    }
    async markFeeUnpaid(_feeRecordId, _opts = {}) {
        throw AppError.badRequest(
            'Marking fees unpaid is not allowed. Transactions are final in EMS and Fee Management.',
        );
    }
    listPayments(feeRecordId) {
        const qb = this.paymentRepo
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.feeRecord', 'fr')
            .leftJoinAndSelect('fr.exam', 'exam')
            .orderBy('p.paidAt', 'DESC');
        if (feeRecordId) {
            qb.andWhere('p.feeRecordId = :feeRecordId', { feeRecordId });
        }
        return qb.getMany();
    }
    async getPayment(id) {
        const payment = await this.paymentRepo.findOne({
            where: { id },
            relations: ['feeRecord', 'feeRecord.exam', 'feeRecord.exam.examSubjects'],
        });
        if (!payment)
            throw AppError.notFound('Payment / receipt not found');
        return payment;
    }
    async getPaymentByReceiptNumber(receiptNumber) {
        const receipt = receiptNumber.trim();
        if (!receipt)
            throw AppError.badRequest('Receipt number is required');
        const payment = await this.paymentRepo.findOne({
            where: { receiptNumber: receipt },
            relations: ['feeRecord', 'feeRecord.exam'],
        });
        if (!payment)
            throw AppError.notFound('Receipt not found');
        return payment;
    }
    makeReceiptVerifyToken(receiptNumber) {
        return createHmac('sha256', config.jwt.secret)
            .update(`receipt:${receiptNumber.trim()}`)
            .digest('hex')
            .slice(0, 16);
    }
    async verifyReceipt(receiptNumber, token) {
        const receipt = receiptNumber.trim();
        if (!receipt)
            throw AppError.badRequest('Receipt number is required');
        const expected = this.makeReceiptVerifyToken(receipt);
        const provided = token?.trim();
        if (provided && provided !== expected) {
            throw AppError.forbidden('Invalid receipt verification link');
        }
        const payment = await this.getPaymentByReceiptNumber(receipt);
        const fr = payment.feeRecord;
        const exam = fr?.exam;
        return {
            valid: true,
            receiptNumber: payment.receiptNumber,
            amountPaid: Number(payment.amountPaid),
            paymentMode: payment.paymentMode,
            paymentMethod: payment.paymentMethod,
            paidAt: payment.paidAt,
            studentName: fr?.studentName ?? '—',
            studentRollNumber: fr?.studentRollNumber ?? '—',
            examName: exam?.name ?? null,
            college: exam?.college ?? null,
            course: exam?.course ?? null,
            branch: exam?.branch ?? null,
            batch: exam?.batch ?? null,
            yearOfStudy: exam?.yearOfStudy ?? null,
            semester: exam?.semester ?? null,
            collectedBy: payment.collectedBy,
            status: payment.status,
            tokenValidated: Boolean(provided && provided === expected),
        };
    }
    withVerificationMeta(payment) {
        const token = this.makeReceiptVerifyToken(payment.receiptNumber);
        return {
            ...payment,
            verificationToken: token,
        };
    }
    async listPaymentsByRoll(rollNumber) {
        const roll = rollNumber.trim();
        return this.paymentRepo
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.feeRecord', 'fr')
            .leftJoinAndSelect('fr.exam', 'exam')
            .where('LOWER(fr.studentRollNumber) = LOWER(:roll)', { roll })
            .orderBy('p.paidAt', 'DESC')
            .getMany();
    }
}
module.exports = { ExamService };
