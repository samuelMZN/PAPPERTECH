function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getDiscountForQuantity(producto, cantidad) {
  const precioBase = roundMoney(producto?.precio_detal || producto?.precio_venta || 0);
  const minima = Number(producto?.descuento_cantidad_minima || 0);
  const porcentaje = Number(producto?.descuento_porcentaje || 0);
  const quantity = Number(cantidad || 0);
  const descuentoActivo = minima > 0 && porcentaje > 0 && quantity >= minima;
  const precioAplicado = descuentoActivo
    ? roundMoney(precioBase * (1 - porcentaje / 100))
    : precioBase;

  return {
    precioBase,
    precioAplicado,
    descuentoActivo,
    descuentoCantidadMinima: minima,
    descuentoPorcentaje: descuentoActivo ? porcentaje : 0,
    ahorroUnitario: roundMoney(precioBase - precioAplicado),
    subtotalBase: roundMoney(precioBase * quantity),
    subtotalFinal: roundMoney(precioAplicado * quantity)
  };
}

module.exports = {
  roundMoney,
  getDiscountForQuantity
};
