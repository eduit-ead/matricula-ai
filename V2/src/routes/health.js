const express = require("express");
const { config } = require("../core/config");

const healthRouter = express.Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/api/status", (_req, res) => {
  res.json({
    status: "ok",
    allowRealEnrollments: config.allowRealEnrollments,
  });
});

module.exports = { healthRouter };
