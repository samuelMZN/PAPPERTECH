require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ensureRuntimeSchema } = require("./utils/runtime-schema");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "API PapperTech activa",
    healthcheck: "/api/health"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "API PapperTech activa" });
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/carrito", require("./routes/carrito.routes"));
app.use("/api/catalogos", require("./routes/catalogos.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/devoluciones", require("./routes/devoluciones.routes"));
app.use("/api/productos", require("./routes/productos.routes"));
app.use("/api/inventario", require("./routes/inventario.routes"));
app.use("/api/pedidos", require("./routes/pedidos.routes"));
app.use("/api/usuarios", require("./routes/usuarios.routes"));

async function startServer() {
  await ensureRuntimeSchema();

  app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("No se pudo iniciar el servidor:", error.message);
    process.exit(1);
  });
}

module.exports = app;
