CREATE DATABASE pappertech;
USE pappertech;

-- =========================
-- TABLA ROLES
-- =========================
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);

INSERT INTO roles (nombre) VALUES
('cliente'),
('trabajador'),
('administrador');

-- =========================
-- TABLA USUARIOS
-- =========================
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    rol_id INT,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
);

-- =========================
-- TABLA CATEGORIAS
-- =========================
CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100)
);

-- =========================
-- TABLA PRODUCTOS
-- =========================
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100),
    descripcion TEXT,
    precio_compra DECIMAL(10,2),
    precio_venta DECIMAL(10,2),
    stock INT DEFAULT 0,
    stock_minimo INT DEFAULT 5,
    categoria_id INT,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- =========================
-- TABLA PROVEEDORES
-- =========================
CREATE TABLE proveedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100),
    telefono VARCHAR(20),
    email VARCHAR(100)
);

-- =========================
-- TABLA INVENTARIO (MOVIMIENTOS)
-- =========================
CREATE TABLE inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT,
    tipo ENUM('entrada','salida'),
    cantidad INT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT,
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- =========================
-- TABLA PEDIDOS
-- =========================
CREATE TABLE pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    total DECIMAL(10,2),
    estado ENUM('pendiente','pagado','enviado','entregado') DEFAULT 'pendiente',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- =========================
-- DETALLE PEDIDO
-- =========================
CREATE TABLE detalle_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT,
    producto_id INT,
    cantidad INT,
    precio DECIMAL(10,2),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- =========================
-- PAGOS
-- =========================
CREATE TABLE pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT,
    metodo VARCHAR(50),
    estado VARCHAR(50),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);

-- =========================
-- TRIGGER INVENTARIO PERPETUO
-- =========================

DELIMITER $$

CREATE TRIGGER actualizar_stock_entrada
AFTER INSERT ON inventario
FOR EACH ROW
BEGIN
    IF NEW.tipo = 'entrada' THEN
        UPDATE productos
        SET stock = stock + NEW.cantidad
        WHERE id = NEW.producto_id;
    END IF;
END$$

CREATE TRIGGER actualizar_stock_salida
AFTER INSERT ON inventario
FOR EACH ROW
BEGIN
    IF NEW.tipo = 'salida' THEN
        UPDATE productos
        SET stock = stock - NEW.cantidad
        WHERE id = NEW.producto_id;
    END IF;
END$$

DELIMITER ;

-- =========================
-- DATOS DE PRUEBA
-- =========================

INSERT INTO categorias (nombre) VALUES
('Útiles escolares'),
('Oficina'),
('Arte');

INSERT INTO productos (nombre, descripcion, precio_compra, precio_venta, stock, categoria_id)
VALUES
('Cuaderno', 'Cuaderno rayado', 2000, 3500, 20, 1),
('Lápiz', 'Lápiz HB', 500, 1000, 50, 1);
