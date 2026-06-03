const express = require("express");
const dashboardController = require("../controllers/dashboard.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const adminOnly = authMiddleware.allowRoles("administrador");

router.get("/admin", authMiddleware, adminOnly, dashboardController.getAdminResumen);
router.get("/admin/reportes", authMiddleware, adminOnly, dashboardController.getAdminReportes);

module.exports = router;
