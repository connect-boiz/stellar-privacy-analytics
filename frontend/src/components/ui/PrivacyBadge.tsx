import React from 'react';
import { Shield, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility to merge tailwind classes
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type PrivacyLevel = 'public' | 'protected' | 'private' | 'secret';

interface PrivacyBadgeProps {
  level: PrivacyLevel;
  className?: string;
}

const levelConfig: Record<PrivacyLevel, { 
  label: string; 
  icon: React.ElementType; 
  baseClass: string;
  dotClass: string;
}> = {
  public: {
    label: 'Public',
    icon: ShieldOff,
    baseClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
    dotClass: 'bg-green-500'
  },
  protected: {
    label: 'Protected',
    icon: ShieldCheck,
    baseClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    dotClass: 'bg-blue-500'
  },
  private: {
    label: 'Private',
    icon: Shield,
    baseClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    dotClass: 'bg-orange-500'
  },
  secret: {
    label: 'Secret',
    icon: ShieldAlert,
    baseClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    dotClass: 'bg-red-500'
  }
};

export const PrivacyBadge: React.FC<PrivacyBadgeProps> = ({ level, className }) => {
  const config = levelConfig[level];
  const Icon = config.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all hover:scale-105 cursor-default",
      config.baseClass,
      className
    )}>
      <Icon size={12} strokeWidth={2.5} />
      <span>{config.label}</span>
      <span className={cn("ml-1 w-1.5 h-1.5 rounded-full animate-pulse", config.dotClass)} />
    </div>
  );
};
