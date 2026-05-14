const express = require("express");
const carritoController = require("../controllers/carrito.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const clientOnly = authMiddleware.allowRoles("cliente");

router.use(authMiddleware);
router.use(clientOnly);

router.get("/", carritoController.getCarrito);
router.post("/", carritoController.agregarItem);
router.post("/checkout", carritoController.checkout);
router.put("/:id", carritoController.actualizarItem);
router.delete("/:id", carritoController.eliminarItem);
router.delete("/", carritoController.vaciarCarrito);

module.exports = router;
