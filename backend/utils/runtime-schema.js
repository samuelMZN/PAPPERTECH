const db = require("../config/db");

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const exists = await columnExists(connection, tableName, columnName);

  if (exists) {
    return false;
  }

  await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  return true;
}

let schemaPromise = null;

async function ensureRuntimeSchema() {
  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    const connection = await db.promise().getConnection();

    try {
      await addColumnIfMissing(
        connection,
        "movimientos_inventario",
        "factura_referencia",
        "VARCHAR(80) NULL AFTER proveedor_id"
      );

      await addColumnIfMissing(
        connection,
        "productos",
        "margen_porcentaje",
        "DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER precio_detal"
      );

      await addColumnIfMissing(
        connection,
        "proveedores",
        "activo",
        "TINYINT(1) NOT NULL DEFAULT 1 AFTER direccion"
      );

      await addColumnIfMissing(
        connection,
        "usuarios",
        "email_verificado",
        "TINYINT(1) NOT NULL DEFAULT 1 AFTER activo"
      );

      await addColumnIfMissing(
        connection,
        "usuarios",
        "email_verificacion_token",
        "VARCHAR(64) NULL AFTER email_verificado"
      );

      await addColumnIfMissing(
        connection,
        "usuarios",
        "email_verificacion_expira",
        "DATETIME NULL AFTER email_verificacion_token"
      );
    } finally {
      connection.release();
    }
  })();

  return schemaPromise;
}

module.exports = {
  ensureRuntimeSchema
};
