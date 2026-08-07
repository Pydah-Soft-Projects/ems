const test = require('node:test');
const assert = require('node:assert/strict');
const { CanaraVpaService } = require('../src/settings/canara-vpa.service');

function createRepo(initialRows = []) {
  const rows = [...initialRows];
  return {
    rows,
    async find(options = {}) {
      let result = [...rows];
      if (options.where) {
        result = result.filter((row) => {
          if (options.where.id !== undefined && row.id !== options.where.id) {
            return false;
          }
          if (options.where.isActive !== undefined && row.isActive !== options.where.isActive) {
            return false;
          }
          return true;
        });
      }
      if (options.order) {
        const dir = options.order.isActive === 'DESC' ? 'DESC' : 'ASC';
        result.sort((a, b) => {
          if (dir === 'DESC') {
            return Number(b.isActive) - Number(a.isActive);
          }
          return Number(a.isActive) - Number(b.isActive);
        });
      }
      return result;
    },
    async findOne(options = {}) {
      return (await this.find(options))[0] || null;
    },
    create(data) {
      return { ...data };
    },
    async save(data) {
      const idx = rows.findIndex((row) => row.id === data.id);
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...data };
        return rows[idx];
      }
      const created = { id: rows.length + 1, ...data };
      rows.push(created);
      return created;
    },
    async update(criteria, patch) {
      if (!criteria || Object.keys(criteria).length === 0) {
        for (const row of rows) {
          Object.assign(row, patch);
        }
        return rows;
      }
      for (const row of rows) {
        if (row.id === criteria.id) {
          Object.assign(row, patch);
          return row;
        }
      }
      return null;
    },
    async delete(criteria) {
      const idx = rows.findIndex((row) => row.id === criteria.id);
      if (idx >= 0) rows.splice(idx, 1);
      return { affected: idx >= 0 ? 1 : 0 };
    },
  };
}

test('setActiveVpa keeps only one active SID and returns the active one', async () => {
  const repo = createRepo([
    { id: 1, sid: 'SID001', upiId: 'a@cnrb', isActive: true },
    { id: 2, sid: 'SID002', upiId: 'b@cnrb', isActive: false },
  ]);
  const service = new CanaraVpaService(repo, { getConfig: async () => ({ mid: 'MID1', terminalId: 'T1', merchantName: 'Test Merch' }) });

  const active = await service.setActiveVpa(2);

  assert.equal(active.sid, 'SID002');
  assert.equal(active.isActive, true);
  const all = await repo.find();
  assert.equal(all.filter((row) => row.isActive).length, 1);
  assert.equal(all.find((row) => row.id === 1)?.isActive, false);
});

test('getActiveVpa returns the active record when present', async () => {
  const repo = createRepo([
    { id: 1, sid: 'SID001', upiId: 'a@cnrb', isActive: false },
    { id: 2, sid: 'SID002', upiId: 'b@cnrb', isActive: true },
  ]);
  const service = new CanaraVpaService(repo, { getConfig: async () => ({}) });

  const active = await service.getActiveVpa();

  assert.equal(active?.sid, 'SID002');
  assert.equal(active?.upiId, 'b@cnrb');
});
