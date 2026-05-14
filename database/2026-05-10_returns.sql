CREATE TABLE IF NOT EXISTS devoluciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  procesado_por INT UNSIGNED NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  observaciones TEXT NULL,
  total_reintegrado DECIMAL(12,2) NOT NULL DEFAULT 0,
  creado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_devoluciones_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  CONSTRAINT fk_devoluciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_devoluciones_procesado FOREIGN KEY (procesado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS detalles_devolucion (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  devolucion_id INT UNSIGNED NOT NULL,
  detalle_pedido_id INT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  CONSTRAINT fk_detalles_devolucion_devolucion FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id),
  CONSTRAINT fk_detalles_devolucion_detalle_pedido FOREIGN KEY (detalle_pedido_id) REFERENCES detalles_pedido(id),
  CONSTRAINT fk_detalles_devolucion_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
);
