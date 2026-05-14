const express = require("express");
const productosController = require("../controllers/productos.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const adminOnly = authMiddleware.allowRoles("administrador");

router.get("/", productosController.getProductos);
router.get("/:id", productosController.getProductoById);
router.post("/", authMiddleware, adminOnly, productosController.crearProducto);
router.put("/:id", authMiddleware, adminOnly, productosController.actualizarProducto);
router.delete("/:id", authMiddleware, adminOnly, productosController.eliminarProducto);

module.exports = router;
