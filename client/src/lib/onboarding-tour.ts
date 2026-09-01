/**
 * Guided onboarding tour — step definitions and small localStorage helpers.
 *
 * This is plain data (no React, no Shepherd import) so it can be unit-tested
 * and imported anywhere without pulling in the tour runtime. The actual
 * Shepherd.js wiring lives in `@/components/onboarding-tour-overlay`.
 *
 * MVP persistence: whether a user has seen the tour is tracked purely in
 * `localStorage` (per browser/device), not in the database — this keeps the
 * tour independent from any concurrent backend/schema work.
 */

/** localStorage key used to remember that a viewer finished or skipped the tour. */
export const ONBOARDING_TOUR_STORAGE_KEY = 'zinto_onboarding_tour_completed';

/**
 * Returns true if this browser has already completed (or skipped) the tour.
 * Fails "closed" (treats storage errors as already-completed) so a blocked
 * or unavailable localStorage (private browsing, storage-blocking policies)
 * never forces the tour to repeatedly pop up.
 */
export function hasCompletedOnboardingTour(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY) === 'true';
  } catch {
    return true;
  }
}

/** Marks the tour as completed/skipped so it won't auto-start again on this browser. */
export function markOnboardingTourCompleted(): void {
  try {
    window.localStorage.setItem(ONBOARDING_TOUR_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage errors (private mode, quota, disabled storage, etc).
  }
}

/** Clears the completion flag — mainly useful for a "Restart tour" action or QA. */
export function resetOnboardingTourProgress(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_TOUR_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export type OnboardingTourStepId =
  | 'welcome'
  | 'inbox-nav'
  | 'channels'
  | 'connect-channel'
  | 'search'
  | 'contacts-nav'
  | 'pipeline-nav'
  | 'tasks-nav'
  | 'profile'
  | 'finish';

export interface OnboardingTourStepDef {
  id: OnboardingTourStepId;
  /**
   * CSS selector for the element to highlight. Omitted for steps that
   * should render as a centered modal (welcome/finish screens) instead of
   * pointing at a specific part of the UI.
   */
  selector?: string;
  /** Popover placement relative to the target element. */
  position: 'top' | 'bottom' | 'left' | 'right';
  /** Translation key + English fallback, following this codebase's `t(key, fallback)` convention. */
  titleKey: string;
  titleFallback: string;
  textKey: string;
  textFallback: string;
}

/**
 * The tour walks through the persistent app chrome (sidebar + header) that
 * surrounds `/inbox`, the first screen a new user lands on after login.
 * Selectors target stable `data-tour="..."` markers added to
 * `client/src/components/layout/Sidebar.tsx` and `Header.tsx`.
 *
 * Steps whose target isn't present in the DOM when the tour starts (e.g. a
 * permission-gated nav item the current user doesn't have, or sidebar
 * elements hidden on small screens) are filtered out at runtime — see
 * `buildAvailableTourSteps` in the overlay component — so the tour always
 * adapts to what's actually on screen instead of breaking.
 */
export const ONBOARDING_TOUR_STEPS: OnboardingTourStepDef[] = [
  {
    id: 'welcome',
    position: 'bottom',
    titleKey: 'onboarding_tour.welcome.title',
    titleFallback: 'Welcome to Zinto! 👋',
    textKey: 'onboarding_tour.welcome.text',
    textFallback:
      "Let's take a 60-second tour of your new inbox — where all your customer conversations, contacts and deals come together.",
  },
  {
    id: 'inbox-nav',
    selector: '[data-tour="sidebar-inbox"]',
    position: 'right',
    titleKey: 'onboarding_tour.inbox_nav.title',
    titleFallback: 'Your Inbox',
    textKey: 'onboarding_tour.inbox_nav.text',
    textFallback:
      'Every conversation from every channel you connect — WhatsApp, Instagram, Messenger and more — lands here in real time.',
  },
  {
    id: 'channels',
    selector: '[data-tour="sidebar-channels"]',
    position: 'right',
    titleKey: 'onboarding_tour.channels.title',
    titleFallback: 'Your connected channels',
    textKey: 'onboarding_tour.channels.text',
    textFallback:
      'Channels you connect show up in this list, with a live status dot so you can see at a glance which ones are online.',
  },
  {
    id: 'connect-channel',
    selector: '[data-tour="header-settings"]',
    position: 'bottom',
    titleKey: 'onboarding_tour.connect_channel.title',
    titleFallback: 'Connect your WhatsApp',
    textKey: 'onboarding_tour.connect_channel.text',
    textFallback:
      "Ready to start chatting? Open Settings to connect your WhatsApp Business number (or Instagram, Messenger, email...) in just a couple of clicks.",
  },
  {
    id: 'search',
    selector: '[data-tour="header-search"]',
    position: 'bottom',
    titleKey: 'onboarding_tour.search.title',
    titleFallback: 'Search everything',
    textKey: 'onboarding_tour.search.text',
    textFallback: 'Use this search bar to instantly find conversations, contacts and templates.',
  },
  {
    id: 'contacts-nav',
    selector: '[data-tour="sidebar-contacts"]',
    position: 'right',
    titleKey: 'onboarding_tour.contacts_nav.title',
    titleFallback: 'Contacts',
    textKey: 'onboarding_tour.contacts_nav.text',
    textFallback: 'Every customer profile, along with their history and notes, lives here.',
  },
  {
    id: 'pipeline-nav',
    selector: '[data-tour="sidebar-pipeline"]',
    position: 'right',
    titleKey: 'onboarding_tour.pipeline_nav.title',
    titleFallback: 'Pipeline',
    textKey: 'onboarding_tour.pipeline_nav.text',
    textFallback: 'Track deals as they move through your sales stages, from first contact to close.',
  },
  {
    id: 'tasks-nav',
    selector: '[data-tour="sidebar-tasks"]',
    position: 'right',
    titleKey: 'onboarding_tour.tasks_nav.title',
    titleFallback: 'Tasks',
    textKey: 'onboarding_tour.tasks_nav.text',
    textFallback: 'Create follow-ups and reminders so no conversation ever falls through the cracks.',
  },
  {
    id: 'profile',
    selector: '[data-tour="header-profile"]',
    position: 'left',
    titleKey: 'onboarding_tour.profile.title',
    titleFallback: 'Your account',
    textKey: 'onboarding_tour.profile.text',
    textFallback: 'Manage your profile, company settings, and sign out from here at any time.',
  },
  {
    id: 'finish',
    position: 'bottom',
    titleKey: 'onboarding_tour.finish.title',
    titleFallback: "You're all set! 🎉",
    textKey: 'onboarding_tour.finish.text',
    textFallback:
      'That covers the basics. Connect a channel to start receiving messages — you can always find this tour again from Help & Support.',
  },
];
