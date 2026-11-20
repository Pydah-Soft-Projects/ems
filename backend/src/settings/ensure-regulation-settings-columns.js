'use strict';

/**
 * Ensures courseId, courseName, yearOfStudy, numInternals, and minPassPercentage
 * columns exist on regulation_internal_settings for course and year-wise dynamic setup.
 */
const REGULATION_SETTINGS_COLUMNS = [
  {
    name: 'courseId',
    definition: "INT NULL COMMENT 'Course ID for course-specific assessment scheme'",
  },
  {
    name: 'courseName',
    definition: "VARCHAR(255) NULL COMMENT 'Course name for course-specific assessment scheme'",
  },
  {
    name: 'yearOfStudy',
    definition: "INT NULL COMMENT 'Year of study (1, 2, 3, 4) for year-wise assessment scheme; NULL for all years'",
  },
  {
    name: 'numInternals',
    definition: "INT NOT NULL DEFAULT 2 COMMENT 'How many internal mid examinations conducted/evaluated'",
  },
  {
    name: 'minPassPercentage',
    definition: "DECIMAL(5,2) NOT NULL DEFAULT 40.00 COMMENT 'Internal pass target percentage'",
  },
  {
    name: 'evaluationComponents',
    definition: "LONGTEXT NULL COMMENT 'Dynamic assessment components JSON (e.g. mids, assignments, quizzes)'",
  },
  {
    name: 'customFormula',
    definition: "TEXT NULL COMMENT 'Custom formula expression string or template definition'",
  },
];

async function ensureRegulationSettingsColumns(dataSource, log = console) {
  if (!dataSource?.isInitialized) return { added: [], skipped: true };

  try {
    const rows = await dataSource.query(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'regulation_internal_settings'`,
    );
    const existing = new Set(rows.map((r) => r.name));

    if (!existing.has('id') && existing.size === 0) {
      // Table missing — let TypeORM synchronize create it.
      return { added: [], skipped: true };
    }

    const added = [];
    for (const col of REGULATION_SETTINGS_COLUMNS) {
      if (existing.has(col.name)) continue;
      await dataSource.query(
        `ALTER TABLE regulation_internal_settings ADD COLUMN \`${col.name}\` ${col.definition}`,
      );
      added.push(col.name);
    }

    // Ensure index on (regulationId, courseId, yearOfStudy)
    try {
      const indexRows = await dataSource.query(
        `SELECT INDEX_NAME AS name
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'regulation_internal_settings'
           AND INDEX_NAME = 'IDX_reg_internal_settings_course_year'`,
      );
      if (indexRows.length === 0) {
        await dataSource.query(
          `CREATE INDEX \`IDX_reg_internal_settings_course_year\` ON regulation_internal_settings (\`regulationId\`, \`courseId\`, \`yearOfStudy\`)`,
        );
      }
    } catch (idxErr) {
      // Ignore if index already exists
    }

    if (added.length && typeof log.info === 'function') {
      log.info(
        { event: 'schema.regulation_settings_columns_added', columns: added },
        'Added missing course-wise and year-wise regulation settings columns',
      );
    }

    return { added, skipped: false };
  } catch (err) {
    if (typeof log.warn === 'function') {
      log.warn({ err: err.message }, 'Failed to check or alter regulation_internal_settings columns');
    }
    return { added: [], error: err.message };
  }
}

module.exports = {
  REGULATION_SETTINGS_COLUMNS,
  ensureRegulationSettingsColumns,
};
