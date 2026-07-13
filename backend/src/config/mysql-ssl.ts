/**
 * AWS RDS MySQL often fails with "self-signed certificate in certificate chain"
 * when rejectUnauthorized is true without the RDS CA bundle.
 *
 * Default: SSL enabled, certificate verification relaxed (common for RDS).
 * For strict verification, set MYSQL_SSL_REJECT_UNAUTHORIZED=true and provide
 * MYSQL_SSL_CA_PATH pointing to the AWS RDS combined CA bundle PEM file.
 */
import * as fs from 'fs';

export function buildMysqlSslOptions(
  sslEnabled: boolean,
  rejectUnauthorizedEnv?: string,
  caPathEnv?: string,
): { rejectUnauthorized: boolean; ca?: string } | undefined {
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
