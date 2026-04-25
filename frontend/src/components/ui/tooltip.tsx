import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

export interface TooltipProps {
  /** Tooltip content */
  content: React.ReactNode;
  /** Tooltip trigger element */
  children: React.ReactNode;
  /** Tooltip side preference */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Tooltip alignment */
  align?: 'start' | 'center' | 'end';
  /** Delay before showing tooltip (ms) */
  delayDuration?: number;
  /** Delay before hiding tooltip (ms) */
  hideDelay?: number;
  /** Whether tooltip is disabled */
  disabled?: boolean;
  /** Maximum width of tooltip */
  maxWidth?: number;
  /** Whether to truncate long content */
  truncate?: boolean;
  /** Maximum lines before truncation */
  maxLines?: number;
  /** Custom tooltip variant */
  variant?: 'default' | 'info' | 'warning' | 'error' | 'success';
  /** Whether tooltip should stay open on click (touch devices) */
  persistOnClick?: boolean;
  /** Custom className for tooltip content */
  className?: string;
  /** Custom className for arrow */
  arrowClassName?: string;
}

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipPortal = TooltipPrimitive.Portal;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    maxWidth?: number;
    truncate?: boolean;
    maxLines?: number;
    variant?: 'default' | 'info' | 'warning' | 'error' | 'success';
  }
>(
  (
    {
      className,
      sideOffset = 8,
      maxWidth = 300,
      truncate = true,
      maxLines = 3,
      variant = 'default',
      children,
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      default: 'bg-gray-900 text-white border-gray-700',
      info: 'bg-blue-600 text-white border-blue-500',
      warning: 'bg-yellow-600 text-white border-yellow-500',
      error: 'bg-red-600 text-white border-red-500',
      success: 'bg-green-600 text-white border-green-500'
    };

    return (
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'relative z-50 px-3 py-2 text-sm rounded-lg border shadow-lg',
          'animate-in fade-in-0 zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=top]:slide-in-from-bottom-2',
          'data-[side=right]:slide-in-from-left-2',
          'data-[side=bottom]:slide-in-from-top-2',
          'data-[side=left]:slide-in-from-right-2',
          variantStyles[variant],
          className
        )}
        style={{
          maxWidth: `${maxWidth}px`,
          wordWrap: 'break-word',
          overflow: truncate ? 'hidden' : 'visible',
          display: truncate ? '-webkit-box' : 'block',
          WebkitLineClamp: truncate ? maxLines : 'unset',
          WebkitBoxOrient: truncate ? 'vertical' : 'unset',
        }}
        {...props}
      >
        <div className="relative">
          {children}
          <TooltipPrimitive.Arrow className="fill-current" />
        </div>
      </TooltipPrimitive.Content>
    );
  }
);
TooltipContent.displayName = TooltipContent.name;

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  (
    {
      content,
      children,
      side = 'top',
      align = 'center',
      delayDuration = 400,
      hideDelay = 100,
      disabled = false,
      maxWidth = 300,
      truncate = true,
      maxLines = 3,
      variant = 'default',
      persistOnClick = true,
      className,
      arrowClassName,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isTouch, setIsTouch] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
      const checkTouch = () => {
        setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
      };
      
      checkTouch();
      window.addEventListener('resize', checkTouch);
      return () => window.removeEventListener('resize', checkTouch);
    }, []);

    const handleOpenChange = useCallback((open: boolean) => {
      if (disabled) return;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (open) {
        setIsOpen(true);
      } else {
        timeoutRef.current = setTimeout(() => {
          setIsOpen(false);
        }, hideDelay);
      }
    }, [disabled, hideDelay]);

    const handleClick = useCallback((event: React.MouseEvent) => {
      if (isTouch && persistOnClick) {
        event.preventDefault();
        handleOpenChange(!isOpen);
      }
    }, [isTouch, persistOnClick, isOpen, handleOpenChange]);

    if (disabled) {
      return <>{children}</>;
    }

    return (
      <TooltipProvider delayDuration={delayDuration}>
        <TooltipRoot open={isOpen} onOpenChange={handleOpenChange}>
          <TooltipTrigger asChild onClick={handleClick}>
            {children}
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              ref={ref}
              side={side}
              align={align}
              maxWidth={maxWidth}
              truncate={truncate}
              maxLines={maxLines}
              variant={variant}
              className={className}
              {...props}
            >
              {content}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </TooltipProvider>
    );
  }
);
Tooltip.displayName = 'Tooltip';

export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent };
