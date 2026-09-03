'use strict';

/**
 * Ensures subject_types exists and has the built-in defaults when empty.
 * Safe to run repeatedly (synchronize may already create the table).
 */
async function ensureSubjectTypesTable(dataSource, logger) {
  const queryRunner = dataSource.createQueryRunner();
  try {
    const hasTable = await queryRunner.hasTable('subject_types');
    if (!hasTable) {
      await dataSource.query(`
        CREATE TABLE subject_types (
          id INT NOT NULL AUTO_INCREMENT,
          code VARCHAR(50) NOT NULL,
          name VARCHAR(100) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          sortOrder INT NOT NULL DEFAULT 0,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE INDEX IDX_subject_types_code (code),
          PRIMARY KEY (id)
        ) ENGINE=InnoDB
      `);
      logger?.info?.(
        { event: 'schema.subject_types.created' },
        'Created subject_types table',
      );
    }

    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*) AS count FROM subject_types',
    );
    if (Number(count) === 0) {
      await dataSource.query(`
        INSERT INTO subject_types (code, name, status, sortOrder)
        VALUES
          ('theory', 'Theory', 'active', 1),
          ('practical', 'Practical', 'active', 2),
          ('laboratory', 'Laboratory', 'active', 3)
      `);
      logger?.info?.(
        { event: 'schema.subject_types.seeded' },
        'Seeded default subject types',
      );
    }
  } finally {
    await queryRunner.release();
  }
}

module.exports = { ensureSubjectTypesTable };
