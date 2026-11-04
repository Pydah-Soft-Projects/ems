'use strict';

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('node:path');
const { buildMysqlSslOptions } = require('../src/config/mysql-ssl');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function cloneDatabase(options = {}) {
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

  console.log(`Found ${tables.length} tables in ${sourceDb}. Cloning to ${targetDb}...`);

  for (const row of tables) {
    const table = row.TABLE_NAME;
    try {
      // Check if table exists in targetDb
      const [check] = await conn.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [targetDb, table]
      );
      if (check.length === 0) {
        // Create table like source
        await conn.query(`CREATE TABLE \`${targetDb}\`.\`${table}\` LIKE \`${sourceDb}\`.\`${table}\``);
      }
      // Truncate target table
      await conn.query(`TRUNCATE TABLE \`${targetDb}\`.\`${table}\``);
      // Copy rows
      const [res] = await conn.query(
        `INSERT INTO \`${targetDb}\`.\`${table}\` SELECT * FROM \`${sourceDb}\`.\`${table}\``
      );
      console.log(`  ✓ Cloned \`${table}\` (${res.affectedRows} rows)`);
    } catch (err) {
      console.warn(`  ⚠ Warning on \`${table}\`: ${err.message}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  console.log(`\n🎉 Successfully cloned all live data into ${targetDb}!`);
}

cloneDatabase().catch((err) => {
  console.error('Cloning failed:', err);
  process.exit(1);
});

