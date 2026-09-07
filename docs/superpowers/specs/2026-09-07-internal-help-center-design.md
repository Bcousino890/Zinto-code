# Centro de ayuda interno de Zinto

## Objetivo

Reemplazar el enlace externo actual de **Ayuda y Soporte** por una guía navegable
dentro de `crm.zinto.app`. La guía debe permitir que los usuarios encuentren
instrucciones verificadas sobre el CRM y la API sin depender de un asistente de
IA. El GPT actual de Zinto seguirá disponible como una vía opcional para pedir
ayuda, nunca como la única fuente de respuesta.

## Audiencia y límites

La guía está destinada a las personas que usan una empresa de Zinto:

- **Usuario de empresa:** operaciones diarias, conversaciones, contactos,
  tareas, pipeline y calendario.
- **Administrador de empresa:** usuarios, permisos, configuración, canales,
  automatizaciones, plantillas, campañas, analítica, facturación y ERP cuando
  esté habilitado.
- **Cliente final:** acciones que recibe o realiza desde enlaces, chat web,
  mensajes, reservas, pedidos, documentos o facturas, según el producto
  contratado por su empresa.
- **Desarrollador:** API, autenticación, recursos, webhooks, errores y ejemplos.

El panel técnico de superadministración (`/admin`) no aparecerá en la
navegación, artículos ni resultados de búsqueda. El equipo de Zinto podrá
mantener contenido en futuras iteraciones, pero los clientes no verán esas
herramientas de mantenimiento.

## Decisión de producto

Se construirá una pantalla protegida en `/help`, disponible a cualquier usuario
autenticado de una empresa. El enlace del menú lateral dejará de abrir una URL
externa y navegará a esta ruta dentro de la misma pestaña. Un gestor editorial
se añadirá exclusivamente al panel de superadministración para que el equipo de
Zinto pueda mantener la guía sin desplegar código.

Los artículos publicados se guardarán globalmente en base de datos, separados de
los datos de cada empresa. El modelo de contenido será independiente del
componente de interfaz y de la capa HTTP, para que el lector público y el editor
usen el mismo contrato. El catálogo inicial se podrá sembrar desde una fuente
TypeScript versionada, pero una vez publicado se editará en el administrador.

No se eliminará la configuración global de URL de soporte durante esta fase: se
dejará sin uso por el menú de empresa para no romper instalaciones ni APIs
existentes. Una migración posterior podrá retirarla tras confirmar que ningún
otro consumidor la necesita.

## Experiencia

### Inicio de ayuda

La página `/help` mostrará:

1. Título y subtítulo de bienvenida.
2. Búsqueda local que encuentra por título, descripción, rol, categoría,
   etiquetas y contenido del artículo.
3. Accesos por perfil: Usuario, Administrador, Cliente y Desarrollador/API.
4. Tarjetas de categorías con el número de artículos disponibles.
5. Una sección de “Primeros pasos” y artículos destacados.
6. Un botón secundario “Preguntar a Zinto” que abre el asistente actual en una
   pestaña nueva. Se mostrará como opción complementaria y no como resultado de
   búsqueda.

### Listado y lectura

Cada categoría abre un listado filtrado. Cada artículo tiene URL estable
`/help/<slug>` y muestra:

- Miga de pan y categoría.
- A quién aplica y permisos/requisitos previos.
- Pasos numerados claros.
- Resultado esperado.
- Notas, advertencias o limitaciones verificadas.
- Solución de problemas y enlaces relacionados cuando correspondan.

La lectura será responsive, conservará el sistema visual existente y no cargará
datos de una empresa ajena. La búsqueda no envía el texto a terceros.

### Acceso y errores

- Una sesión no autenticada sigue el comportamiento normal de las rutas
  protegidas y se redirige a inicio de sesión.
- Un slug inexistente presenta el estado de artículo no encontrado con vuelta al
  centro de ayuda, en lugar de la página 404 general.
- Si una función no está activada en un plan o empresa, el artículo debe marcarla
  como disponible “según plan/configuración”; no debe prometerla.

## Modelo de contenido y publicación

El contrato de contenido definirá estos tipos:

- `HelpAudience`: `user`, `company_admin`, `customer`, `developer`.
- `HelpCategory`: slug, nombre, descripción, icono y orden.
- `HelpArticle`: id, slug, título, resumen, categoría, audiencias, etiquetas,
  requisitos, bloques de contenido, relacionados, estado de verificación,
  estado editorial, fecha de publicación y última actualización.

Los bloques de contenido usarán texto, listas ordenadas, notas y enlaces
internos. No se usarán HTML arbitrario ni Markdown remoto. Esto evita riesgos
de XSS y permite una edición estructurada desde el administrador.

Cada artículo tendrá uno de tres estados: `draft`, `published` o `archived`.
El lector de `/help` solo consultará `published`; los borradores y archivados
solo serán visibles en el panel de administración. Publicar requiere un slug
único, título, resumen, categoría, al menos una audiencia y contenido no vacío.
Archivar deja de mostrar el artículo sin borrar su historial.

El contenido y metadatos globales se almacenarán en tablas propias de ayuda, no
en tablas de empresa. La auditoría guardará autor, fecha y tipo de cambio para
crear, editar, publicar, retirar o archivar. El texto no incluirá secretos;
las contraseñas, tokens y claves de ejemplo se ocultarán antes de publicar.

El catálogo inicial incluirá marcadores editoriales para todas las áreas
visibles del CRM, pero solo se publicarán como “verificados” los artículos
respaldados por revisión de la interfaz y código. La API no expondrá endpoint,
cabecera, esquema, permiso ni ejemplo hasta que se haya validado contra las
rutas reales y un entorno de prueba.

## Cobertura inicial

La primera entrega debe incluir, como mínimo:

| Categoría | Artículos iniciales |
| --- | --- |
| Empezar | navegación, roles, perfil y uso de la ayuda |
| Conversaciones | abrir/asignar/responder, estado, búsqueda y bot |
| Contactos | crear, editar, etiquetas, campos y búsqueda |
| Trabajo | pipeline, tareas y calendario |
| Automatización | constructor de flujos, pruebas y publicación |
| Canales | visión general y enlaces a las guías verificadas de cada canal |
| Administración | miembros, permisos y configuración de empresa |
| Crecimiento | plantillas, campañas, analítica y reportes |
| ERP | acceso condicionado y enlaces a módulos disponibles |
| API | introducción, autenticación y catálogo de referencia pendiente de validar |
| Resolución de problemas | acceso, permisos, canales y escalado a soporte |

“Conectar WhatsApp”, “crear un contacto” y “conectar un canal” serán artículos
prioritarios, pero se escribirán tras recorrer las pantallas correspondientes
en un entorno de demostración. Las instrucciones no incluirán datos reales de
clientes, tokens, números de teléfono ni capturas con conversaciones reales.

## Componentes, rutas y API interna

- `client/src/pages/help-center.tsx`: shell de inicio, búsqueda, categorías y
  listado de resultados.
- `client/src/pages/help-article.tsx`: vista de artículo y estado no encontrado.
- `client/src/pages/admin/help-center.tsx`: gestor editorial exclusivo de
  superadministradores, con listado, filtros de estado, editor, vista previa e
  historial de cambios.
- `client/src/content/help-center.ts`: tipos, categorías y semilla inicial,
  compartidos por cliente y servidor.
- `client/src/components/help-center/*`: bloques pequeños reutilizables para
  búsqueda, tarjetas, metadatos y contenido de artículo.
- `client/src/App.tsx`: rutas protegidas `/help`, `/help/:slug` y la ruta
  administrativa protegida `/admin/help-center`.
- `client/src/components/layout/Sidebar.tsx`: convertir el enlace a navegación
  interna.
- Esquema y migración: tablas globales de artículos y auditoría de ayuda.
- `server/routes/help-center.ts`: lectura pública autenticada de artículos
  publicados y CRUD editorial protegido para el administrador.

Las rutas de lectura no recibirán contenido de borrador, incluso si se manipula
la URL. Las rutas de edición usarán el guardia de superadministración existente,
validarán el cuerpo en servidor y registrarán la auditoría. Ningún permiso de
empresa concede acceso al editor editorial.

## Integración con el asistente

La URL actual del GPT se almacenará como constante de configuración del centro
de ayuda, no dentro de artículos. El botón explicará que la IA es opcional y
puede complementar las guías. En la primera versión abre una nueva pestaña;
no se usará iframe, ya que el GPT está diseñado para operar en ChatGPT.

## API y verificación documental

La API se documentará en una fase de descubrimiento posterior usando tres
fuentes: rutas de servidor, contratos/tipos compartidos y pruebas contra una
empresa de demostración. Cada página API tendrá fecha de verificación, versión
del CRM y ejemplos que eliminen tokens y datos personales. Hasta completar esa
validación, el centro mostrará una ficha honesta de “Referencia de API en
preparación”, no especificaciones inventadas.

## Pruebas y aceptación

- TypeScript debe pasar sin errores.
- Las rutas `/help` y `/help/<slug>` deben requerir sesión y renderizar en
  escritorio y móvil.
- El acceso del menú lateral debe abrir `/help` dentro del CRM.
- La búsqueda debe devolver resultados por título, etiqueta y texto de pasos,
  respetando mayúsculas, acentos y resultados vacíos.
- Los filtros por audiencia y categoría deben combinarse correctamente.
- Cada enlace interno debe apuntar a un slug existente.
- El botón del asistente debe conservar protección `noopener noreferrer` y abrir
  una pestaña nueva.
- Ninguna página, ruta ni artículo de la guía debe exponer navegación o datos
  del panel de superadministración.

## Evolución posterior

La primera versión editorial permite un solo rol de mantenimiento:
superadministración. Si el equipo editorial crece, se podrán añadir roles de
autor/revisor, aprobaciones y traducciones sin cambiar el lector. Las futuras
traducciones reutilizarán las claves y metadatos, no copias de componentes.
