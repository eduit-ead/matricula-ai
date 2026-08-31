const express = require("express");
const { listCourses, listPoles, listDepartments, CatalogError } = require("../core/catalog-service");

const catalogRouter = express.Router();

catalogRouter.get("/api/catalog/courses", (req, res) => {
  try {
    const q = String(req.query.q || "");
    const department = req.query.department ? String(req.query.department) : undefined;
    const limit = Math.min(Number(req.query.limit) || 80, 200);
    res.json({
      courses: listCourses({ q, department, limit }).map((c) => ({
        productId: c.productId,
        skuId: c.skuId,
        name: c.courseName,
        department: c.department,
        productRef: c.productRef,
      })),
    });
  } catch (err) {
    if (err instanceof CatalogError) {
      return res.status(404).json({ success: false, errorCode: err.code, message: err.message });
    }
    throw err;
  }
});

catalogRouter.get("/api/catalog/poles", (req, res) => {
  try {
    const q = String(req.query.q || "");
    const limit = Math.min(Number(req.query.limit) || 80, 200);
    res.json({
      poles: listPoles({ q, limit }).map((p) => ({
        poleId: p.poleId,
        name: p.poloLabel,
        short: p.poloShort,
        cidade: p.cidade,
        estado: p.estado,
      })),
    });
  } catch (err) {
    if (err instanceof CatalogError) {
      return res.status(404).json({ success: false, errorCode: err.code, message: err.message });
    }
    throw err;
  }
});

catalogRouter.get("/api/catalog/departments", (_req, res) => {
  res.json({ departments: listDepartments() });
});

module.exports = { catalogRouter };
