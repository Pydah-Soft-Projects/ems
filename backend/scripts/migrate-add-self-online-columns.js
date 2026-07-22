'use strict';

/**
 * Migration: Add selfOnline payment columns to payment_gateway_settings table
 * Run: npm run migrate:add-self-online-columns
 * 
 * This migration adds support for college UPI/self-online payment configuration
 * without requiring a payment gateway. Includes:
 * - selfOnlineEnabled: Enable/disable college UPI payments
 * - selfOnlineUpiId: College UPI ID for receiving payments
 * - selfOnlineMerchantName: Merchant name shown to students
 * - selfOnlinePaymentNote: Payment description/note
 * - selfOnlineExpiryHours: QR code expiry time in hours
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

    console.log(`\n=== EMS Payment Settings Migration ===`);
    console.log(`Connecting to MySQL at ${host}:${port}, database: ${dbName}...\n`);

    const connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database: dbName,
        ssl: buildMysqlSslOptions(ssl),
    });

    try {
        // Check current table structure
        console.log('📋 Checking current table structure...');
        const [columns] = await connection.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_NAME = 'payment_gateway_settings' AND TABLE_SCHEMA = ?`,
            [dbName]
        );

        const existingColumns = columns.map(col => col.COLUMN_NAME);
        console.log(`Existing columns: ${existingColumns.join(', ')}\n`);

        // Define new columns to add
        const columnsToAdd = [
            { name: 'selfOnlineEnabled', definition: "BOOLEAN DEFAULT FALSE COMMENT 'Enable college UPI/self-online payments'" },
            { name: 'selfOnlineUpiId', definition: "VARCHAR(150) NULL COMMENT 'College UPI ID for receiving payments'" },
            { name: 'selfOnlineMerchantName', definition: "VARCHAR(150) NULL COMMENT 'Merchant name shown to students'" },
            { name: 'selfOnlinePaymentNote', definition: "VARCHAR(100) NULL DEFAULT 'Exam Fee' COMMENT 'Payment description shown to students'" },
            { name: 'selfOnlineExpiryHours', definition: "INT DEFAULT 48 COMMENT 'QR code expiry time in hours'" },
        ];

        // Add missing columns
        let addedCount = 0;
        for (const col of columnsToAdd) {
            if (!existingColumns.includes(col.name)) {
                console.log(`✏️  Adding column: ${col.name}`);
                await connection.query(
                    `ALTER TABLE payment_gateway_settings ADD COLUMN ${col.name} ${col.definition}`
                );
                addedCount++;
            } else {
                console.log(`✅ Column already exists: ${col.name}`);
            }
        }

        console.log(`\n${addedCount} column(s) added successfully!`);

        // Verify changes
        console.log('\n📋 Verifying updated table structure...');
        const [updatedColumns] = await connection.query(
            `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_NAME = 'payment_gateway_settings' AND TABLE_SCHEMA = ?
             ORDER BY ORDINAL_POSITION`,
            [dbName]
        );

        console.log('\nUpdated table structure:');
        updatedColumns.forEach(col => {
            console.log(
                `  • ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} ${col.IS_NULLABLE === 'YES' ? '(nullable)' : '(NOT NULL)'} ${col.COLUMN_DEFAULT ? `[DEFAULT: ${col.COLUMN_DEFAULT}]` : ''}`
            );
        });

        console.log('\n✨ Migration completed successfully!\n');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
