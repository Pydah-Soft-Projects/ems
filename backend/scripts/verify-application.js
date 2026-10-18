'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.EXAM_PORTAL_DB_HOST,
    port: process.env.EXAM_PORTAL_DB_PORT,
    user: process.env.EXAM_PORTAL_DB_USER,
    password: process.env.EXAM_PORTAL_DB_PASSWORD,
    database: process.env.EXAM_PORTAL_DB_NAME,
    ssl: { rejectUnauthorized: false },
  });

  const [apps] = await connection.query("SELECT * FROM exam_applications WHERE studentRollNumber = '246T5A0501'");
  console.log('--- Exam Applications for 246T5A0501 ---');
  console.log(JSON.stringify(apps, null, 2));

  const [fees] = await connection.query("SELECT * FROM exam_fee_records WHERE studentRollNumber = '246T5A0501'");
  console.log('--- Exam Fee Records for 246T5A0501 ---');
  console.log(JSON.stringify(fees, null, 2));

  await connection.end();
}

main().catch(console.error);
