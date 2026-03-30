module.exports = {
  apps: [
    {
      name: "demohub-bot",
      script: "src/index.js",
      interpreter: "node",
      node_args: "--env-file-if-exists=.env",
      instances: 1,
      watch: false,
      autorestart: true,
      max_memory_restart: "350M",
      min_uptime: "15s",
      restart_delay: 5000,
      kill_timeout: 10000,
      max_restarts: 20,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
