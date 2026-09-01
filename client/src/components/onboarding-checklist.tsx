import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Radio,
  MessageSquareText,
  Users,
  Kanban,
  Workflow,
  PartyPopper,
} from 'lucide-react';

/**
 * Fixed set of onboarding steps shown to a newly-created account.
 * `key` must match the server's ONBOARDING_CHECKLIST_STEP_KEYS
 * (server/storage.ts) so completion tracking stays in sync.
 */
type ChecklistStep = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  titleDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
  href: string;
};

const CHECKLIST_STEPS: ChecklistStep[] = [
  {
    key: 'connect_channel',
    icon: Radio,
    titleKey: 'onboardingChecklist.steps.connectChannel.title',
    titleDefault: 'Conecta tu primer canal',
    descriptionKey: 'onboardingChecklist.steps.connectChannel.description',
    descriptionDefault: 'Enlaza WhatsApp, WebChat u otro canal para empezar a recibir conversaciones.',
    href: '/settings?tab=channels',
  },
  {
    key: 'create_template',
    icon: MessageSquareText,
    titleKey: 'onboardingChecklist.steps.createTemplate.title',
    titleDefault: 'Crea tu primera plantilla de mensaje',
    descriptionKey: 'onboardingChecklist.steps.createTemplate.description',
    descriptionDefault: 'Prepara respuestas rápidas y mensajes de bienvenida reutilizables.',
    href: '/templates',
  },
  {
    key: 'invite_team',
    icon: Users,
    titleKey: 'onboardingChecklist.steps.inviteTeam.title',
    titleDefault: 'Invita a tu equipo',
    descriptionKey: 'onboardingChecklist.steps.inviteTeam.description',
    descriptionDefault: 'Agrega agentes para que te ayuden a atender las conversaciones.',
    href: '/settings?tab=team',
  },
  {
    key: 'configure_pipeline',
    icon: Kanban,
    titleKey: 'onboardingChecklist.steps.configurePipeline.title',
    titleDefault: 'Configura tu pipeline de ventas',
    descriptionKey: 'onboardingChecklist.steps.configurePipeline.description',
    descriptionDefault: 'Organiza tus oportunidades en etapas para dar seguimiento a cada contacto.',
    href: '/pipeline',
  },
  {
    key: 'auto_assignment',
    icon: Workflow,
    titleKey: 'onboardingChecklist.steps.autoAssignment.title',
    titleDefault: 'Activa la asignación automática',
    descriptionKey: 'onboardingChecklist.steps.autoAssignment.description',
    descriptionDefault: 'Define reglas para mover o asignar conversaciones automáticamente.',
    href: '/settings?tab=pipeline',
  },
];

type OnboardingProgressResponse = {
  progress: Record<string, boolean>;
  completedAt: string | null;
};

function dismissedStorageKey(userId: number | string) {
  return `zinto:onboarding-checklist-dismissed:${userId}`;
}

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  const [dismissed, setDismissed] = useState(() => {
    if (!user?.id) return false;
    try {
      return window.localStorage.getItem(dismissedStorageKey(user.id)) === '1';
    } catch {
      return false;
    }
  });

  const { data, isLoading } = useQuery<OnboardingProgressResponse>({
    queryKey: ['/api/users/onboarding-progress'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/users/onboarding-progress');
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });

  const progress = data?.progress || {};

  const updateStepMutation = useMutation({
    mutationFn: async ({ stepKey, completed }: { stepKey: string; completed: boolean }) => {
      const res = await apiRequest('POST', '/api/users/onboarding-progress', { stepKey, completed });
      return res.json() as Promise<OnboardingProgressResponse>;
    },
    onMutate: async ({ stepKey, completed }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/users/onboarding-progress'] });
      const previous = queryClient.getQueryData<OnboardingProgressResponse>(['/api/users/onboarding-progress']);
      queryClient.setQueryData<OnboardingProgressResponse>(['/api/users/onboarding-progress'], (old) => ({
        progress: { ...(old?.progress || {}), [stepKey]: completed },
        completedAt: old?.completedAt ?? null,
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['/api/users/onboarding-progress'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/onboarding-progress'] });
    },
  });

  const completedCount = useMemo(
    () => CHECKLIST_STEPS.filter((step) => progress[step.key] === true).length,
    [progress],
  );
  const totalSteps = CHECKLIST_STEPS.length;
  const percent = totalSteps === 0 ? 0 : Math.round((completedCount / totalSteps) * 100);
  const allComplete = completedCount === totalSteps;

  const handleDismiss = () => {
    setDismissed(true);
    if (user?.id) {
      try {
        window.localStorage.setItem(dismissedStorageKey(user.id), '1');
      } catch {
        // ignore storage failures (private mode, disabled storage, etc.)
      }
    }
  };

  if (!user?.id || isLoading || dismissed || allComplete) {
    return null;
  }

  return (
    <Card className="mb-4 border-primary/20 bg-primary/5 shrink-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold truncate">
              {t('onboardingChecklist.title', 'Primeros pasos')} {completedCount}/{totalSteps}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? t('common.expand', 'Expandir') : t('common.collapse', 'Colapsar')}
              >
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDismiss}
                aria-label={t('onboardingChecklist.dismiss', 'Ocultar')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Progress value={percent} className="h-2 mt-2 bg-primary/10" />
        </div>
      </CardHeader>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <CardContent className="pt-0 space-y-1">
              {CHECKLIST_STEPS.map((step) => {
                const isDone = progress[step.key] === true;
                const Icon = step.icon;
                return (
                  <div
                    key={step.key}
                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-background/60"
                  >
                    <Checkbox
                      checked={isDone}
                      disabled={updateStepMutation.isPending}
                      onCheckedChange={(checked) =>
                        updateStepMutation.mutate({ stepKey: step.key, completed: checked === true })
                      }
                      aria-label={t(step.titleKey, step.titleDefault)}
                    />

                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                        {t(step.titleKey, step.titleDefault)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t(step.descriptionKey, step.descriptionDefault)}
                      </p>
                    </div>

                    <motion.div
                      key={isDone ? 'done' : 'pending'}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className="shrink-0"
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </motion.div>

                    <Button asChild variant="outline" size="sm" className="shrink-0 h-7 text-xs">
                      <Link href={step.href}>
                        {t('onboardingChecklist.goTo', 'Ir')}
                      </Link>
                    </Button>
                  </div>
                );
              })}

              {allComplete && (
                <div className="flex items-center gap-2 px-2 py-2 text-sm text-emerald-600">
                  <PartyPopper className="h-4 w-4" />
                  {t('onboardingChecklist.allDone', '¡Todo listo! Tu cuenta está configurada.')}
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
