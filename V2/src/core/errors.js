class AppError extends Error {
  constructor(code, message, extras = {}) {
    super(message);
    this.code = code;
    this.name = "AppError";
    this.statusCode = extras.statusCode || 400;
    this.httpStatus = extras.httpStatus || null;
    this.step = extras.step || null;
    this.vtexResponse = extras.vtexResponse || null;
    this.steps = extras.steps || [];
  }
}

class CatalogError extends AppError {
  constructor(code, message) {
    super(code, message, { statusCode: 404 });
    this.name = "CatalogError";
  }
}

class FlowNotHomologatedError extends AppError {
  constructor(type) {
    super(
      "FLOW_NOT_HOMOLOGATED",
      `Fluxo "${type}" ainda não foi homologado com evidência real da VTEX. Payloads não serão inventados.`,
      { statusCode: 422 }
    );
    this.name = "FlowNotHomologatedError";
  }
}

class ValidationError extends AppError {
  constructor(message, extras = {}) {
    super("VALIDATION_ERROR", message, { statusCode: 400, ...extras });
    this.name = "ValidationError";
  }
}

module.exports = {
  AppError,
  CatalogError,
  FlowNotHomologatedError,
  ValidationError,
};
