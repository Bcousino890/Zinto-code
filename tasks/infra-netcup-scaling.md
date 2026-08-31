# Plan de infraestructura Netcup por número de clientes

Datos obtenidos directamente de netcup.com/en/server el 2026-08-31 (precios
con 19% IVA alemán incluido, facturación mensual). El factor que manda no es
el nº de vCPU sino que el servidor **Node sigue siendo un solo proceso**
(sin cluster/PM2/Redis hoy — ver Fase 4 del plan), así que lo que de verdad
compra capacidad es: (1) rendimiento de un solo core, (2) RAM para sesiones
WhatsApp Baileys (~150-250MB cada una).

## Tarifas reales (Netcup, agosto 2026)

### vServer (VPS, vCPU compartida sobre NVMe)

| Plan | vCores | RAM | Storage | €/mes |
|---|---|---|---|---|
| VPS 500 G12 | 2 | 4 GB | 128 GB NVMe | 5,91 € |
| VPS 1000 G12 | 4 | 8 GB | 256 GB NVMe | 10,37 € |
| VPS 2000 G12 | 8 | 16 GB | 512 GB NVMe | 19,25 € |
| VPS 4000 G12 | 12 | 32 GB | 1024 GB NVMe | 32,41 € |
| VPS 8000 G12 | 16 | 64 GB | 2048 GB NVMe | 47,95 € |

### Root Server (dedicado, CPU/RAM garantizados, AMD EPYC 9645)

| Plan | Cores dedicados | RAM | Storage | €/mes |
|---|---|---|---|---|
| RS 1000 G12 | 4 | 8 GB DDR5 ECC | 256 GB NVMe | 12,79 € |
| RS 2000 G12 | 8 | 16 GB DDR5 ECC | 512 GB NVMe | 21,43 € |
| RS 4000 G12 | 12 | 32 GB DDR5 ECC | 1 TB NVMe | 39,92 € |
| RS 8000 G12 | 16 | 64 GB DDR5 ECC | 2 TB NVMe | 71,36 € |

Nota clave: en un **vServer** la CPU es compartida con otros inquilinos del
host físico ("noisy neighbor" / steal time), lo cual en Baileys se traduce en
desconexiones y reconexiones de QR bajo carga. En un **Root Server** el CPU
es dedicado y garantizado — para WhatsApp no oficial en producción, el Root
Server es la opción correcta pese a costar algo más que el VPS equivalente.

## Recomendación por etapa de crecimiento

| Etapa (empresas activas, mayoría con WhatsApp no oficial) | Servidor recomendado | €/mes | Por qué |
|---|---|---|---|
| **0-8 empresas** (arranque/validación) | **VPS 1000 G12** (4 vCore, 8GB) | 10,37 € | Suficiente para probar el modelo comercial sin comprometer presupuesto; acepta CPU compartida a este volumen bajo |
| **8-20 empresas** | **RS 1000 G12** (4 cores dedicados, 8GB) | 12,79 € | Mismo tamaño que el VPS anterior pero con CPU garantizada — el salto de precio (+2,42€) es mínimo y elimina el ruido de vecinos que causa caídas de sesión Baileys |
| **20-35 empresas** | **RS 2000 G12** (8 cores, 16GB) | 21,43 € | Duplica RAM disponible para sesiones concurrentes; sigue siendo mono-proceso Node pero con margen |
| **35-55 empresas** | **RS 4000 G12** (12 cores, 32GB) | 39,92 € | A partir de aquí el techo ya no es CPU sino RAM de sesiones Baileys y la saturación del único hilo de Node — sin la Fase 4 (Redis + workers) este es prácticamente el límite práctico razonable |
| **55-80 empresas** | **RS 8000 G12** (16 cores, 64GB) | 71,36 € | Techo duro del modelo mono-proceso actual. Pasado esto, más hardware ya no ayuda: el event loop de Node satura con un solo core útil para JS, por muchos núcleos que compres |
| **80+ empresas** | **No es un problema de servidor.** Requiere primero la Fase 4 del plan (Redis, workers Baileys separados, base de datos en máquina propia) | — | Con eso resuelto, se puede repartir carga entre varios Root Server (ej. 2-3× RS 4000 G12 detrás de un balanceador) por unos 80-120€/mes total, para varios cientos de empresas |

## Separación recomendada de base de datos

A partir de la etapa de 20-35 empresas, mover PostgreSQL a su propio
Root Server (mínimo RS 1000 G12, 12,79€/mes) en vez de compartir CPU/RAM con
el proceso Node — así los picos de `pg_dump` del backup (`backup-service.ts`)
no compiten con las peticiones HTTP en producción, que es justo el problema
detectado en el análisis de arquitectura.

## Almacenamiento adicional

Netcup ofrece **Local Block Storage** a 0,012 €/GB/mes (hasta 8TB) — usarlo
para separar `/media`, `/uploads`, `/email-attachments` del disco del sistema
en cuanto se note crecimiento, y facilita migrar a object storage real más
adelante (Fase 4) sin depender del disco raíz del servidor.

## Resumen de gasto de infraestructura por etapa

| Empresas | Servidor app | BD separada | Storage extra | Total infra/mes |
|---|---|---|---|---|
| 0-8 | VPS 1000 G12 | — | — | ~10 € |
| 8-20 | RS 1000 G12 | — | — | ~13 € |
| 20-35 | RS 2000 G12 | RS 1000 G12 | ~5 € (Block Storage) | ~39 € |
| 35-55 | RS 4000 G12 | RS 2000 G12 | ~10 € | ~71 € |
| 55-80 | RS 8000 G12 | RS 2000 G12 | ~15 € | ~108 € |

Estos números son solo el servidor Netcup — no incluyen los costes variables
de APIs (IA, WhatsApp oficial, ElevenLabs, etc.) ya desglosados en la
conversación de costes por cliente.
