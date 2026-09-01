import { Link } from "wouter";
import { CheckCircle2, ExternalLink, PlayCircle } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getOnboardingFlowForRole,
  type OnboardingStep,
} from "@/lib/onboarding-flows";

interface RoleBasedOnboardingProps {
  /** Optional heading override. */
  title?: string;
  /** Optional description shown under the heading. */
  description?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/**
 * Renders an onboarding checklist tailored to the current user's role.
 *
 * Admins/owners (`admin`, `super_admin`) see setup-oriented steps (connect a
 * channel, invite the team, configure roles, availability, etc). Agents see
 * usage-oriented steps focused on working the inbox (reply to chats, use
 * quick replies, assign chats to themselves, tag conversations).
 */
export default function RoleBasedOnboarding({
  title,
  description,
  className,
}: RoleBasedOnboardingProps) {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return null;
  }

  // A platform-level super admin (isSuperAdmin flag) is treated as
  // super_admin even if the company-scoped `role` column says otherwise.
  const effectiveRole = user.isSuperAdmin ? "super_admin" : user.role ?? "agent";
  const steps = getOnboardingFlowForRole(effectiveRole);

  const isAdminFlow = effectiveRole === "admin" || effectiveRole === "super_admin";

  const heading =
    title ?? (isAdminFlow ? "Configura tu espacio de trabajo" : "Empieza a atender chats");
  const subheading =
    description ??
    (isAdminFlow
      ? "Sigue estos pasos para dejar tu cuenta lista para tu equipo."
      : "Sigue estos pasos para empezar a responder conversaciones como agente.");

  return (
    <div className={className}>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
        <Badge variant="secondary" className="capitalize">
          {effectiveRole.replace("_", " ")}
        </Badge>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{subheading}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {steps.map((step, index) => (
          <OnboardingStepCard key={step.id} step={step} index={index} />
        ))}
      </div>
    </div>
  );
}

function OnboardingStepCard({
  step,
  index,
}: {
  step: OnboardingStep;
  index: number;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {index + 1}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base leading-snug">{step.title}</CardTitle>
          </div>
        </div>
        <CardDescription className="pl-10">{step.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap items-center gap-2 pl-[3.25rem] pt-2">
        {step.actionRoute && (
          <Button asChild size="sm">
            <Link href={step.actionRoute}>
              <CheckCircle2 className="h-4 w-4" />
              {step.actionLabel}
            </Link>
          </Button>
        )}
        {step.actionUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={step.actionUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              {step.actionUrl && !step.actionRoute ? step.actionLabel : "Saber más"}
            </a>
          </Button>
        )}
        {step.videoUrl && (
          <Button asChild size="sm" variant="ghost">
            <a href={step.videoUrl} target="_blank" rel="noopener noreferrer">
              <PlayCircle className="h-4 w-4" />
              Ver video
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
