'use strict';

/**
 * One-shot fix for subject_mapping_entries unique-index sync failure on MySQL.
 * MySQL refuses DROP of the old unique index because FKs use it — we add
 * dedicated FK indexes first, then recreate the unique constraint with sectionKey.
 *
 * Usage: npm run fix:indexes
 */

require('dotenv/config');
const { createExamPortalDataSource } = require('../src/database/data-source');

async function hasIndex(qr, name) {
    const rows = (await qr.query(`SHOW INDEX FROM subject_mapping_entries WHERE Key_name = '${name}'`));
    return rows.length > 0;
}
async function hasColumn(qr, name) {
    const columns = await qr.query(`SHOW COLUMNS FROM subject_mapping_entries`);
    return columns.some((c) => c.Field === name);
}
async function main() {
    // Force real MySQL — do not pick up a leftover SIMULATE_USE_SQLITE from the shell
    delete process.env.SIMULATE_USE_SQLITE;
    process.env.SIMULATE_USE_SQLITE = 'false';
    const ds = createExamPortalDataSource();
    ds.options.synchronize = false;
    await ds.initialize();
    const qr = ds.createQueryRunner();
    try {
        await qr.connect();
        await qr.startTransaction();
        if (!(await hasIndex(qr, 'IDX_sme_regulationId'))) {
            await qr.query(`CREATE INDEX IDX_sme_regulationId ON subject_mapping_entries (regulationId)`);
            console.log('Created IDX_sme_regulationId');
        }
        if (!(await hasIndex(qr, 'IDX_sme_subjectId'))) {
            await qr.query(`CREATE INDEX IDX_sme_subjectId ON subject_mapping_entries (subjectId)`);
            console.log('Created IDX_sme_subjectId');
        }
        if (!(await hasColumn(qr, 'sectionMode'))) {
            await qr.query(`
        ALTER TABLE subject_mapping_entries
        ADD COLUMN sectionMode VARCHAR(20) NOT NULL DEFAULT 'all'
      `);
            console.log('Added column sectionMode');
        }
        if (!(await hasColumn(qr, 'sections'))) {
            await qr.query(`
        ALTER TABLE subject_mapping_entries
        ADD COLUMN sections TEXT NULL
      `);
            console.log('Added column sections');
        }
        if (!(await hasColumn(qr, 'sectionKey'))) {
            await qr.query(`
        ALTER TABLE subject_mapping_entries
        ADD COLUMN sectionKey VARCHAR(255) NOT NULL DEFAULT '*'
      `);
            console.log('Added column sectionKey');
        }
        if (!(await hasIndex(qr, 'UQ_sme_assignment_scope'))) {
            await qr.query(`
        CREATE UNIQUE INDEX UQ_sme_assignment_scope ON subject_mapping_entries
        (regulationId, subjectId, collegeId, courseId, branchId, batch, yearOfStudy, semester, sectionKey)
      `);
            console.log('Created UQ_sme_assignment_scope');
        }
        const indexes = (await qr.query(`SHOW INDEX FROM subject_mapping_entries`));
        const uniqueNames = [
            ...new Set(indexes
                .filter((i) => Number(i.Non_unique) === 0 && i.Key_name !== 'PRIMARY')
                .map((i) => i.Key_name)),
        ];
        for (const name of uniqueNames) {
            if (name === 'UQ_sme_assignment_scope')
                continue;
            await qr.query(`DROP INDEX \`${name}\` ON subject_mapping_entries`);
            console.log(`Dropped old unique index ${name}`);
        }
        await qr.commitTransaction();
        console.log('subject_mapping_entries index fix complete');
    }
    catch (err) {
        await qr.rollbackTransaction();
        throw err;
    }
    finally {
        await qr.release();
        await ds.destroy();
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
