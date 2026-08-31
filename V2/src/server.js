const { createApp } = require("./app");
const { config } = require("./core/config");

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({
      step: "server_listen",
      status: "ok",
      message: `listening ${config.host}:${config.port}`,
      allowRealEnrollments: config.allowRealEnrollments,
    })
  );
});

module.exports = { app, server };
