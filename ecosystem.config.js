/**
 * OPTIONAL fallback — run EMS with PM2 on the host (no Docker).
 *
 * Production CI/CD uses Docker only (scripts/deploy.sh + docker-compose.yml).
 * Do not start these apps with PM2 while Docker is bound to ports 3000/4000.
 *
 * Manual host mode only:
 *   cd /path/to/ems
 *   pm2 start ecosystem.config.js
 *   pm2 reload ecosystem.config.js
 *   pm2 save
 */

const path = require('path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'ems-backend',
      cwd: path.join(root, 'backend'),
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
    {
      name: 'ems-frontend',
      cwd: path.join(root, 'frontend'),
      script: 'node',
      args: 'node_modules/next/dist/bin/next start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
