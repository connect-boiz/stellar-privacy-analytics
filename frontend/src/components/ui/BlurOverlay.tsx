import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BlurOverlayProps {
  children: React.ReactNode;
  isSensitive?: boolean;
  className?: string;
  label?: string;
}

export const BlurOverlay: React.FC<BlurOverlayProps> = ({ 
  children, 
  isSensitive = true, 
  className,
  label = "Sensitive Content"
}) => {
  const [isRevealed, setIsRevealed] = useState(!isSensitive);

  if (!isSensitive) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative group isolation-auto", className)}>
      <div className={cn(
        "transition-all duration-500",
        !isRevealed ? "blur-md select-none pointer-events-none opacity-50 contrast-50 grayscale" : "blur-0"
      )}>
        {children}
      </div>

      {!isRevealed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/5 dark:bg-white/5 rounded-lg group-hover:bg-black/10 transition-colors">
          <div className="p-3 bg-white/80 dark:bg-obsidian-800/80 backdrop-blur-md rounded-full shadow-lg border border-white/20 mb-2">
            <Lock className="w-5 h-5 text-gray-700 dark:text-cyber-blue" strokeWidth={2.5} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-4">{label}</span>
          <button 
            onClick={() => setIsRevealed(true)}
            className="px-4 py-1.5 bg-cyber-blue text-black rounded-full font-bold text-[10px] uppercase tracking-wider hover:opacity-80 transition-all flex items-center gap-2 group-hover:scale-110 active:scale-95"
          >
            <Eye className="w-3.5 h-3.5" />
            Reveal Data
          </button>
        </div>
      )}

      {isRevealed && (
        <button 
          onClick={() => setIsRevealed(false)}
          className="absolute top-2 right-2 p-1.5 bg-gray-100 dark:bg-obsidian-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
          title="Re-hide sensitive data"
        >
          <EyeOff size={14} />
        </button>
      )}
    </div>
  );
};
