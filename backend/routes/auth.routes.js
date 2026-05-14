const express = require("express");
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const clientOnly = authMiddleware.allowRoles("cliente");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/perfil", authMiddleware, authController.perfil);
router.put("/perfil", authMiddleware, clientOnly, authController.actualizarPerfil);

module.exports = router;
