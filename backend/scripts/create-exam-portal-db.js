'use strict';

/**
 * Creates the `examination_portal` database on the RDS MySQL cluster.
 * Run once before starting the app: npm run db:setup
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('node:path');
const { buildMysqlSslOptions } = require('../src/config/mysql-ssl');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    const host = process.env.EXAM_PORTAL_DB_HOST ||
        'student-database.cfu0qmo26gh3.ap-south-1.rds.amazonaws.com';
    const port = parseInt(process.env.EXAM_PORTAL_DB_PORT || '3306', 10);
    const user = process.env.EXAM_PORTAL_DB_USER || 'admin';
    const password = process.env.EXAM_PORTAL_DB_PASSWORD || '';
    const dbName = process.env.EXAM_PORTAL_DB_NAME || 'examination_portal';
    const ssl = (process.env.EXAM_PORTAL_DB_SSL || 'true') === 'true';
    console.log(`Connecting to MySQL at ${host}:${port} as ${user}...`);
    const connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        ssl: buildMysqlSslOptions(ssl),
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const [rows] = await connection.query(`SHOW DATABASES LIKE '${dbName.replace(/'/g, "''")}'`);
    console.log(`Database '${dbName}' is ready.`);
    console.log(rows);
    await connection.end();
}
main().catch((err) => {
    console.error('Failed to create exam portal database:', err.message);
    process.exit(1);
});
