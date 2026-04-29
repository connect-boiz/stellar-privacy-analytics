import React from 'react';
import { Skeleton, SkeletonStatCard, SkeletonTableRow } from '@/components/ui/skeleton';

/**
 * Skeleton screen for TrainingAdminPage loading state.
 * Mirrors: header, overall analytics cards, tabs, modules table.
 */
export function TrainingAdminSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Overall analytics cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      {/* Modules table */}
      <div className="rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        {/* Table header */}
        <div className="flex items-center gap-4 py-2 border-b">
          {['Title', 'Category', 'Difficulty', 'Enrollments', 'Pass Rate', 'Actions'].map((col) => (
            <Skeleton key={col} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonTableRow key={i} cols={6} />
        ))}
      </div>
    </div>
  );
}
