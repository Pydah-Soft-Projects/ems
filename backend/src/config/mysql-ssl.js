'use strict';

const fs = require('node:fs');

function buildMysqlSslOptions(sslEnabled, rejectUnauthorizedEnv, caPathEnv) {
  if (!sslEnabled) return undefined;

  const caPath = caPathEnv || process.env.MYSQL_SSL_CA_PATH;
  const rejectUnauthorized =
    (rejectUnauthorizedEnv ?? process.env.MYSQL_SSL_REJECT_UNAUTHORIZED) ===
    'true';

  if (caPath && fs.existsSync(caPath)) {
    return {
      ca: fs.readFileSync(caPath, 'utf8'),
      rejectUnauthorized,
    };
  }

  return { rejectUnauthorized };
}

module.exports = { buildMysqlSslOptions };
