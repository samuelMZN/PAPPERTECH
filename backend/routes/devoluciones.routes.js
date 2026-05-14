const express = require("express");
const devolucionesController = require("../controllers/devoluciones.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const staffOnly = authMiddleware.allowRoles("administrador", "trabajador");

router.get("/", authMiddleware, devolucionesController.getDevoluciones);
router.get("/pedidos-elegibles", authMiddleware, staffOnly, devolucionesController.getPedidosElegibles);
router.post("/", authMiddleware, staffOnly, devolucionesController.crearDevolucion);

module.exports = router;
