import { useEffect, useRef, useSyncExternalStore } from 'react';
import Shepherd from 'shepherd.js';
import type { Tour } from 'shepherd.js';
import 'shepherd.js/dist/css/shepherd.css';
import { useTranslation } from '@/hooks/use-translation';
import {
  ONBOARDING_TOUR_STEPS,
  hasCompletedOnboardingTour,
  markOnboardingTourCompleted,
} from '@/lib/onboarding-tour';

/**
 * Guided onboarding tour, built on Shepherd.js and skinned to match this
 * project's shadcn/Tailwind theme tokens (see `client/src/index.css`).
 *
 * Mount `<OnboardingTourOverlay />` once, near the root of the authenticated
 * app shell (currently done from `client/src/pages/Inbox.tsx`, the first
 * screen a user lands on post-login). It:
 *  - builds the tour from `ONBOARDING_TOUR_STEPS`, skipping any step whose
 *    target element isn't present/visible right now (permission-gated nav
 *    items, chrome hidden on small screens, etc.) so it never breaks;
 *  - auto-starts once for first-time visitors (tracked via the
 *    `zinto_onboarding_tour_completed` localStorage flag — no backend/DB
 *    involved, see `@/lib/onboarding-tour`);
 *  - exposes `useOnboardingTour()` so any other component (a "Restart tour"
 *    menu item, a help button, ...) can start or skip the tour without
 *    needing a React context/provider wrapper.
 */

// ---------------------------------------------------------------------------
// Tiny external-store controller. Kept outside React so `useOnboardingTour()`
// can be called from anywhere in the tree, independent of where the single
// <OnboardingTourOverlay /> instance happens to be mounted.
// ---------------------------------------------------------------------------

type Listener = () => void;

class OnboardingTourController {
  private tour: Tour | null = null;
  private active = false;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): boolean => this.active;

  register(tour: Tour): void {
    this.tour = tour;
  }

  unregister(tour: Tour): void {
    if (this.tour === tour) {
      this.tour = null;
    }
    this.setActive(false);
  }

  setActive(value: boolean): void {
    if (this.active !== value) {
      this.active = value;
      this.listeners.forEach((listener) => listener());
    }
  }

  /** Starts the tour from the beginning, even if it was already completed once. */
  start(): void {
    if (!this.tour || this.tour.isActive()) return;
    void this.tour.start();
  }

  /** Skips/cancels an in-progress tour. If none is mounted, just records the skip. */
  skip(): void {
    if (this.tour && this.tour.isActive()) {
      void this.tour.cancel();
    } else {
      markOnboardingTourCompleted();
    }
  }
}

const onboardingTourController = new OnboardingTourController();

export interface UseOnboardingTourResult {
  /** Whether a tour is currently being shown to the user. */
  isTourActive: boolean;
  /** Starts (or restarts) the tour from step one. */
  startTour: () => void;
  /** Skips/dismisses the tour and remembers that choice for this browser. */
  skipTour: () => void;
}

/** Start/skip/observe the guided onboarding tour from any component. */
export function useOnboardingTour(): UseOnboardingTourResult {
  const isTourActive = useSyncExternalStore(
    onboardingTourController.subscribe,
    onboardingTourController.getSnapshot,
    () => false,
  );

  return {
    isTourActive,
    startTour: () => onboardingTourController.start(),
    skipTour: () => onboardingTourController.skip(),
  };
}

// ---------------------------------------------------------------------------
// Overlay component
// ---------------------------------------------------------------------------

function isVisibleInDom(element: Element | null): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) return false;
  // offsetParent is null for display:none (and fixed-position edge cases we
  // don't use here), which is good enough to detect "collapsed on mobile" /
  // "hidden by a permission gate" without a layout-thrashing getBoundingClientRect.
  return element.offsetParent !== null;
}

export function OnboardingTourOverlay() {
  const { t } = useTranslation();
  // Read `t` once at mount time so a translations refresh mid-tour doesn't
  // tear down and rebuild the (already-visible) Shepherd instance.
  const translateRef = useRef(t);
  translateRef.current = t;

  useEffect(() => {
    const translate = translateRef.current;

    const availableSteps = ONBOARDING_TOUR_STEPS.filter((step) => {
      if (!step.selector) return true;
      return isVisibleInDom(document.querySelector(step.selector));
    });

    // Nothing worth pointing at (e.g. a very early paint, or every optional
    // target is hidden) — bail out quietly rather than showing an empty tour.
    if (availableSteps.length < 2) {
      return;
    }

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      exitOnEsc: true,
      keyboardNavigation: true,
      defaultStepOptions: {
        classes: 'zinto-onboarding-step',
        scrollTo: { behavior: 'smooth', block: 'center' },
        cancelIcon: {
          enabled: true,
          label: translate('onboarding_tour.buttons.skip', 'Skip tour'),
        },
      },
    });

    const skipLabel = translate('onboarding_tour.buttons.skip', 'Skip tour');
    const backLabel = translate('onboarding_tour.buttons.back', 'Back');
    const nextLabel = translate('onboarding_tour.buttons.next', 'Next');
    const finishLabel = translate('onboarding_tour.buttons.finish', 'Finish');

    availableSteps.forEach((step, index) => {
      const isFirst = index === 0;
      const isLast = index === availableSteps.length - 1;

      const buttons: Array<{ text: string; classes: string; action(this: Tour): void }> = [];

      if (!isLast) {
        buttons.push({
          text: skipLabel,
          classes: 'zinto-onboarding-btn zinto-onboarding-btn--ghost',
          action() {
            this.cancel();
          },
        });
      }

      if (!isFirst) {
        buttons.push({
          text: backLabel,
          classes: 'zinto-onboarding-btn zinto-onboarding-btn--secondary',
          action() {
            this.back();
          },
        });
      }

      buttons.push({
        text: isLast ? finishLabel : nextLabel,
        classes: 'zinto-onboarding-btn zinto-onboarding-btn--primary',
        action() {
          if (isLast) {
            this.complete();
          } else {
            this.next();
          }
        },
      });

      tour.addStep({
        id: step.id,
        title: translate(step.titleKey, step.titleFallback),
        text: translate(step.textKey, step.textFallback),
        attachTo: step.selector ? { element: step.selector, on: step.position } : undefined,
        buttons,
      });
    });

    let isCleaningUp = false;

    const handleFinish = () => {
      markOnboardingTourCompleted();
      onboardingTourController.setActive(false);
    };

    tour.on('start', () => onboardingTourController.setActive(true));
    tour.on('complete', handleFinish);
    tour.on('cancel', () => {
      // A teardown-time `tour.cancel()` (see cleanup below) just hides the
      // DOM — it isn't the user asking to skip, so don't persist that.
      if (isCleaningUp) {
        onboardingTourController.setActive(false);
        return;
      }
      handleFinish();
    });

    onboardingTourController.register(tour);

    let autoStartTimer: number | undefined;
    if (!hasCompletedOnboardingTour()) {
      // Give the Inbox layout (conversation list, channel connections, etc.)
      // a moment to finish its first paint before highlighting parts of it.
      autoStartTimer = window.setTimeout(() => {
        if (!hasCompletedOnboardingTour()) {
          onboardingTourController.start();
        }
      }, 700);
    }

    return () => {
      isCleaningUp = true;
      if (autoStartTimer) window.clearTimeout(autoStartTimer);
      if (tour.isActive()) tour.cancel();
      onboardingTourController.unregister(tour);
    };
    // Intentionally mount-only: rebuilding on every render would tear down
    // an in-progress tour out from under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <style>{ONBOARDING_TOUR_STYLES}</style>;
}

// ---------------------------------------------------------------------------
// Theme — mapped onto this project's shadcn/Tailwind CSS variables so the
// tour looks native in both light and dark mode (see client/src/index.css).
// ---------------------------------------------------------------------------

const ONBOARDING_TOUR_STYLES = `
.shepherd-modal-overlay-container {
  z-index: 9998 !important;
}

.shepherd-element.zinto-onboarding-step {
  z-index: 9999 !important;
  max-width: min(23rem, calc(100vw - 1.5rem));
  border-radius: calc(var(--radius, 0.5rem) + 2px);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.35), 0 4px 12px -4px rgba(0, 0, 0, 0.18);
  font-family: inherit;
}

.shepherd-element.zinto-onboarding-step .shepherd-arrow:before {
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
}

.shepherd-element.zinto-onboarding-step .shepherd-header {
  background: transparent;
  padding: 1rem 1rem 0 1rem;
}

.shepherd-element.zinto-onboarding-step .shepherd-title {
  color: hsl(var(--popover-foreground));
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
}

.shepherd-element.zinto-onboarding-step .shepherd-text {
  color: hsl(var(--popover-foreground));
  opacity: 0.85;
  padding: 0.5rem 1rem 1rem 1rem;
  font-size: 0.875rem;
  line-height: 1.5;
}

.shepherd-element.zinto-onboarding-step .shepherd-footer {
  padding: 0 1rem 1rem 1rem;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.shepherd-element.zinto-onboarding-step .shepherd-cancel-icon {
  color: hsl(var(--muted-foreground));
}

.shepherd-element.zinto-onboarding-step .shepherd-cancel-icon:hover {
  color: hsl(var(--popover-foreground));
}

.shepherd-element.zinto-onboarding-step .shepherd-button.zinto-onboarding-btn {
  margin: 0;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 0.5rem 0.9rem;
  transition: opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.shepherd-element.zinto-onboarding-step .shepherd-button.zinto-onboarding-btn--primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.shepherd-element.zinto-onboarding-step .shepherd-button.zinto-onboarding-btn--primary:hover:not(:disabled) {
  opacity: 0.9;
}

.shepherd-element.zinto-onboarding-step .shepherd-button.zinto-onboarding-btn--secondary {
  background: transparent;
  color: hsl(var(--popover-foreground));
  border: 1px solid hsl(var(--border));
}

.shepherd-element.zinto-onboarding-step .shepherd-button.zinto-onboarding-btn--secondary:hover:not(:disabled) {
  background: hsl(var(--accent));
}

.shepherd-element.zinto-onboarding-step .shepherd-button.zinto-onboarding-btn--ghost {
  background: transparent;
  color: hsl(var(--muted-foreground));
  border: none;
  margin-right: auto;
}

.shepherd-element.zinto-onboarding-step .shepherd-button.zinto-onboarding-btn--ghost:hover:not(:disabled) {
  color: hsl(var(--popover-foreground));
  text-decoration: underline;
}

@media (max-width: 480px) {
  .shepherd-element.zinto-onboarding-step {
    max-width: calc(100vw - 1.25rem);
  }

  .shepherd-element.zinto-onboarding-step .shepherd-footer {
    justify-content: flex-end;
  }
}
`;
