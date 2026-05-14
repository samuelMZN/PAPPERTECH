SET @has_precio_unitario_referencia := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'movimientos_inventario'
    AND COLUMN_NAME = 'precio_unitario_referencia'
);

SET @alter_sql := IF(
  @has_precio_unitario_referencia = 0,
  'ALTER TABLE movimientos_inventario ADD COLUMN precio_unitario_referencia DECIMAL(12,2) NULL AFTER pedido_id',
  'SELECT 1'
);

PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
