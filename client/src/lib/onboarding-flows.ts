/**
 * Role-based onboarding flows.
 *
 * Defines what a newly logged-in user should be shown during onboarding,
 * tailored to their role (`super_admin` | `admin` | `agent` from the
 * `users.role` column — see `shared/schema.ts`, `userRoleEnum`).
 *
 * Admins/owners get a setup-oriented flow (channels, team, roles,
 * availability, WhatsApp behavior, pipeline). Agents get a usage-oriented
 * flow focused on the inbox (replying, quick replies, assigning chats to
 * themselves, tagging conversations).
 *
 * Routes referenced here are verified against `client/src/App.tsx` and the
 * tabs rendered by `client/src/pages/settings.tsx` (driven by the `?tab=`
 * query param, see `getActiveTab()` in that file).
 */

export type OnboardingStep = {
  /** Stable identifier for the step (used as React key / analytics id). */
  id: string;
  /** Short, action-oriented title. */
  title: string;
  /** One or two sentences explaining what to do and why. */
  description: string;
  /** Label for the call-to-action button. */
  actionLabel: string;
  /**
   * Internal app route to navigate to (wouter `Link`), e.g. "/inbox" or
   * "/settings?tab=team". Mutually exclusive in intent with `actionUrl`,
   * but both may be provided if a step also links out to docs.
   */
  actionRoute?: string;
  /** External URL (e.g. docs/help center) to open in a new tab. */
  actionUrl?: string;
  /** Optional short walkthrough video for this step. */
  videoUrl?: string;
};

/**
 * Admin / company-owner onboarding: get the workspace ready for the team.
 */
export const adminOnboardingFlow: OnboardingStep[] = [
  {
    id: "connect-whatsapp-channel",
    title: "Conecta tu primer canal de WhatsApp",
    description:
      "Vincula tu número de WhatsApp (u otro canal) para que tu equipo pueda empezar a recibir y responder conversaciones de tus clientes.",
    actionLabel: "Conectar canal",
    actionRoute: "/settings?tab=channels",
  },
  {
    id: "invite-team-members",
    title: "Invita a los miembros de tu equipo",
    description:
      "Agrega a tus agentes y compañeros de equipo para que puedan iniciar sesión y atender conversaciones desde el inbox.",
    actionLabel: "Invitar equipo",
    actionRoute: "/settings?tab=team",
  },
  {
    id: "configure-roles-and-permissions",
    title: "Configura roles y permisos",
    description:
      "Define qué puede ver y hacer cada rol de tu equipo (por ejemplo, quién puede ver todas las conversaciones o administrar campañas).",
    actionLabel: "Configurar roles",
    actionRoute: "/settings?tab=team",
  },
  {
    id: "configure-agent-availability",
    title: "Configura la disponibilidad de tus agentes",
    description:
      "Define los horarios en que cada agente está disponible; esto determina quién puede recibir conversaciones asignadas en cada momento.",
    actionLabel: "Configurar disponibilidad",
    actionRoute: "/settings?tab=inbox",
  },
  {
    id: "customize-whatsapp-behavior",
    title: "Personaliza el comportamiento de WhatsApp",
    description:
      "Ajusta indicadores de escritura, agrupación de mensajes y otros detalles para que las conversaciones se sientan naturales.",
    actionLabel: "Personalizar comportamiento",
    actionRoute: "/settings?tab=whatsapp-behavior",
  },
  {
    id: "setup-pipeline",
    title: "Configura tu pipeline de ventas",
    description:
      "Crea las etapas de tu embudo para dar seguimiento a oportunidades directamente desde las conversaciones.",
    actionLabel: "Ir al pipeline",
    actionRoute: "/pipeline",
  },
];

/**
 * Super admin onboarding: everything an admin sees, plus a step pointing to
 * the platform-level admin panel (companies, plans, etc.).
 */
export const superAdminOnboardingFlow: OnboardingStep[] = [
  ...adminOnboardingFlow,
  {
    id: "explore-admin-panel",
    title: "Explora el panel de administración de la plataforma",
    description:
      "Como super administrador, puedes gestionar empresas, planes y usuarios de toda la plataforma desde el panel de administración.",
    actionLabel: "Ir al panel admin",
    actionRoute: "/admin/dashboard",
  },
];

/**
 * Agent onboarding: how to work chats day-to-day inside the inbox.
 */
export const agentOnboardingFlow: OnboardingStep[] = [
  {
    id: "view-and-reply-conversations",
    title: "Revisa y responde conversaciones en el inbox",
    description:
      "El inbox es tu espacio de trabajo principal: aquí verás todas las conversaciones asignadas a ti o a tu equipo y podrás responderlas en tiempo real.",
    actionLabel: "Ir al inbox",
    actionRoute: "/inbox",
  },
  {
    id: "assign-chat-to-yourself",
    title: "Asígnate una conversación",
    description:
      "Toma una conversación sin asignar para empezar a atenderla; así tu equipo sabe que tú te estás encargando de ese cliente.",
    actionLabel: "Ver conversaciones",
    actionRoute: "/inbox",
  },
  {
    id: "use-quick-replies",
    title: "Usa respuestas rápidas",
    description:
      "Ahorra tiempo respondiendo con plantillas predefinidas desde el panel de respuestas rápidas dentro del cuadro de mensaje.",
    actionLabel: "Abrir el inbox",
    actionRoute: "/inbox",
  },
  {
    id: "use-tags",
    title: "Organiza tus chats con etiquetas",
    description:
      "Agrega etiquetas a conversaciones y contactos para clasificarlas (por ejemplo, \"urgente\" o \"seguimiento\") y encontrarlas más fácilmente después.",
    actionLabel: "Etiquetar conversaciones",
    actionRoute: "/inbox",
  },
];

/**
 * Returns the onboarding steps that correspond to a given user role.
 * Falls back to the agent flow for unknown/empty roles, since it's the
 * safer, least-privileged default.
 */
export function getOnboardingFlowForRole(role: string | null | undefined): OnboardingStep[] {
  switch (role) {
    case "super_admin":
      return superAdminOnboardingFlow;
    case "admin":
      return adminOnboardingFlow;
    case "agent":
      return agentOnboardingFlow;
    default:
      return agentOnboardingFlow;
  }
}
