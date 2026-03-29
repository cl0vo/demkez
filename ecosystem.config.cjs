module.exports = {
  apps: [
    {
      name: "demohub-bot",
      script: "src/index.js",
      interpreter: "node",
      node_args: "--env-file-if-exists=.env",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
