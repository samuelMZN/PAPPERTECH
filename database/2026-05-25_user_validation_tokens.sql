USE pappertech;

SET @has_validation_token := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'email_verificacion_token'
);

SET @sql_validation_token := IF(
  @has_validation_token = 0,
  'ALTER TABLE usuarios ADD COLUMN email_verificacion_token VARCHAR(64) NULL AFTER activo',
  'SELECT 1'
);

PREPARE stmt_validation_token FROM @sql_validation_token;
EXECUTE stmt_validation_token;
DEALLOCATE PREPARE stmt_validation_token;

UPDATE usuarios
SET email_verificacion_token = SHA2(CONCAT(UUID(), email, NOW()), 256)
WHERE email_verificacion_token IS NULL
   OR TRIM(email_verificacion_token) = '';
