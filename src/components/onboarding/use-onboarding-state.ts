"use client";

import { useCallback, useEffect, useState } from "react";
import {
  emptyOnboardingLocalState,
  onboardingStorageKey,
  readOnboardingLocalState,
  transitionOnboardingLocalState,
  writeOnboardingLocalState,
  type OnboardingLocalEvent,
  type OnboardingLocalState,
} from "@/lib/onboarding";
import type { UsageProfile } from "@/lib/usage-profile";

const CHANGE_EVENT = "mutano-onboarding-local-change";

export function useOnboardingState(userId: string, profile: UsageProfile) {
  const [state, setState] = useState<OnboardingLocalState>(emptyOnboardingLocalState);

  useEffect(() => {
    const refresh = () => setState(readOnboardingLocalState(window.localStorage, userId));
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [userId]);

  const dispatch = useCallback((event: OnboardingLocalEvent) => {
    const next = transitionOnboardingLocalState(state, event, profile);
    writeOnboardingLocalState(window.localStorage, userId, next);
    setState(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [profile, state, userId]);

  return { state, dispatch, storageKey: onboardingStorageKey(userId) };
}
