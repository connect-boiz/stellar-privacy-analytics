import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Base Skeleton block — a shimmering placeholder for loading content.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-slate-200 dark:bg-obsidian-700',
        className
      )}
      {...props}
    />
  );
}

/** A full card-shaped skeleton matching the project's Card component */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6 space-y-3', className)}>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-3/5" />
      <Skeleton className="h-8 w-1/3 mt-2" />
    </div>
  );
}

/** Stat card skeleton — icon + title + value */
function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-white dark:bg-obsidian-900 shadow-sm p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Table row skeleton */
function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === 0 ? 'w-1/4' : i === cols - 1 ? 'w-1/6' : 'flex-1')}
        />
      ))}
    </div>
  );
}

/** List item skeleton — avatar + two lines of text */
function SkeletonListItem({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 py-3', className)}>
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

/** Progress bar skeleton */
function SkeletonProgress({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-3 w-10" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

export {
  Skeleton,
  SkeletonCard,
  SkeletonStatCard,
  SkeletonTableRow,
  SkeletonListItem,
  SkeletonProgress,
};
