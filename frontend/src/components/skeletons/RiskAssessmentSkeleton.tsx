import React from 'react';
import { Skeleton, SkeletonStatCard, SkeletonTableRow } from '@/components/ui/skeleton';

/**
 * Skeleton screen for RiskAssessmentDashboard loading state.
 * Mirrors the layout: header, 4 stat cards, heat-map section, recent assessments table.
 */
export function RiskAssessmentSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      {/* Heat map section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
          <div className="grid grid-cols-2 gap-3 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-md border p-4 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>

        {/* Risk distribution chart placeholder */}
        <div className="rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-48 w-full rounded-md mt-4" />
        </div>
      </div>

      {/* Recent assessments table */}
      <div className="rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <div className="mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonTableRow key={i} cols={5} />
          ))}
        </div>
      </div>
    </div>
  );
}
