const path = require("path");
const express = require("express");
const { healthRouter } = require("./routes/health");
const { catalogRouter } = require("./routes/catalog");
const { enrollmentRouter } = require("./routes/enrollment");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(healthRouter);
  app.use(catalogRouter);
  app.use(enrollmentRouter);
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use((err, _req, res, _next) => {
    console.error(JSON.stringify({ step: "unhandled", status: "error", message: err.message }));
    res.status(500).json({
      success: false,
      enrollmentCompleted: false,
      status: "inscricao_nao_realizada",
      nextAction: "retry",
      errorCode: "UNHANDLED",
      message: err.message,
      error: { code: "UNHANDLED", message: err.message, step: null, httpStatus: null, vtexResponse: null },
    });
  });
  return app;
}

module.exports = { createApp };
