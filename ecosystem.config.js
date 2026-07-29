/**
 * PM2 process file for EMS (backend + frontend).
 *
 * Paths are relative to this file location, so it works whether the repo is at:
 *   /home/ec2-user/ems
 *   /home/ec2-user/ems/ems
 *   /var/www/ems
 *
 * Usage:
 *   cd /path/to/ems   # folder that contains this file
 *   pm2 start ecosystem.config.js
 *   pm2 reload ecosystem.config.js
 *   pm2 save
 *   pm2 startup
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
