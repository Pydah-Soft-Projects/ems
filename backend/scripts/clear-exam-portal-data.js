'use strict';

/**
 * Clear ALL data from the Examination Portal MySQL database ONLY.
 *
 * Does NOT touch:
 *   - Student / SDMS database (STUDENT_DB_*)
 *   - Fee Management MongoDB (FEE_MANAGEMENT_MONGODB_URI)
 *   - HRMS MongoDB (HRMS_MONGODB_URI)
 *
 * Targets ONLY:
 *   EXAM_PORTAL_DB_HOST / EXAM_PORTAL_DB_NAME (from backend/.env)
 *
 * Safety:
 *   Default is DRY-RUN (lists tables + row counts, deletes nothing).
 *   To actually wipe:
 *
 *     node scripts/clear-exam-portal-data.js --execute --i-understand-exam-portal-only
 *
 * Optional:
 *   --keep-settings   keep payment_gateway_settings rows
 *   --keep-rbac       keep ems_roles / ems_users / ems_audit_logs
 *
 * Usage on AWS production (from backend folder, with prod .env loaded):
 *   1) Dry-run first:
 *        node scripts/clear-exam-portal-data.js
 *   2) Then wipe:
 *        node scripts/clear-exam-portal-data.js --execute --i-understand-exam-portal-only
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

/** Known EMS examination_portal tables (order for display only). */
const KNOWN_TABLES = [
  // Results
  'subject_results',
  'result_uploads',
  // Payments / applications
  'merchant_statement_txns',
  'merchant_statements',
  'payments',
  'exam_applications',
  'exam_fee_records',
  // Exams
  'late_fee_slabs',
  'exam_subjects',
  'exam_scopes',
  'exams',
  // Subjects / regulations
  'subject_mapping_entries',
  'subjects',
  'regulation_scopes',
  'regulations',
  // Remuneration
  'remuneration_bills',
  'professionals',
  // Settings / RBAC
  'payment_gateway_settings',
  'ems_audit_logs',
  'ems_users',
  'ems_roles',
];

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    execute: flags.has('--execute'),
    confirmed: flags.has('--i-understand-exam-portal-only'),
    keepSettings: flags.has('--keep-settings'),
    keepRbac: flags.has('--keep-rbac'),
    help: flags.has('--help') || flags.has('-h'),
  };
}

function printHelp() {
  console.log(`
Clear Examination Portal MySQL data ONLY (not student DB, not Fee Mgmt Mongo).

Dry-run (safe):
  node scripts/clear-exam-portal-data.js

Execute wipe:
  node scripts/clear-exam-portal-data.js --execute --i-understand-exam-portal-only

Options:
  --keep-settings   Do not truncate payment_gateway_settings
  --keep-rbac       Do not truncate ems_roles / ems_users / ems_audit_logs
  --help            Show this help
`);
}

function requireExamPortalEnv() {
  const host = process.env.EXAM_PORTAL_DB_HOST;
  const database = process.env.EXAM_PORTAL_DB_NAME;
  const user = process.env.EXAM_PORTAL_DB_USER;
  const password = process.env.EXAM_PORTAL_DB_PASSWORD;
  const port = Number(process.env.EXAM_PORTAL_DB_PORT || 3306);
  const ssl =
    process.env.EXAM_PORTAL_DB_SSL === 'true'
      ? {
          rejectUnauthorized:
            process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : undefined;

  if (!host || !database || !user) {
    throw new Error(
      'Missing EXAM_PORTAL_DB_HOST / EXAM_PORTAL_DB_NAME / EXAM_PORTAL_DB_USER in .env',
    );
  }

  // Hard guard: refuse if someone pointed this at the student DB name.
  const studentDb = String(process.env.STUDENT_DB_NAME || '').trim().toLowerCase();
  if (studentDb && database.trim().toLowerCase() === studentDb) {
    throw new Error(
      `Refusing to run: EXAM_PORTAL_DB_NAME ("${database}") equals STUDENT_DB_NAME. ` +
        'This script must never clear the student database.',
    );
  }

  return { host, port, user, password: password || '', database, ssl };
}

async function listTables(conn, database) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS name
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ?
       AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [database],
  );
  return rows.map((r) => r.name);
}

async function countRows(conn, table) {
  const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(rows[0]?.n || 0);
}

function tablesToClear(allTables, opts) {
  const skip = new Set();
  if (opts.keepSettings) skip.add('payment_gateway_settings');
  if (opts.keepRbac) {
    skip.add('ems_roles');
    skip.add('ems_users');
    skip.add('ems_audit_logs');
  }
  // Prefer known order, then any other tables present in the DB.
  const ordered = [
    ...KNOWN_TABLES.filter((t) => allTables.includes(t)),
    ...allTables.filter((t) => !KNOWN_TABLES.includes(t)),
  ];
  return ordered.filter((t) => !skip.has(t));
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const cfg = requireExamPortalEnv();
  console.log('=== Examination Portal clear script ===');
  console.log('Target DB only:');
  console.log(`  host:     ${cfg.host}`);
  console.log(`  port:     ${cfg.port}`);
  console.log(`  database: ${cfg.database}`);
  console.log(`  user:     ${cfg.user}`);
  console.log('');
  console.log('Will NOT touch:');
  console.log(`  student DB:  ${process.env.STUDENT_DB_NAME || '(not set)'}`);
  console.log(
    `  fee mgmt:    ${process.env.FEE_MANAGEMENT_MONGODB_URI ? '(configured — ignored)' : '(not set)'}`,
  );
  console.log(
    `  hrms:        ${process.env.HRMS_MONGODB_URI ? '(configured — ignored)' : '(not set)'}`,
  );
  console.log('');

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.ssl,
    multipleStatements: false,
  });

  try {
    const [[dbRow]] = await conn.query('SELECT DATABASE() AS db');
    if (String(dbRow.db) !== String(cfg.database)) {
      throw new Error(
        `Connected database mismatch: expected ${cfg.database}, got ${dbRow.db}`,
      );
    }

    const allTables = await listTables(conn, cfg.database);
    const targets = tablesToClear(allTables, opts);

    console.log(`Tables in ${cfg.database}: ${allTables.length}`);
    console.log(`Tables to clear: ${targets.length}`);
    if (opts.keepSettings) console.log('Keeping: payment_gateway_settings');
    if (opts.keepRbac) console.log('Keeping: ems_roles, ems_users, ems_audit_logs');
    console.log('');

    let totalRows = 0;
    const counts = [];
    for (const table of targets) {
      const n = await countRows(conn, table);
      totalRows += n;
      counts.push({ table, rows: n });
      console.log(`  ${table.padEnd(32)} ${n}`);
    }
    console.log('');
    console.log(`Total rows that would be deleted: ${totalRows}`);

    if (!opts.execute) {
      console.log('');
      console.log('DRY-RUN only — nothing deleted.');
      console.log(
        'To wipe for real:\n  node scripts/clear-exam-portal-data.js --execute --i-understand-exam-portal-only',
      );
      return;
    }

    if (!opts.confirmed) {
      throw new Error(
        'Refusing to execute without --i-understand-exam-portal-only',
      );
    }

    console.log('');
    console.log('EXECUTING wipe…');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const cleared = [];
    for (const table of targets) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
      cleared.push(table);
      console.log(`  truncated ${table}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('');
    console.log(`Done. Truncated ${cleared.length} tables in ${cfg.database}.`);
    console.log('Student DB and Fee Management were not modified.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
