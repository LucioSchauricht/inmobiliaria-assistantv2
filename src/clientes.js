// Base de datos de clientes
// Cada cliente tiene un token único y su configuración personalizada
// En producción esto vendría de una base de datos real

const clientes = {
  // Cliente demo — para tus pruebas
  "DEMO-TOKEN-001": {
    nombre: "Inmobiliaria Demo",
    ciudad: "Montevideo",
    telefono: "2900-0000",
    horario: "Lunes a viernes 9:00 a 18:00",
    propiedades: [
      "Apartamento 2 dorm., Pocitos, $1.800/mes alquiler",
      "Casa 3 dorm., Malvín, U$S 180.000 venta",
      "Apartamento 1 dorm., Centro, $900/mes alquiler",
      "Local comercial, Ciudad Vieja, U$S 120.000 venta",
    ],
  },

  // Ejemplo cliente real A
  "TOKEN-CLIENTE-A": {
    nombre: "Inmobiliaria del Sur",
    ciudad: "Montevideo",
    telefono: "2600-1234",
    horario: "Lunes a sábado 9:00 a 17:00",
    propiedades: [
      "Apartamento 3 dorm., Punta Carretas, U$S 250.000 venta",
      "Casa 4 dorm., Carrasco, U$S 450.000 venta",
      "Apartamento 1 dorm., Buceo, $1.200/mes alquiler",
    ],
  },

  // Ejemplo cliente real B
  "TOKEN-CLIENTE-B": {
    nombre: "Norte Propiedades",
    ciudad: "Montevideo",
    telefono: "2508-5678",
    horario: "Lunes a viernes 10:00 a 19:00",
    propiedades: [
      "Apartamento 2 dorm., Cordón, $1.500/mes alquiler",
      "Local comercial, Goes, U$S 80.000 venta",
      "Casa 3 dorm., Prado, U$S 150.000 venta",
    ],
  },
};

export function getCliente(token) {
  return clientes[token] || null;
}

export function getAllClientes() {
  return Object.entries(clientes).map(([token, config]) => ({
    token,
    nombre: config.nombre,
    ciudad: config.ciudad,
  }));
}

export function addCliente(token, config) {
  clientes[token] = config;
}
