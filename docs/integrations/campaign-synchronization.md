# Campaign synchronization — estado de disponibilidad

La sincronización de campañas **no está expuesta por una ruta pública API v2**
en esta versión. Aunque existen validadores internos, no constituyen un contrato
de integración y no deben usarse ni documentarse como si fueran una API.

No envíe solicitudes a `/campaigns/batch`, no configure automatizaciones de
campañas contra rutas no publicadas y no habilite un piloto de campañas hasta
que el contrato aparezca en `/api/v2/openapi.json` y en el quickstart.

Mientras tanto, los equipos pueden usar las funciones de campañas de la
interfaz de Zinto. Este límite no afecta los flujos v2 disponibles para
contactos, mensajes, agenda y negocios.
