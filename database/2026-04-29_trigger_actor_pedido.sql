DROP TRIGGER IF EXISTS trg_pedido_estado_preparacion;

DELIMITER $$

CREATE TRIGGER trg_pedido_estado_preparacion
AFTER UPDATE ON pedidos
FOR EACH ROW
BEGIN
    IF NEW.estado = 'en_preparacion' AND OLD.estado != 'en_preparacion' THEN
        INSERT INTO movimientos_inventario (
            producto_id,
            cantidad,
            tipo,
            motivo,
            usuario_id,
            pedido_id
        )
        SELECT
            dp.producto_id,
            -dp.cantidad,
            'salida',
            'venta_pedido',
            COALESCE(@app_actor_id, NEW.usuario_id),
            NEW.id
        FROM detalles_pedido dp
        WHERE dp.pedido_id = NEW.id;
    END IF;
END$$

DELIMITER ;
