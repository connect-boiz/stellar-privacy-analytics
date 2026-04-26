import React from 'react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ScanningEffectProps {
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const ScanningEffect: React.FC<ScanningEffectProps> = ({ 
  isLoading = true, 
  className, 
  children 
}) => {
  return (
    <div className={cn("relative overflow-hidden group rounded-xl bg-slate-100 dark:bg-obsidian-900 isolation-auto", className)}>
      {/* Background scan overlay */}
      {isLoading && (
        <>
          <motion.div
            initial={{ top: '0%' }}
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            className="absolute left-0 right-0 h-[2px] bg-cyber-blue shadow-[0_0_15px_#00F0FF,0_0_5px_rgba(0,240,255,1)] z-10 pointer-events-none opacity-80"
          />
          <motion.div
            initial={{ opacity: 0.1 }}
            animate={{ opacity: [0.05, 0.2, 0.05] }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute inset-0 bg-cyber-blue/5 pointer-events-none z-0"
          />
          {/* Faint Grid lines */}
          <div 
            className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none z-0 opacity-30"
          />
        </>
      )}

      <div className={cn("relative z-1", isLoading && "opacity-80 transition-opacity")}>
        {children}
      </div>
    </div>
  );
};
