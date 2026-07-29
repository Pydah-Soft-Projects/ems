/**
 * PM2 process file for EMS (backend + frontend).
 *
 * On Amazon Linux EC2 (repo at /home/ec2-user/ems):
 *
 *   cd /home/ec2-user/ems
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 *
 * Useful commands:
 *   pm2 reload ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 status
 *   pm2 logs
 */

module.exports = {
  apps: [
    {
      name: 'ems-backend',
      cwd: '/home/ec2-user/ems/backend',
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
      cwd: '/home/ec2-user/ems/frontend',
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
