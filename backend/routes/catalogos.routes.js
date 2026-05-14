const express = require("express");
const catalogosController = require("../controllers/catalogos.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const adminOnly = authMiddleware.allowRoles("administrador");
const staffOnly = authMiddleware.allowRoles("administrador", "trabajador");

router.get("/publico", catalogosController.getCatalogoPublico);
router.get("/", authMiddleware, staffOnly, catalogosController.getCatalogos);

router.post("/categorias", authMiddleware, adminOnly, catalogosController.crearCategoria);
router.put("/categorias/:id", authMiddleware, adminOnly, catalogosController.actualizarCategoria);
router.delete("/categorias/:id", authMiddleware, adminOnly, catalogosController.eliminarCategoria);

router.post("/marcas", authMiddleware, adminOnly, catalogosController.crearMarca);
router.put("/marcas/:id", authMiddleware, adminOnly, catalogosController.actualizarMarca);

router.post("/proveedores", authMiddleware, adminOnly, catalogosController.crearProveedor);
router.put("/proveedores/:id", authMiddleware, adminOnly, catalogosController.actualizarProveedor);

module.exports = router;
