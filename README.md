# Asistente IA para Inmobiliarias

Backend del asistente conversacional para capturar leads en páginas web de inmobiliarias.

## Instalación

```bash
npm install
cp .env.example .env
# Editá .env y agregá tu ANTHROPIC_API_KEY
```

## Correr en desarrollo

```bash
npm run dev
```

## Endpoints

### `POST /session`
Crea una sesión nueva. Llamar al iniciar cada conversación.
```json
// Response
{ "sessionId": "uuid-generado" }
```

### `POST /chat`
Envía un mensaje y recibe respuesta del asistente.
```json
// Body
{
  "sessionId": "uuid-de-la-sesion",
  "message": "Hola, me interesa un apartamento en Pocitos",
  "config": {
    "nombre": "Inmobiliaria XYZ",  // opcional
    "ciudad": "Montevideo"          // opcional
  }
}

// Response
{
  "message": "¡Hola! Tenemos un apartamento...",
  "leadCaptured": false
}
```

### `GET /leads`
Lista todos los leads capturados.
```json
// Response
{
  "total": 3,
  "leads": [
    {
      "id": 1,
      "nombre": "Juan Pérez",
      "telefono": "099123456",
      "createdAt": "2026-01-01T..."
    }
  ]
}
```

## Deploy en Railway

1. Crear cuenta en [railway.app](https://railway.app)
2. Nuevo proyecto → Deploy from GitHub
3. Agregar variable de entorno: `ANTHROPIC_API_KEY`
4. Railway detecta Node.js automáticamente y usa `npm start`

## Personalizar para cada cliente

Editá `src/prompt.js` para:
- Cambiar las propiedades disponibles
- Ajustar el tono del asistente
- Agregar información específica del negocio

En producción, esto vendrá de una base de datos por cliente.
