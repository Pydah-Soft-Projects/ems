'use strict';

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('node:path');
const { buildMysqlSslOptions } = require('../src/config/mysql-ssl');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function fixAllTables() {
  const host = process.env.EXAM_PORTAL_DB_HOST;
  const port = parseInt(process.env.EXAM_PORTAL_DB_PORT || '3306', 10);
  const user = process.env.EXAM_PORTAL_DB_USER || 'admin';
  const password = process.env.EXAM_PORTAL_DB_PASSWORD || '';
  const sourceDb = 'examination_portal';
  const targetDb = 'examination_portal_testing';

  console.log(`Connecting to RDS MySQL (${host}:${port})...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    ssl: buildMysqlSslOptions(true),
  });

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
    [sourceDb]
  );

  for (const row of tables) {
    const table = row.TABLE_NAME;
    // Check if column order differs
    const [sourceCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [sourceDb, table]
    );
    const colNames = sourceCols.map((c) => c.COLUMN_NAME);

    // Drop and recreate table LIKE source to guarantee 100% identical schema and column order
    await conn.query(`DROP TABLE IF EXISTS \`${targetDb}\`.\`${table}\``);
    await conn.query(`CREATE TABLE \`${targetDb}\`.\`${table}\` LIKE \`${sourceDb}\`.\`${table}\``);

    // Copy data with explicit column list
    const colsList = colNames.map((c) => `\`${c}\``).join(', ');
    const [res] = await conn.query(
      `INSERT INTO \`${targetDb}\`.\`${table}\` (${colsList}) SELECT ${colsList} FROM \`${sourceDb}\`.\`${table}\``
    );
    console.log(`✓ Recreated and cloned \`${table}\` (${res.affectedRows} rows)`);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  console.log(`\n🎉 All tables in ${targetDb} are now 100% identical in schema, column order, and data to ${sourceDb}!`);
}

fixAllTables().catch((err) => {
  console.error('Error fixing tables:', err);
  process.exit(1);
});

