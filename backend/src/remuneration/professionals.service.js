'use strict';

const { AppError } = require('../common/errors');

class ProfessionalsService {
  constructor(professionalRepo) {
    this.professionalRepo = professionalRepo;
  }

  normalize(dto = {}) {
    return {
      name: String(dto.name || '').trim(),
      designation: dto.designation?.trim() || null,
      organization: dto.organization?.trim() || null,
      contactNumber: dto.contactNumber?.trim() || null,
      email: dto.email?.trim() || null,
      bankName: dto.bankName?.trim() || null,
      accountHolderName: dto.accountHolderName?.trim() || null,
      accountNumber: dto.accountNumber?.trim() || null,
      ifscCode: dto.ifscCode?.trim()?.toUpperCase() || null,
      bankAddress: dto.bankAddress?.trim() || null,
    };
  }

  async create(dto) {
    const data = this.normalize(dto);
    if (!data.name) {
      throw AppError.badRequest('Professional name is required');
    }
    const row = this.professionalRepo.create(data);
    return this.professionalRepo.save(row);
  }

  async findAll({ search, limit } = {}) {
    const take = Math.min(Math.max(parseInt(String(limit || 100), 10) || 100, 1), 200);
    const q = String(search || '').trim();
    if (!q) {
      return this.professionalRepo.find({
        order: { name: 'ASC' },
        take,
      });
    }
    const pattern = `%${q.toLowerCase()}%`;
    return this.professionalRepo
      .createQueryBuilder('p')
      .where('LOWER(p.name) LIKE :pattern', { pattern })
      .orWhere('LOWER(COALESCE(p.organization, \'\')) LIKE :pattern', { pattern })
      .orWhere('LOWER(COALESCE(p.email, \'\')) LIKE :pattern', { pattern })
      .orWhere('LOWER(COALESCE(p.contactNumber, \'\')) LIKE :pattern', { pattern })
      .orderBy('p.name', 'ASC')
      .take(take)
      .getMany();
  }

  async suggest(query, limit = 10) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    return this.findAll({ search: q, limit });
  }

  async findOne(id) {
    const row = await this.professionalRepo.findOne({ where: { id } });
    if (!row) throw AppError.notFound('Professional not found');
    return row;
  }

  async update(id, dto) {
    const row = await this.findOne(id);
    const data = this.normalize({ ...row, ...dto });
    if (!data.name) {
      throw AppError.badRequest('Professional name is required');
    }
    Object.assign(row, data);
    return this.professionalRepo.save(row);
  }

  async remove(id) {
    const row = await this.findOne(id);
    await this.professionalRepo.remove(row);
  }

  /**
   * Upsert by name+contact (or name+email) so bill creation can
   * persist/update the professional directory automatically.
   */
  async upsertFromBillSnapshot(snapshot) {
    const name = String(snapshot.professionalName || snapshot.name || '').trim();
    if (!name) return null;

    const contact = snapshot.contactNumber?.trim() || null;
    const email = snapshot.email?.trim() || null;

    let existing = null;
    if (contact) {
      existing = await this.professionalRepo.findOne({
        where: { name, contactNumber: contact },
      });
    }
    if (!existing && email) {
      existing = await this.professionalRepo.findOne({
        where: { name, email },
      });
    }
    if (!existing) {
      existing = await this.professionalRepo.findOne({
        where: { name },
      });
    }

    const payload = this.normalize({
      name,
      designation: snapshot.designation,
      organization: snapshot.organization,
      contactNumber: contact,
      email,
      bankName: snapshot.bankName,
      accountHolderName: snapshot.accountHolderName,
      accountNumber: snapshot.accountNumber,
      ifscCode: snapshot.ifscCode,
      bankAddress: snapshot.bankAddress,
    });

    if (existing) {
      Object.assign(existing, payload);
      return this.professionalRepo.save(existing);
    }
    return this.professionalRepo.save(this.professionalRepo.create(payload));
  }
}

module.exports = { ProfessionalsService };
