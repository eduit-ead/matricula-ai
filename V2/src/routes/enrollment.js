const express = require("express");
const { listFlows } = require("../flows");
const { runEnrollment } = require("../core/enrollment-engine");
const { AppError } = require("../core/errors");
const { config } = require("../core/config");

const enrollmentRouter = express.Router();

enrollmentRouter.get("/api/enrollment-types", (_req, res) => {
  res.json({ types: listFlows() });
});

enrollmentRouter.post("/api/enrollments", async (req, res) => {
  try {
    const result = await runEnrollment(req.body || {});
    let http = 200;
    if (!result.success) {
      const code = result.error?.code || result.errorCode;
      if (code === "VALIDATION_ERROR") http = 400;
      else if (code === "FLOW_NOT_HOMOLOGATED") http = 422;
      else http = 502;
    }
    res.status(http).json(result);
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    res.status(status).json({
      success: false,
      enrollmentCompleted: false,
      type: req.body?.type || null,
      status: "inscricao_nao_realizada",
      nextAction: "retry",
      errorCode: err.code || "INSCRICAO_FAILED",
      message: err.message,
      error: {
        code: err.code || "INSCRICAO_FAILED",
        message: err.message,
        step: err.step || null,
        httpStatus: err.httpStatus || null,
        vtexResponse: err.vtexResponse || null,
      },
      step: err.step || null,
      httpStatus: err.httpStatus || null,
      vtexResponse: err.vtexResponse || null,
      steps: err.steps || [],
      allowRealEnrollments: config.allowRealEnrollments,
    });
  }
});

module.exports = { enrollmentRouter };
