"use client";

import { createContext, useContext } from "react";
import type { UsageProfile } from "@/lib/usage-profile";

const ProfileContext = createContext<UsageProfile>("hibrido");
export function UsageProfileProvider({ profile, children }: { profile: UsageProfile; children?: React.ReactNode }) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}
export function useUsageProfile() { return useContext(ProfileContext); }
