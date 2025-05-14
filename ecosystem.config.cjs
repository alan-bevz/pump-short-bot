// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "backtest",
      script: "./src/main.js",

      // робоча директорія
      cwd: "./",

      // автоматично підтягує змінні з .env
      env_file: ".env",

      // якщо потрібно — можна задати додаткові змінні на рівні PM2
      env: {
        NODE_ENV: "production"
      },

      // логування
      output: "./logs/out.log",
      error:  "./logs/err.log",
      log:    "./logs/combined.log",

      // рестарт при краші
      autorestart: false,
      watch: false
    }
  ]
};
