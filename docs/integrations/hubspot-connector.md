# Conector nativo HubSpot (base segura)

La base del conector HubSpot existe para que Zinto pueda añadir una conexión
nativa sin mezclar credenciales, compañías ni datos de clientes.

## Límites actuales

- Incluye validación de configuración por empresa, redirección OAuth segura y
  mapeo de propiedades entrantes.
- No realiza llamadas a HubSpot durante el arranque, build o pruebas.
- No guarda ni expone `client_secret`, códigos OAuth ni tokens. Su intercambio y
  almacenamiento se implementará en un almacén de credenciales cifrado y
  estrictamente delimitado por `companyId` e `integrationId`.

## Flujo de autorización previsto

1. Un administrador crea una integración `hubspot` para su empresa.
2. El backend genera un `state` firmado, de un solo uso y asociado a la empresa
   e integración.
3. `createHubSpotAuthorizationRequest` genera la URL de consentimiento. Solo
   permite una URL HTTPS que no apunte a localhost en producción.
4. El callback valida el `state`, intercambia el código de forma servidor a
   servidor y guarda el token en el vault de credenciales.
5. Un cliente HubSpot futuro solicita el token exclusivamente mediante
   `HubSpotCredentialResolver.getAccessToken({ companyId, integrationId })`.

## Mapeo de propiedades

Para cada entidad (`contact`, `deal`, `appointment`, `campaign`) se define un
mapa `campo_zinto -> propiedad_hubspot`. Solo se copian los campos configurados.
Los campos de aislamiento y auditoría de Zinto (`companyId`, `id`, fechas, etc.)
son rechazados antes de sincronizar.

Ejemplo de contacto:

```json
{
  "name": "firstname",
  "phone": "phone",
  "email": "email"
}
```

Las sincronizaciones siguen usando las colas, idempotencia y conflictos de CRM
v2; este conector no los sustituye.
