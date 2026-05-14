const express = require("express");
const inventarioController = require("../controllers/inventario.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const staffOnly = authMiddleware.allowRoles("administrador", "trabajador");

router.get("/", authMiddleware, staffOnly, inventarioController.getMovimientos);
router.get("/stock", authMiddleware, staffOnly, inventarioController.getStock);
router.get("/low-stock", authMiddleware, staffOnly, inventarioController.getLowStock);
router.post("/", authMiddleware, staffOnly, inventarioController.movimiento);

module.exports = router;
