# Cifrado roto (createCipher) y licencia sin firma real

**Fecha:** 2026-08-31
**Archivos:** `server/services/ai-credentials-service.ts`,
`server/services/license-validator.ts`, `scripts/build-licensed.js`
**Severidad:** Alta

## Problema

- `ai-credentials-service.ts` (guarda las API keys de IA de cada empresa)
  usaba `crypto.createCipher`/`createDecipher` — API deprecada de Node, sin
  IV (mismo texto claro siempre produce el mismo cifrado) y con derivación
  de clave débil (EVP_BytesToKey/MD5 interno).
- `social-auth.ts` tenía el mismo patrón, pero se confirmó que **todo el
  cuerpo de esas funciones está comentado (código muerto, líneas 9-57 y
  63-551 dentro de bloques `/* */`)** — no representa riesgo real, no se
  tocó.
- `license-validator.ts`: la clave de cifrado de la licencia
  (`ENCRYPTION_KEY`) estaba hardcodeada en el código fuente, y la firma
  (`verifySignature`) era un `sha256` plano **sin ningún secreto** —
  cualquiera con el código (cualquier cliente con el repo) podía calcular
  una firma válida para una licencia inventada. El generador
  (`scripts/build-licensed.js`) tenía exactamente el mismo problema.

## Fix

- `ai-credentials-service.ts`: `encryptApiKey`/`decryptApiKey` ahora usan
  `encryptValue`/`decryptValue` de `server/utils/crypto.ts` (ya existente
  en el proyecto, correcto: `createCipheriv`/`createDecipheriv` con IV
  aleatorio, formato `iv:ciphertext`). `decryptApiKey` sigue aceptando el
  formato legacy (sin `:`) para no perder acceso a credenciales ya
  guardadas — se re-cifran automáticamente la próxima vez que se guarden.
- `license-validator.ts` y `build-licensed.js`:
  - `ENCRYPTION_KEY` ahora lee `LICENSE_ENCRYPTION_KEY` de entorno, con el
    valor hardcodeado como fallback legacy (compatibilidad).
  - La firma pasa a `HMAC-SHA256` con `LICENSE_SIGNING_SECRET` (secreto que
    debe vivir solo en el entorno de producción, nunca en el repo). El
    validador acepta la firma HMAC nueva o, únicamente mientras
    `LICENSE_SIGNING_SECRET` no esté configurado, la firma legacy sin
    secreto — en cuanto se configura el secreto, cualquier firma legacy
    deja de aceptarse.
  - El generador avisa por consola si se ejecuta sin
    `LICENSE_SIGNING_SECRET` configurado.

## Pendiente

- Configurar `LICENSE_ENCRYPTION_KEY` y `LICENSE_SIGNING_SECRET` en el
  entorno real de producción (no en el repo) y regenerar las licencias
  vigentes con el nuevo secreto.
- Script de re-cifrado masivo de `company_ai_credentials`/
  `system_ai_credentials` ya guardadas, para migrarlas del formato legacy
  al nuevo sin esperar a que se editen manualmente.

## Verificación

`npx tsc --noEmit` sobre todo el proyecto: 0 errores nuevos.
