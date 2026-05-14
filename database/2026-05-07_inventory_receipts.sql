ALTER TABLE movimientos_inventario
ADD COLUMN IF NOT EXISTS precio_unitario_referencia DECIMAL(12,2) NULL
AFTER pedido_id;
