const express = require("express");
const pedidosController = require("../controllers/pedidos.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const clientOnly = authMiddleware.allowRoles("cliente");
const staffOnly = authMiddleware.allowRoles("administrador", "trabajador");

router.get("/", authMiddleware, pedidosController.getPedidos);
router.post("/", authMiddleware, clientOnly, pedidosController.crearPedido);
router.patch("/:id/estado", authMiddleware, staffOnly, pedidosController.actualizarEstado);

module.exports = router;
