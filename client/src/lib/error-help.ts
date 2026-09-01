/**
 * error-help.ts
 *
 * Maps low-level error codes/messages (mostly from Meta's Graph API and generic
 * network/fetch failures) to user-facing "help entries": a short title, a plain
 * explanation of why it happened, and an optional action the user can take to
 * resolve it.
 *
 * This module is intentionally UI-agnostic — see `error-with-help.tsx` for the
 * React component that renders an `ErrorHelpEntry`.
 *
 * The patterns below were derived from real error codes/messages surfaced by:
 *  - server/services/meta-graph-api.ts (META_CREDENTIAL_ERROR_CODES: 190/101/102,
 *    META_THROTTLE_ERROR_CODES: 4/17/32/613, `token_invalid_or_expired`,
 *    `meta_oauth_error`, `meta_transport_error`)
 *  - client/src/hooks/useMetaChannelsOnboarding.ts and
 *    useUnifiedMetaChannelsOnboarding.ts (`missing_permissions`,
 *    `permission_restricted`, `app_review_pending`, `no_eligible_assets`,
 *    `webhook_subscription_failed`, session-expired messages)
 *  - server/webhook-routes.ts (webhook `hub.verify_token` mismatches and
 *    `x-hub-signature-256` validation failures)
 */

export type ErrorHelpSeverity = 'warning' | 'error' | 'info';

export interface ErrorHelpEntry {
  /** Short, human-readable title (e.g. "Permisos faltantes") */
  title: string;
  /** Plain-language explanation of why this happened */
  explanation: string;
  /** Label for the resolving action/button, if any (e.g. "Ver cómo dar permisos") */
  actionLabel?: string;
  /**
   * Where the action points to. Can be an internal app route (e.g. "/settings/channels")
   * or an external documentation URL (e.g. "https://developers.facebook.com/...").
   * Internal routes should start with "/"; anything else is treated as external.
   */
  actionUrl?: string;
  /** Visual severity, used to pick an icon/color in <ErrorWithHelp /> */
  severity: ErrorHelpSeverity;
}

/**
 * A mapping entry: `match` is either an exact code (case-insensitive) or a
 * RegExp tested against the raw error string. The first matching entry wins,
 * so more specific patterns should be listed before more generic ones.
 */
interface ErrorHelpRule {
  match: string | RegExp;
  entry: ErrorHelpEntry;
}

const META_PERMISSIONS_DOC_URL =
  'https://developers.facebook.com/docs/permissions/reference';
const META_TOKEN_DOC_URL =
  'https://developers.facebook.com/docs/facebook-login/guides/access-tokens#extending';
const META_WEBHOOKS_DOC_URL =
  'https://developers.facebook.com/docs/graph-api/webhooks/getting-started';
const WHATSAPP_PHONE_QUALITY_DOC_URL =
  'https://developers.facebook.com/docs/whatsapp/messaging-limits#quality-rating';
const WHATSAPP_PHONE_VERIFICATION_DOC_URL =
  'https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-cloud-api-solution#verify-phone-number';

const SUPPORT_CONTACT_URL = '/settings/support';
const CHANNELS_SETTINGS_URL = '/settings/channels';

/**
 * Ordered list of rules. Codes/messages are matched top to bottom; the first
 * match is returned by getErrorHelp().
 */
const ERROR_HELP_RULES: ErrorHelpRule[] = [
  // ---------------------------------------------------------------------
  // Meta / Facebook permission errors (403, missing_permissions, scopes)
  // ---------------------------------------------------------------------
  {
    match: /missing_permissions|missing.?scopes?|permission.?restricted/i,
    entry: {
      title: 'Faltan permisos de Meta',
      explanation:
        'Tu cuenta de Facebook no otorgó todos los permisos necesarios (por ejemplo whatsapp_business_messaging o instagram_graph_api). Meta requiere que aceptes cada permiso solicitado durante el inicio de sesión para poder leer y enviar mensajes.',
      actionLabel: 'Ver cómo dar permisos',
      actionUrl: META_PERMISSIONS_DOC_URL,
      severity: 'warning',
    },
  },
  {
    match: /app_review_pending|advanced_access|review.?pending/i,
    entry: {
      title: 'Revisión de la app pendiente en Meta',
      explanation:
        'Este permiso está en modo de prueba: Meta aún no aprobó el "App Review" que habilita el acceso avanzado. Hasta que se apruebe, solo los usuarios de prueba definidos en el panel de Meta podrán conectarse.',
      actionLabel: 'Contactar soporte',
      actionUrl: SUPPORT_CONTACT_URL,
      severity: 'warning',
    },
  },
  {
    match: /whatsapp_business_messaging|instagram_graph_api|pages_messaging/i,
    entry: {
      title: 'Permiso de mensajería no otorgado',
      explanation:
        'La cuenta conectada no concedió el permiso específico que este canal necesita (whatsapp_business_messaging, instagram_graph_api o pages_messaging). Vuelve a iniciar sesión con Facebook y acepta todos los permisos solicitados.',
      actionLabel: 'Ver cómo dar permisos',
      actionUrl: META_PERMISSIONS_DOC_URL,
      severity: 'warning',
    },
  },
  {
    match: /^403$|forbidden|access.?denied/i,
    entry: {
      title: 'Acceso denegado (403)',
      explanation:
        'El servidor rechazó la solicitud porque tu cuenta o token no tiene los permisos necesarios para esta acción.',
      actionLabel: 'Ver cómo dar permisos',
      actionUrl: META_PERMISSIONS_DOC_URL,
      severity: 'error',
    },
  },

  // ---------------------------------------------------------------------
  // Token / OAuth errors (Meta Graph error codes 190, 101, 102 = OAuthException)
  // ---------------------------------------------------------------------
  {
    match: /token_invalid_or_expired|token.?expired|expired.?token/i,
    entry: {
      title: 'Token de acceso expirado',
      explanation:
        'La sesión con Meta venció o el token de acceso ya no es válido. Esto suele pasar cuando pasó mucho tiempo desde la última conexión o se revocó el acceso desde Facebook.',
      actionLabel: 'Reconectar cuenta',
      actionUrl: CHANNELS_SETTINGS_URL,
      severity: 'warning',
    },
  },
  {
    match: /invalid.?token|oauthexception|meta_oauth_error|^190$|^101$|^102$/i,
    entry: {
      title: 'Token o credenciales inválidas',
      explanation:
        'Meta rechazó el token de autenticación (error OAuth). Puede deberse a un cambio de contraseña, revocación manual del acceso o a que la app cambió de configuración.',
      actionLabel: 'Reconectar cuenta',
      actionUrl: CHANNELS_SETTINGS_URL,
      severity: 'error',
    },
  },
  {
    match: /session.?expired|messenger_session_expired|instagram_session_expired/i,
    entry: {
      title: 'La sesión de conexión expiró',
      explanation:
        'El proceso de vinculación con Meta tardó demasiado y la sesión temporal caducó. Es una medida de seguridad de Meta; no se perdió ninguna configuración.',
      actionLabel: 'Intentar de nuevo',
      actionUrl: CHANNELS_SETTINGS_URL,
      severity: 'info',
    },
  },
  {
    match: /^401$|unauthorized/i,
    entry: {
      title: 'No autorizado (401)',
      explanation:
        'La solicitud no incluyó credenciales válidas, o la sesión actual ya no es válida.',
      actionLabel: 'Reconectar cuenta',
      actionUrl: CHANNELS_SETTINGS_URL,
      severity: 'error',
    },
  },

  // ---------------------------------------------------------------------
  // Webhook configuration errors
  // ---------------------------------------------------------------------
  {
    match: /webhook_subscription_failed/i,
    entry: {
      title: 'La suscripción al webhook falló',
      explanation:
        'El canal se creó correctamente, pero Meta no pudo confirmar la suscripción del webhook. Esto suele deberse a que la URL de callback no respondió a tiempo o no coincide con la configurada en el panel de Meta.',
      actionLabel: 'Ver guía de webhooks',
      actionUrl: META_WEBHOOKS_DOC_URL,
      severity: 'warning',
    },
  },
  {
    match: /verify_token|hub\.verify_token/i,
    entry: {
      title: 'El token de verificación del webhook no coincide',
      explanation:
        'Meta intentó verificar el webhook, pero el "verify token" enviado no coincide con el configurado en el servidor. Revisa que el valor sea idéntico en ambos lados (Meta y las variables de entorno del servidor).',
      actionLabel: 'Ver guía de webhooks',
      actionUrl: META_WEBHOOKS_DOC_URL,
      severity: 'warning',
    },
  },
  {
    match: /x-hub-signature|signature.?validation.?failed|signature.?mismatch/i,
    entry: {
      title: 'Firma del webhook inválida',
      explanation:
        'El servidor recibió un evento de Meta cuya firma (x-hub-signature-256) no pudo validarse con el App Secret configurado. El evento fue rechazado por seguridad.',
      actionLabel: 'Ver guía de webhooks',
      actionUrl: META_WEBHOOKS_DOC_URL,
      severity: 'error',
    },
  },
  {
    match: /webhook.*not.?configured|webhook.*not.?set.?up/i,
    entry: {
      title: 'Webhook no configurado',
      explanation:
        'Este canal no tiene un webhook activo, por lo que no podrá recibir mensajes entrantes ni actualizaciones de estado en tiempo real.',
      actionLabel: 'Ver guía de webhooks',
      actionUrl: META_WEBHOOKS_DOC_URL,
      severity: 'warning',
    },
  },

  // ---------------------------------------------------------------------
  // Phone number / quality issues (WhatsApp)
  // ---------------------------------------------------------------------
  {
    match: /phone.*not.?verified|number.*not.?verified|code_verification_status/i,
    entry: {
      title: 'Número de teléfono no verificado',
      explanation:
        'El número de WhatsApp Business aún no completó la verificación por SMS o llamada ante Meta, por lo que no puede enviar ni recibir mensajes todavía.',
      actionLabel: 'Ver cómo verificar el número',
      actionUrl: WHATSAPP_PHONE_VERIFICATION_DOC_URL,
      severity: 'warning',
    },
  },
  {
    match: /quality_rating|quality.?red|calidad.?roja/i,
    entry: {
      title: 'Calidad del número en nivel bajo (rojo)',
      explanation:
        'Meta bajó la calificación de calidad de este número a "roja" por el volumen de bloqueos o reportes de spam recibidos recientemente. Esto puede limitar cuántos mensajes puedes enviar por día.',
      actionLabel: 'Ver límites de mensajería',
      actionUrl: WHATSAPP_PHONE_QUALITY_DOC_URL,
      severity: 'warning',
    },
  },
  {
    match: /no_eligible_assets/i,
    entry: {
      title: 'No se encontraron páginas o cuentas elegibles',
      explanation:
        'La cuenta de Facebook usada para conectar no administra ninguna página de Facebook ni cuenta de Instagram profesional vinculada, o no cumple los requisitos para el canal seleccionado.',
      actionLabel: 'Reintentar conexión',
      actionUrl: CHANNELS_SETTINGS_URL,
      severity: 'info',
    },
  },

  // ---------------------------------------------------------------------
  // Rate limiting / throttling (Meta error codes 4, 17, 32, 613)
  // ---------------------------------------------------------------------
  {
    match: /rate.?limit|throttl|too.?many.?requests|^429$|^4$|^17$|^32$|^613$/i,
    entry: {
      title: 'Límite de solicitudes alcanzado',
      explanation:
        'Se enviaron demasiadas solicitudes a Meta en poco tiempo y la API está limitando temporalmente las respuestas. Suele resolverse solo en unos minutos.',
      actionLabel: 'Reintentar en unos minutos',
      severity: 'info',
    },
  },

  // ---------------------------------------------------------------------
  // Generic network errors
  // ---------------------------------------------------------------------
  {
    match: /failed to fetch|networkerror|network.?error|err_network|err_internet_disconnected/i,
    entry: {
      title: 'No se pudo conectar con el servidor',
      explanation:
        'Hubo un problema de red al comunicarse con el servidor. Puede deberse a una conexión a internet inestable, un bloqueador de contenido o que el servicio esté temporalmente inaccesible.',
      actionLabel: 'Reintentar',
      severity: 'error',
    },
  },
  {
    match: /timeout|timed.?out|etimedout/i,
    entry: {
      title: 'La solicitud tardó demasiado',
      explanation:
        'El servidor no respondió a tiempo. Esto puede pasar por una conexión lenta o porque el servicio de Meta está experimentando demoras.',
      actionLabel: 'Reintentar',
      severity: 'warning',
    },
  },
  {
    match: /^500$|internal.?server.?error/i,
    entry: {
      title: 'Error interno del servidor (500)',
      explanation:
        'Algo salió mal en nuestro servidor al procesar la solicitud. Nuestro equipo puede necesitar revisarlo si el problema persiste.',
      actionLabel: 'Contactar soporte',
      actionUrl: SUPPORT_CONTACT_URL,
      severity: 'error',
    },
  },
];

/**
 * Generic fallback shown when no rule matches a given error code/message.
 */
const FALLBACK_ENTRY: ErrorHelpEntry = {
  title: 'Ocurrió un error inesperado',
  explanation:
    'No pudimos identificar automáticamente la causa de este error. Si el problema persiste, nuestro equipo de soporte puede ayudarte a resolverlo.',
  actionLabel: 'Contactar soporte',
  actionUrl: SUPPORT_CONTACT_URL,
  severity: 'error',
};

/**
 * Looks up a human-friendly help entry for a given error code or raw error
 * message. Matching is case-insensitive and tolerant of partial matches
 * (e.g. passing a full exception message like "OAuthException: Error
 * validating access token" still matches the token/OAuth rule).
 *
 * Returns `null` only when the input is empty/falsy — for anything else that
 * doesn't match a known pattern, callers should use `getErrorHelpOrFallback`
 * (or handle the `null` case with their own generic UI, matching the same
 * fallback content as `FALLBACK_ENTRY` above).
 */
export function getErrorHelp(errorCodeOrMessage: string | null | undefined): ErrorHelpEntry | null {
  if (!errorCodeOrMessage || typeof errorCodeOrMessage !== 'string') {
    return null;
  }

  const trimmed = errorCodeOrMessage.trim();
  if (!trimmed) {
    return null;
  }

  for (const rule of ERROR_HELP_RULES) {
    if (typeof rule.match === 'string') {
      if (rule.match.toLowerCase() === trimmed.toLowerCase()) {
        return rule.entry;
      }
    } else if (rule.match.test(trimmed)) {
      return rule.entry;
    }
  }

  return null;
}

/**
 * Same as getErrorHelp, but never returns null — falls back to a generic,
 * friendly "contact support" entry when nothing matches. Convenient for UI
 * code that always wants something renderable.
 */
export function getErrorHelpOrFallback(errorCodeOrMessage: string | null | undefined): ErrorHelpEntry {
  return getErrorHelp(errorCodeOrMessage) ?? FALLBACK_ENTRY;
}

export { FALLBACK_ENTRY as genericErrorHelpFallback };
