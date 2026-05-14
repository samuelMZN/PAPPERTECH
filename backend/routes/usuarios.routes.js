const express = require("express");
const usuariosController = require("../controllers/usuarios.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const adminOnly = authMiddleware.allowRoles("administrador");

router.get("/", authMiddleware, adminOnly, usuariosController.getUsuarios);
router.post("/", authMiddleware, adminOnly, usuariosController.crearUsuario);
router.put("/:id", authMiddleware, adminOnly, usuariosController.actualizarUsuario);

module.exports = router;
