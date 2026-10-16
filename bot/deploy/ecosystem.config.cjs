// pm2 用(VPS)。使い方: pm2 start /srv/dx-syokunin-website/bot/deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [{
    name: 'dx-syokunin-bot',
    cwd: '/srv/dx-syokunin-website/bot',
    script: 'src/index.mjs',
    interpreter: 'node',
    max_memory_restart: '400M',
    restart_delay: 5000,
    time: true,
  }],
};
