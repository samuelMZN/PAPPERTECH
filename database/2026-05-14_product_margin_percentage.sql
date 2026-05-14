SET @has_margen_porcentaje := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'productos'
    AND COLUMN_NAME = 'margen_porcentaje'
);

SET @sql_margen_porcentaje := IF(
  @has_margen_porcentaje = 0,
  'ALTER TABLE productos ADD COLUMN margen_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER precio_detal',
  'SELECT 1'
);

PREPARE stmt_margen_porcentaje FROM @sql_margen_porcentaje;
EXECUTE stmt_margen_porcentaje;
DEALLOCATE PREPARE stmt_margen_porcentaje;
