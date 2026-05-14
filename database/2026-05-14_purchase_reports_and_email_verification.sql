SET @has_factura_referencia := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'movimientos_inventario'
    AND COLUMN_NAME = 'factura_referencia'
);

SET @sql_factura_referencia := IF(
  @has_factura_referencia = 0,
  'ALTER TABLE movimientos_inventario ADD COLUMN factura_referencia VARCHAR(80) NULL AFTER proveedor_id',
  'SELECT 1'
);

PREPARE stmt_factura FROM @sql_factura_referencia;
EXECUTE stmt_factura;
DEALLOCATE PREPARE stmt_factura;

SET @has_email_verificado := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'email_verificado'
);

SET @sql_email_verificado := IF(
  @has_email_verificado = 0,
  'ALTER TABLE usuarios ADD COLUMN email_verificado TINYINT(1) NOT NULL DEFAULT 1 AFTER activo',
  'SELECT 1'
);

PREPARE stmt_email_verificado FROM @sql_email_verificado;
EXECUTE stmt_email_verificado;
DEALLOCATE PREPARE stmt_email_verificado;

SET @has_email_token := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'email_verificacion_token'
);

SET @sql_email_token := IF(
  @has_email_token = 0,
  'ALTER TABLE usuarios ADD COLUMN email_verificacion_token VARCHAR(64) NULL AFTER email_verificado',
  'SELECT 1'
);

PREPARE stmt_email_token FROM @sql_email_token;
EXECUTE stmt_email_token;
DEALLOCATE PREPARE stmt_email_token;

SET @has_email_expira := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'email_verificacion_expira'
);

SET @sql_email_expira := IF(
  @has_email_expira = 0,
  'ALTER TABLE usuarios ADD COLUMN email_verificacion_expira DATETIME NULL AFTER email_verificacion_token',
  'SELECT 1'
);

PREPARE stmt_email_expira FROM @sql_email_expira;
EXECUTE stmt_email_expira;
DEALLOCATE PREPARE stmt_email_expira;
