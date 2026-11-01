module.exports = {
  apps: [{
    name: 'picstar-hls-worker',
    cwd: __dirname,
    script: 'src/workers/hls-worker.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    kill_timeout: 15000,
    max_memory_restart: '384M',
    time: true,
  }],
};
