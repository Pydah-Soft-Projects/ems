'use strict';

const { AppError } = require('../common/errors');

class FeeHeadsService {
  constructor(feeHeadRepo, feeManagement, examFeeRecordRepo, regulationScopeRepo, regulationRepo) {
    this.feeHeadRepo = feeHeadRepo;
    this.feeManagement = feeManagement;
    this.examFeeRecordRepo = examFeeRecordRepo;
    this.regulationScopeRepo = regulationScopeRepo;
    this.regulationRepo = regulationRepo;
  }

  async syncToMongo(headData) {
    try {
      if (this.feeManagement && this.feeManagement.isEnabled()) {
        const { FeeHead } = this.feeManagement.getModels();
        const existing = await FeeHead.findOne({ code: headData.code });
        if (existing) {
          await FeeHead.updateOne({ _id: existing._id }, { $set: headData });
        } else {
          await FeeHead.create(headData);
        }
      }
    } catch (err) {
      // Non-blocking Mongo sync warning log
      console.warn('FeeHead Mongo sync warning:', err.message);
    }
  }

  async syncDeleteToMongo(code) {
    try {
      if (this.feeManagement && this.feeManagement.isEnabled()) {
        const { FeeHead } = this.feeManagement.getModels();
        await FeeHead.deleteOne({ code });
      }
    } catch (err) {
      console.warn('FeeHead Mongo delete sync warning:', err.message);
    }
  }

  async findAll(filters = {}) {
    const qb = this.feeHeadRepo.createQueryBuilder('head');

    if (filters.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      qb.andWhere('(head.name LIKE :q OR head.code LIKE :q OR head.description LIKE :q)', { q });
    }

    if (filters.type && (filters.type === 'GLOBAL' || filters.type === 'REGULATION_SPECIFIC')) {
      qb.andWhere('head.type = :type', { type: filters.type });
    }

    if (filters.isActive !== undefined && filters.isActive !== null && filters.isActive !== '') {
      const active = filters.isActive === 'true' || filters.isActive === true;
      qb.andWhere('head.isActive = :active', { active });
    }

    qb.orderBy('head.name', 'ASC');

    const heads = await qb.getMany();
    return heads.map((h) => ({
      ...h,
      defaultAmount: Number(h.defaultAmount || 0),
      regulationAmounts: Array.isArray(h.regulationAmounts) ? h.regulationAmounts : [],
    }));
  }

  async findOne(id) {
    const head = await this.feeHeadRepo.findOne({
      where: [{ id: isNaN(Number(id)) ? -1 : Number(id) }, { code: String(id) }],
    });
    if (!head) {
      throw AppError.notFound('Fee Head not found');
    }
    return {
      ...head,
      defaultAmount: Number(head.defaultAmount || 0),
      regulationAmounts: Array.isArray(head.regulationAmounts) ? head.regulationAmounts : [],
    };
  }

  async create(dto) {
    const code = String(dto.code || '').trim().toUpperCase();
    const name = String(dto.name || '').trim();

    if (!code || !name) {
      throw AppError.badRequest('Fee Head name and code are required');
    }

    const existingCode = await this.feeHeadRepo.findOne({ where: { code } });
    if (existingCode) {
      throw AppError.badRequest(`Fee head with code '${code}' already exists`);
    }

    const existingName = await this.feeHeadRepo.findOne({ where: { name } });
    if (existingName) {
      throw AppError.badRequest(`Fee head with name '${name}' already exists`);
    }

    const type = dto.type === 'REGULATION_SPECIFIC' ? 'REGULATION_SPECIFIC' : 'GLOBAL';
    const defaultAmount = Math.max(0, Number(dto.defaultAmount || 0));

    let regulationAmounts = [];
    if (type === 'REGULATION_SPECIFIC' && Array.isArray(dto.regulationAmounts)) {
      regulationAmounts = dto.regulationAmounts.map((r) => {
        const slabs = Array.isArray(r.slabs)
          ? r.slabs.map((s) => ({
              startDate: s.startDate ? String(s.startDate).trim() : null,
              endDate: s.endDate ? String(s.endDate).trim() : null,
              amount: Math.max(0, Number(s.amount || 0)),
              label: s.label ? String(s.label).trim() : '',
            }))
          : [];

        return {
          regulationId: r.regulationId != null ? String(r.regulationId) : '',
          regulationCode: String(r.regulationCode || '').trim().toUpperCase(),
          amount: Math.max(0, Number(r.amount || 0)),
          effectiveUntil: r.effectiveUntil ? String(r.effectiveUntil).trim() : (slabs[0]?.endDate || null),
          amountAfterEnd: r.amountAfterEnd != null && !isNaN(Number(r.amountAfterEnd)) ? Math.max(0, Number(r.amountAfterEnd)) : (slabs[1]?.amount || null),
          slabs,
        };
      }).filter((r) => r.regulationCode);
    }

    const head = this.feeHeadRepo.create({
      name,
      code,
      description: dto.description?.trim() || null,
      type,
      defaultAmount,
      regulationAmounts,
      isMandatory: Boolean(dto.isMandatory),
      isActive: dto.isActive !== false,
    });

    const saved = await this.feeHeadRepo.save(head);

    await this.syncToMongo({
      name: saved.name,
      code: saved.code,
      description: saved.description,
      type: saved.type,
      defaultAmount: saved.defaultAmount,
      regulationAmounts: saved.regulationAmounts,
      isMandatory: saved.isMandatory,
      isActive: saved.isActive,
    });

    return this.findOne(saved.id);
  }

  async update(id, dto) {
    const head = await this.feeHeadRepo.findOne({
      where: [{ id: isNaN(Number(id)) ? -1 : Number(id) }],
    });
    if (!head) {
      throw AppError.notFound('Fee Head not found');
    }

    if (dto.code && dto.code.trim().toUpperCase() !== head.code) {
      const code = dto.code.trim().toUpperCase();
      const existingCode = await this.feeHeadRepo.findOne({ where: { code } });
      if (existingCode) {
        throw AppError.badRequest(`Fee head code '${code}' already exists`);
      }
      head.code = code;
    }

    if (dto.name && dto.name.trim() !== head.name) {
      const name = dto.name.trim();
      const existingName = await this.feeHeadRepo.findOne({ where: { name } });
      if (existingName) {
        throw AppError.badRequest(`Fee head name '${name}' already exists`);
      }
      head.name = name;
    }

    if (dto.description !== undefined) {
      head.description = dto.description ? dto.description.trim() : null;
    }

    if (dto.type !== undefined) {
      head.type = dto.type === 'REGULATION_SPECIFIC' ? 'REGULATION_SPECIFIC' : 'GLOBAL';
    }

    if (dto.defaultAmount !== undefined) {
      head.defaultAmount = Math.max(0, Number(dto.defaultAmount || 0));
    }

    if (dto.regulationAmounts !== undefined) {
      if (Array.isArray(dto.regulationAmounts)) {
        head.regulationAmounts = dto.regulationAmounts.map((r) => {
          const slabs = Array.isArray(r.slabs)
            ? r.slabs.map((s) => ({
                startDate: s.startDate ? String(s.startDate).trim() : null,
                endDate: s.endDate ? String(s.endDate).trim() : null,
                amount: Math.max(0, Number(s.amount || 0)),
                label: s.label ? String(s.label).trim() : '',
              }))
            : [];

          return {
            regulationId: r.regulationId != null ? String(r.regulationId) : '',
            regulationCode: String(r.regulationCode || '').trim().toUpperCase(),
            amount: Math.max(0, Number(r.amount || 0)),
            effectiveUntil: r.effectiveUntil ? String(r.effectiveUntil).trim() : (slabs[0]?.endDate || null),
            amountAfterEnd: r.amountAfterEnd != null && !isNaN(Number(r.amountAfterEnd)) ? Math.max(0, Number(r.amountAfterEnd)) : (slabs[1]?.amount || null),
            slabs,
          };
        }).filter((r) => r.regulationCode);
      } else {
        head.regulationAmounts = [];
      }
    }

    if (dto.isMandatory !== undefined) {
      head.isMandatory = Boolean(dto.isMandatory);
    }

    if (dto.isActive !== undefined) {
      head.isActive = Boolean(dto.isActive);
    }

    const updated = await this.feeHeadRepo.save(head);

    await this.syncToMongo({
      name: updated.name,
      code: updated.code,
      description: updated.description,
      type: updated.type,
      defaultAmount: updated.defaultAmount,
      regulationAmounts: updated.regulationAmounts,
      isMandatory: updated.isMandatory,
      isActive: updated.isActive,
    });

    // Dynamically sync all pending fee records containing this fee head to use its updated rates
    await this.syncPendingRecordsForHead(updated);

    return this.findOne(updated.id);
  }

  async remove(id) {
    const head = await this.feeHeadRepo.findOne({
      where: [{ id: isNaN(Number(id)) ? -1 : Number(id) }],
    });
    if (!head) {
      throw AppError.notFound('Fee Head not found');
    }

    await this.feeHeadRepo.remove(head);
    await this.syncDeleteToMongo(head.code);
    return { success: true, message: `Fee head '${head.name}' deleted successfully` };
  }

  /**
   * Syncs all pending fee records containing this fee head to use its updated rates.
   */
  async syncPendingRecordsForHead(head) {
    if (!head || !head.code) return;

    try {
      const records = await this.examFeeRecordRepo.find({
        where: { status: 'pending' },
        relations: ['exam'],
      });

      for (const record of records) {
        await this.syncFeeHeadAmountsForRecord(record);
      }
    } catch (err) {
      console.warn('syncPendingRecordsForHead warning:', err.message);
    }
  }

  /**
   * Syncs all line items in a pending fee record's breakdown with the latest active Fee Head rates.
   */
  async syncFeeHeadAmountsForRecord(record) {
    if (!record || record.status === 'paid') return false;

    let breakdown = [];
    try {
      breakdown = typeof record.feeBreakdown === 'string'
        ? JSON.parse(record.feeBreakdown)
        : (record.feeBreakdown || []);
    } catch {
      breakdown = [];
    }

    if (!Array.isArray(breakdown) || breakdown.length === 0) return false;

    let changed = false;
    const regCode = record.exam?.batch || record.studentRollNumber;

    for (const item of breakdown) {
      const code = item.feeHeadCode || item.subjectCode;
      if (!code) continue;

      try {
        const head = await this.feeHeadRepo.findOne({
          where: { code: String(code).trim().toUpperCase(), isActive: true },
        });

        if (head) {
          const res = await this.resolveAmount(head.id, regCode);
          if (res && res.amount != null) {
            const newAmt = Number(res.amount);
            if (Number(item.amount) !== newAmt) {
              item.amount = newAmt;
              item.feeHeadName = head.name;
              item.feeHeadType = head.type;
              item.appliedRegulation = res.appliedRegulation;
              changed = true;
            }
          }
        }
      } catch {
        // ignore missing or inactive heads
      }
    }

    if (changed) {
      const newBaseFee = breakdown.reduce((sum, it) => sum + Number(it.amount || 0), 0);
      const newTotalAmount = newBaseFee + Number(record.lateFee || 0);

      record.feeBreakdown = breakdown;
      record.baseFee = newBaseFee;
      record.totalAmount = newTotalAmount;

      await this.examFeeRecordRepo.save(record);
      return true;
    }

    return false;
  }

  /**
   * Helper method to find the matching regulation entry in a Fee Head's regulationAmounts array.
   * Matches by exact regulationCode, regulationId, DB batch scope, admission year digits from PIN/batch, or substring.
   */
  async findMatchingRegulationEntry(head, regulationInput) {
    if (!head.regulationAmounts || head.regulationAmounts.length === 0) {
      return null;
    }

    const inputRaw = String(regulationInput || '').trim();
    const inputUpper = inputRaw.toUpperCase();

    if (!inputUpper) {
      return head.regulationAmounts[0] || null;
    }

    // 1. Direct match by regulationCode or regulationId
    let match = head.regulationAmounts.find(
      (r) =>
        String(r.regulationCode).trim().toUpperCase() === inputUpper ||
        String(r.regulationId).trim() === inputUpper,
    );
    if (match) return match;

    // 2. Database lookup in regulation_scopes if input is a batch or roll number
    if (this.regulationScopeRepo) {
      try {
        const scope = await this.regulationScopeRepo
          .createQueryBuilder('scope')
          .leftJoinAndSelect('scope.regulation', 'regulation')
          .where('LOWER(scope.batch) = LOWER(:b)', { b: inputRaw })
          .getOne();

        if (scope && scope.regulation) {
          const regCodeFromDb = String(scope.regulation.code).trim().toUpperCase();
          const regIdFromDb = String(scope.regulation.id);

          match = head.regulationAmounts.find(
            (r) =>
              String(r.regulationCode).trim().toUpperCase() === regCodeFromDb ||
              String(r.regulationId).trim() === regIdFromDb,
          );
          if (match) return match;
        }
      } catch (err) {
        console.warn('RegulationScope lookup warning in FeeHeadsService:', err.message);
      }
    }

    // 3. Extract admission year digits from PIN, Batch, or Regulation string
    // Examples: PIN "23031A0501" -> "23", Batch "2023-2027" -> "23", Regulation "R23" -> "23"
    let extractedYearDigits = null;
    const pinMatch = inputUpper.match(/^(\d{2})/); // First 2 digits of PIN/roll number (e.g. 23)
    if (pinMatch) {
      extractedYearDigits = pinMatch[1];
    } else {
      const yearMatch = inputUpper.match(/(20)?(\d{2})/); // e.g. 2023 or 23
      if (yearMatch) {
        extractedYearDigits = yearMatch[2];
      }
    }

    if (extractedYearDigits) {
      match = head.regulationAmounts.find((r) => {
        const regCodeDigits = String(r.regulationCode).replace(/\D/g, ''); // "R23" -> "23"
        return regCodeDigits === extractedYearDigits;
      });
      if (match) return match;
    }

    // 4. Substring / partial match
    match = head.regulationAmounts.find((r) => {
      const codeUpper = String(r.regulationCode).trim().toUpperCase();
      const codeClean = codeUpper.replace(/[^A-Z0-9]/g, '');
      const inputClean = inputUpper.replace(/[^A-Z0-9]/g, '');
      return inputClean.includes(codeClean) || codeClean.includes(inputClean);
    });
    if (match) return match;

    // 5. Fallback to first configured regulation entry if available
    return head.regulationAmounts[0] || null;
  }

  /**
   * Resolves the fee amount for a given fee head and regulation code.
   * If type === 'GLOBAL', returns defaultAmount.
   * If type === 'REGULATION_SPECIFIC', matches regulationCode in regulationAmounts.
   * Evaluates multi-slabs or effectiveUntil time period.
   */
  async resolveAmount(headId, regulationCode, asOfDate) {
    const head = await this.findOne(headId);
    if (!head.isActive) {
      throw AppError.badRequest(`Fee Head '${head.name}' is currently inactive`);
    }

    if (head.type === 'GLOBAL') {
      return {
        feeHeadId: head.id,
        code: head.code,
        name: head.name,
        type: 'GLOBAL',
        appliedRegulation: null,
        amount: Number(head.defaultAmount || 0),
      };
    }

    const match = await this.findMatchingRegulationEntry(head, regulationCode);

    let amount = match ? Number(match.amount) : Number(head.defaultAmount || 0);
    let isTimePeriodExpired = false;
    let activeSlabLabel = null;

    const now = asOfDate ? new Date(asOfDate) : new Date();

    if (match && Array.isArray(match.slabs) && match.slabs.length > 0) {
      let matchedSlab = null;
      for (const slab of match.slabs) {
        const start = slab.startDate ? new Date(`${slab.startDate}T00:00:00.000Z`) : null;
        const end = slab.endDate ? new Date(`${slab.endDate}T23:59:59.999Z`) : null;

        if ((!start || now >= start) && (!end || now <= end)) {
          matchedSlab = slab;
          break;
        }
      }

      if (matchedSlab) {
        amount = Number(matchedSlab.amount != null && !isNaN(Number(matchedSlab.amount)) && Number(matchedSlab.amount) > 0 ? matchedSlab.amount : match.amount);
        activeSlabLabel = matchedSlab.label || null;
      } else {
        // If after all slabs, take the last slab's amount or amountAfterEnd
        const lastSlab = match.slabs[match.slabs.length - 1];
        if (lastSlab) {
          amount = Number(lastSlab.amount != null && !isNaN(Number(lastSlab.amount)) && Number(lastSlab.amount) > 0 ? lastSlab.amount : (match.amountAfterEnd ?? match.amount));
          isTimePeriodExpired = true;
        }
      }
    } else if (match && match.effectiveUntil) {
      const endDate = new Date(`${match.effectiveUntil}T23:59:59.999Z`);
      if (now > endDate && match.amountAfterEnd != null && !isNaN(Number(match.amountAfterEnd))) {
        amount = Number(match.amountAfterEnd);
        isTimePeriodExpired = true;
      }
    }

    return {
      feeHeadId: head.id,
      code: head.code,
      name: head.name,
      type: 'REGULATION_SPECIFIC',
      appliedRegulation: match ? match.regulationCode : String(regulationCode || 'DEFAULT').toUpperCase(),
      isCustomForRegulation: Boolean(match),
      isTimePeriodExpired,
      effectiveUntil: match?.effectiveUntil || null,
      amountAfterEnd: match?.amountAfterEnd != null ? Number(match.amountAfterEnd) : null,
      amount,
    };
  }

  /**
   * Applies a fee head line item to an existing or newly created ExamFeeRecord for a student.
   */
  async applyFeeHeadToRecord(feeRecordId, headId, regulationCode, customAmount, studentRollNumber, studentName) {
    let record = null;
    if (feeRecordId && !isNaN(Number(feeRecordId))) {
      record = await this.examFeeRecordRepo.findOne({
        where: { id: Number(feeRecordId) },
      });
    }

    if (!record && studentRollNumber) {
      const roll = String(studentRollNumber).trim();
      record = await this.examFeeRecordRepo.findOne({
        where: {
          studentRollNumber: roll,
          status: 'pending',
        },
        order: { createdAt: 'DESC' },
      });

      if (!record) {
        const newRecord = this.examFeeRecordRepo.create({
          studentRollNumber: roll,
          studentName: studentName ? String(studentName).trim() : roll,
          examId: null,
          baseFee: 0,
          lateFee: 0,
          totalAmount: 0,
          status: 'pending',
          feeBreakdown: [],
        });
        record = await this.examFeeRecordRepo.save(newRecord);
      }
    }

    if (!record) {
      throw AppError.notFound('Fee record not found');
    }

    if (record.status === 'paid') {
      throw AppError.badRequest('Cannot add fee head to an already paid fee record');
    }

    // Sync all existing breakdown items with latest active Fee Head rates first
    await this.syncFeeHeadAmountsForRecord(record);

    const headResolution = await this.resolveAmount(headId, regulationCode);
    const amountToApply = customAmount != null ? Math.max(0, Number(customAmount)) : headResolution.amount;

    let breakdown = [];
    try {
      breakdown = typeof record.feeBreakdown === 'string'
        ? JSON.parse(record.feeBreakdown)
        : (record.feeBreakdown || []);
    } catch {
      breakdown = [];
    }

    // Check if this fee head is already applied
    const existingIndex = breakdown.findIndex((item) => item.feeHeadCode === headResolution.code || item.subjectCode === headResolution.code);

    const newItem = {
      subjectCode: headResolution.code,
      subjectName: headResolution.name,
      amount: amountToApply,
      feeHeadCode: headResolution.code,
      feeHeadName: headResolution.name,
      feeHeadType: headResolution.type,
      appliedRegulation: headResolution.appliedRegulation,
    };

    if (existingIndex >= 0) {
      breakdown[existingIndex] = newItem;
    } else {
      breakdown.push(newItem);
    }

    const newBaseFee = breakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const newTotalAmount = newBaseFee + Number(record.lateFee || 0);

    record.feeBreakdown = breakdown;
    record.baseFee = newBaseFee;
    record.totalAmount = newTotalAmount;

    await this.examFeeRecordRepo.save(record);
    return record;
  }
}

module.exports = { FeeHeadsService };
