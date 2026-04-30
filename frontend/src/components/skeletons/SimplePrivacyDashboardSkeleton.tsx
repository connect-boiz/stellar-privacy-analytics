import React from 'react';
import { Skeleton, SkeletonStatCard, SkeletonProgress } from '@/components/ui/skeleton';

/**
 * Skeleton screen for SimplePrivacyDashboard (PrivacyHealthDashboard) loading state.
 * Mirrors: header, privacy score card, epsilon budget, stat cards, grants list.
 */
export function SimplePrivacyDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {['Overview', 'Grants', 'Analysis'].map((tab) => (
          <Skeleton key={tab} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      {/* Top row: privacy score + epsilon budget */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Privacy score card */}
        <div className="rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="flex items-center justify-center py-4">
            <Skeleton className="h-24 w-24 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>

        {/* Epsilon budget card */}
        <div className="md:col-span-2 rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <SkeletonProgress />
          <div className="grid grid-cols-3 gap-4 mt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Data grants list */}
      <div className="rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <SkeletonProgress />
            <div className="flex gap-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
