"use client";

import { PROFILE_OPTIONS, type UsageProfile } from "@/lib/usage-profile";

export function UsageProfileFields({ defaultValue }: { defaultValue: UsageProfile }) {
  return <fieldset className="space-y-3">
    <legend className="mb-2 text-sm font-semibold">Como você quer usar o app?</legend>
    {PROFILE_OPTIONS.map((option) => <label key={option.value} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line-strong)] p-3 has-[:checked]:border-[var(--acento)] has-[:checked]:bg-[var(--surface-2)]">
      <input className="mt-1 size-4 shrink-0 accent-[var(--acento)]" type="radio" name="usageProfile" value={option.value} defaultChecked={defaultValue === option.value} required />
      <span><span className="block text-sm font-medium">{option.label}</span><span className="mt-1 block text-sm text-[var(--text-muted)]">{option.description}</span></span>
    </label>)}
  </fieldset>;
}
