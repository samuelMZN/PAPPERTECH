async function logAudit(executor, payload) {
  const {
    usuarioId,
    accion,
    tabla,
    registroId = null,
    valoresAntiguos = null,
    valoresNuevos = null,
    ipAddress = null
  } = payload;

  if (!usuarioId || !accion || !tabla) {
    return;
  }

  await executor.execute(
    `
      INSERT INTO registros_auditoria
        (usuario_id, accion, tabla, registro_id, valores_antiguos, valores_nuevos, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      usuarioId,
      accion,
      tabla,
      registroId,
      valoresAntiguos ? JSON.stringify(valoresAntiguos) : null,
      valoresNuevos ? JSON.stringify(valoresNuevos) : null,
      ipAddress
    ]
  );
}

module.exports = {
  logAudit
};
