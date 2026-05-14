ALTER TABLE productos
  ADD COLUMN descuento_cantidad_minima INT NULL AFTER stock_minimo,
  ADD COLUMN descuento_porcentaje DECIMAL(5,2) NULL AFTER descuento_cantidad_minima;
