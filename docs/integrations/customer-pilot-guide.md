# Guía de piloto CRM ↔ Zinto

Esta guía es para la empresa cliente, su responsable de operación y su equipo
de desarrollo. Describe únicamente las funciones expuestas actualmente por la
API v2 de Zinto. El contrato ejecutable está en
[`/api/v2/openapi.json`](https://crm.zinto.app/api/v2/openapi.json); los
ejemplos están en el [quickstart](quickstart.md).

## Qué sincroniza el piloto

| Objeto | CRM → Zinto | Zinto → CRM |
| --- | --- | --- |
| Contactos | `PUT /contacts/{externalId}` crea o actualiza un contacto | Requiere configuración de webhook de la integración; el receptor procesa eventos firmados al menos una vez. |
| Mensajes | `POST /messages` entrega el texto mediante un canal existente de Zinto | El webhook permite que una respuesta recibida en Zinto se entregue al CRM. |
| Agenda | `PUT /appointments/{externalId}` crea o actualiza una cita | La salida depende de los eventos habilitados de la integración. |
| Pipeline / negocios | `POST /deals` crea o actualiza un negocio | La salida depende de los eventos habilitados de la integración. |
| Campañas | No disponible por API v2 | No disponible por API v2. |

La dirección Zinto → CRM no significa que el CRM deba aceptar duplicados: los
webhooks se tratan como entregas **al menos una vez**. Cada cliente debe guardar
`X-Zinto-Event-Id` y hacer su consumidor idempotente.

## Decisiones operativas antes de integrar

1. Nombrar un propietario del CRM, un administrador de Zinto y un contacto de
   soporte técnico.
2. Elegir una fuente de verdad por campo. Recomendación: CRM para datos
   comerciales; Zinto para estado de conversación y entrega; agenda/pipeline
   según el proceso comercial acordado.
3. Definir un identificador externo estable por objeto. Nunca use el nombre,
   correo o teléfono como única clave de sincronización.
4. Acordar el tratamiento de conflictos: pausar el objeto, revisar el registro
   de auditoría y decidir qué sistema se vuelve a escribir. No use reintentos
   ciegos para resolver conflictos de negocio.

## Mapeo de campos

Configure el mapeo por integración y documente el resultado antes de importar
datos. Mantenga los campos obligatorios de Zinto sin transformación ambigua.

| Entidad | Campo CRM típico | Campo / requisito Zinto |
| --- | --- | --- |
| Contacto | `id` | `externalId` en la URL; estable y único por integración |
| Contacto | `full_name` | `name`, obligatorio |
| Contacto | `mobile` | `phone`, opcional; normalizado por el CRM antes de enviar |
| Contacto | `attributes.tier` | `customFields.crm_tier`, opcional |
| Cita | `contact_id`, `start`, `end` | `contactId`, `startsAt`, `endsAt`; contacto existente y fechas ISO |
| Negocio | `contact_id`, `pipeline_id`, `stage`, `amount` | `contactId`, `pipelineId`, `stage`, `value`; todos pertenecen a la empresa |

Pruebe cada transformación con registros ficticios antes de ejecutar la
sincronización inicial. No elimine valores CRM que Zinto no conozca: guárdelos
en campos personalizados cuando aplique o exclúyalos explícitamente del mapa.

## Configurar sandbox

1. Cree una empresa, integración, canal y contactos de prueba separados.
2. Cree una clave con entorno `sandbox` y el mínimo de permisos necesarios.
3. Configure una URL de webhook de `localhost`, `.test` o `.example`.
4. Pruebe salud, autenticación, un contacto y un mensaje con los ejemplos del
   quickstart. Para citas y negocios añada un `Idempotency-Key`.
5. Verifique que el CRM recibe, verifica, persiste y deduplica un evento antes
   de probar reintentos.

No existe un hostname API de sandbox separado: el aislamiento se obtiene con
recursos y clave de prueba. La clave de sandbox no simula canales externos.

## Webhooks: verificación y reintentos

El consumidor CRM debe conservar el cuerpo crudo y verificar, antes de
interpretar JSON:

```text
X-Zinto-Signature = v1=HMAC_SHA256(webhook_secret, X-Zinto-Timestamp + "." + raw_body)
```

También debe comprobar que el timestamp está dentro de su ventana de replay,
comparar firmas en tiempo constante y registrar `X-Zinto-Event-Id` como clave
de deduplicación. Responda 2xx solo después de dejar el evento en una cola o
almacenamiento duradero. En errores transitorios responda no-2xx para permitir
reintentos; en errores de validación que no cambiarán, acepte el evento y
regístrelo para revisión, evitando una tormenta de reintentos.

El secreto y la URL del webhook son configuración de la integración; nunca se
incluyen en tickets, capturas ni código cliente. En producción la URL debe ser
HTTPS y no puede ser localhost.

## Sincronización inicial

La planificación/ejecución de una importación inicial no está montada como
ruta pública v2. Hasta que exista un contrato publicado, realícela como una
operación coordinada y reversible:

1. Exporte el conjunto candidato del CRM y valide el mapeo, duplicados y
   pertenencia de empresa.
2. Importe primero un grupo piloto reducido mediante las rutas de contacto,
   cita y negocio disponibles.
3. Compare recuentos, `externalId`, campos críticos y una muestra de mensajes.
4. Corrija el mapeo y repita de forma idempotente; no active automatización
   bidireccional masiva hasta reconciliar diferencias.
5. Guarde el archivo de conciliación y el responsable que aprobó el corte.

## Lista de salida a producción

- [ ] Migraciones de CRM e integración aplicadas y respaldadas.
- [ ] Clave de producción creada con permisos mínimos, expiración, límites e
  IPs permitidas revisados.
- [ ] Webhook HTTPS accesible, secreto almacenado en un gestor de secretos y
  verificador de firma probado con cuerpo crudo.
- [ ] El CRM deduplica `X-Zinto-Event-Id` y tolera reintentos/desorden.
- [ ] Prueba aprobada de contacto, mensaje ida/vuelta, cita y negocio con datos
  no sensibles.
- [ ] Observabilidad activa: fallos de webhook, respuestas 401/403/5xx,
  retrasos de cola y conflictos revisados por un responsable.
- [ ] Plan de reversión: desactivar la clave y pausar consumidores sin borrar
  datos ni mappings.
- [ ] Campañas excluidas del alcance hasta que se publique su ruta v2.

## Soporte

Incluya al reportar una incidencia: ID de integración, ID externo, ID de evento
si existe, hora con zona horaria, código HTTP y una versión saneada de la
solicitud/respuesta. Nunca envíe API keys, secretos de webhook ni datos de
conversaciones completos.
