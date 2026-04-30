import React from 'react';
import { Skeleton, SkeletonProgress } from '@/components/ui/skeleton';

/**
 * Skeleton screen for TrainingModulePage loading state.
 * Mirrors: back button, module header, sidebar navigation, content area.
 */
export function TrainingModuleSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b px-6 py-4 flex items-center gap-4">
        <Skeleton className="h-9 w-24 rounded-md" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-72 border-r min-h-screen p-4 space-y-3 shrink-0">
          <Skeleton className="h-4 w-24 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-md">
              <Skeleton className="h-6 w-6 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
          <div className="pt-4 border-t space-y-2">
            <Skeleton className="h-4 w-28" />
            <SkeletonProgress />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>

          {/* Content block */}
          <Skeleton className="h-56 w-full rounded-lg" />

          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between pt-4">
            <Skeleton className="h-10 w-28 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </main>
      </div>
    </div>
  );
}
