# Mantenimiento obligatorio de la documentación API

La documentación de la API v2 se actualiza en el mismo cambio que modifica una
ruta, permiso, cabecera, payload o respuesta. El CI ejecuta
`npm run docs:api:check` en cada pull request y antes de desplegar `main`.
Si detecta una ruta sin documentar o un contrato desalineado, el despliegue se
detiene.

## Archivos que deben cambiar juntos

- `server/routes/api-v2.ts`: implementación de la ruta.
- `server/routes/api-v2-openapi.ts`: contrato OpenAPI oficial.
- `server/routes/api-v2-postman.ts`: ejemplo ejecutable para desarrolladores.
- `server/routes/api-v2-guide.ts`: guía descargable desde Zinto.
- `docs/integrations/smartbc-zinto-api-v2.md`: instrucciones específicas para
  SmartBC.
- `docs/integrations/quickstart.md`: inicio rápido y compatibilidad.

## Flujo para cada cambio

1. Cambie o añada la ruta en `api-v2.ts`.
2. Actualice OpenAPI con método, ruta, parámetros, headers, permisos, payload y
   respuestas.
3. Añada o modifique la misma operación en la colección Postman.
4. Actualice la guía descargable y la guía SmartBC con un ejemplo realista,
   errores y requisitos de idempotencia.
5. Ejecute `npm run docs:api:check` y las pruebas de integración relacionadas.
6. Abra el pull request. El despliegue de `main` solo se ejecuta si la
   comprobación termina correctamente.

El verificador extrae las rutas literales del router, compara su inventario con
OpenAPI, comprueba que cada ruta protegida declare
`X-Zinto-Integration-Id`, y confirma su presencia en Postman, `guide.md` y la
guía SmartBC. También comprueba que los tres enlaces de descarga sigan
declarados.

## Comprobación local

```bash
npm ci --include=dev
npm run docs:api:check
```

La salida correcta es similar a:

```text
API documentation check passed (11 v2 routes checked)
```
