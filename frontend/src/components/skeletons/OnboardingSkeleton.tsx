import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton screen for OnboardingPage training recommendations loading state.
 * Mirrors the recommended training cards shown after role selection.
 */
export function OnboardingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-48 mb-2" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full ml-3 shrink-0" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
