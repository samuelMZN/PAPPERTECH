SET @has_nit := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proveedores'
    AND COLUMN_NAME = 'nit'
);

SET @alter_sql := IF(
  @has_nit = 0,
  'ALTER TABLE proveedores ADD COLUMN nit VARCHAR(30) NULL AFTER nombre',
  'SELECT 1'
);

PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
