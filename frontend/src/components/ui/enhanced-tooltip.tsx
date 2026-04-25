import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useResponsiveTooltip } from '../../hooks/useResponsiveTooltip';
import { cn } from '../../lib/utils';

export interface EnhancedTooltipProps {
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
  /** Accessibility label for screen readers */
  ariaLabel?: string;
  /** Whether tooltip should be keyboard accessible */
  keyboardAccessible?: boolean;
  /** Custom tooltip ID for accessibility */
  tooltipId?: string;
  /** Whether to show tooltip on focus */
  showOnFocus?: boolean;
  /** Performance optimization - disable animations */
  disableAnimations?: boolean;
}

const EnhancedTooltipProvider = TooltipPrimitive.Provider;

const EnhancedTooltipRoot = TooltipPrimitive.Root;

const EnhancedTooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> & {
    keyboardAccessible?: boolean;
    showOnFocus?: boolean;
  }
>(({ keyboardAccessible = true, showOnFocus = true, ...props }, ref) => {
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (keyboardAccessible && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      // Trigger tooltip on Enter/Space for keyboard users
    }
  }, [keyboardAccessible]);

  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
EnhancedTooltipTrigger.displayName = 'EnhancedTooltipTrigger';

const EnhancedTooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    maxWidth?: number;
    truncate?: boolean;
    maxLines?: number;
    variant?: 'default' | 'info' | 'warning' | 'error' | 'success';
    disableAnimations?: boolean;
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
      disableAnimations = false,
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

    const animationClasses = disableAnimations ? '' : 'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95';

    return (
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'relative z-50 px-3 py-2 text-sm rounded-lg border shadow-lg',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
          animationClasses,
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
EnhancedTooltipContent.displayName = 'EnhancedTooltipContent';

const EnhancedTooltip = React.forwardRef<HTMLDivElement, EnhancedTooltipProps>(
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
      ariaLabel,
      keyboardAccessible = true,
      tooltipId,
      showOnFocus = true,
      disableAnimations = false,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isTouch, setIsTouch] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout>();
    const generatedId = useRef(tooltipId || `tooltip-${Math.random().toString(36).substr(2, 9)}`);

    const {
      position,
      triggerRef,
      contentRef,
      updatePosition,
    } = useResponsiveTooltip({
      preferredSide: side,
      preferredAlign: align,
      flipEnabled: true,
    });

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
        // Update position when tooltip opens
        setTimeout(updatePosition, 0);
      } else {
        timeoutRef.current = setTimeout(() => {
          setIsOpen(false);
        }, hideDelay);
      }
    }, [disabled, hideDelay, updatePosition]);

    const handleClick = useCallback((event: React.MouseEvent) => {
      if (isTouch && persistOnClick) {
        event.preventDefault();
        handleOpenChange(!isOpen);
      }
    }, [isTouch, persistOnClick, isOpen, handleOpenChange]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
      if (keyboardAccessible && (event.key === 'Escape' && isOpen)) {
        handleOpenChange(false);
      }
    }, [keyboardAccessible, isOpen, handleOpenChange]);

    if (disabled) {
      return <>{children}</>;
    }

    const triggerElement = React.Children.only(children) as React.ReactElement;
    const enhancedTrigger = React.cloneElement(triggerElement, {
      ref: triggerRef,
      'aria-describedby': isOpen ? generatedId.current : undefined,
      'aria-label': ariaLabel || triggerElement.props['aria-label'],
      tabIndex: keyboardAccessible ? (triggerElement.props.tabIndex ?? 0) : triggerElement.props.tabIndex,
      ...triggerElement.props,
    });

    return (
      <EnhancedTooltipProvider delayDuration={delayDuration}>
        <EnhancedTooltipRoot 
          open={isOpen} 
          onOpenChange={handleOpenChange}
          delayDuration={delayDuration}
        >
          <EnhancedTooltipTrigger
            asChild
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            keyboardAccessible={keyboardAccessible}
            showOnFocus={showOnFocus}
          >
            {enhancedTrigger}
          </EnhancedTooltipTrigger>
          <TooltipPrimitive.Portal>
            <EnhancedTooltipContent
              ref={contentRef}
              side={position.side}
              align={position.align}
              maxWidth={maxWidth}
              truncate={truncate}
              maxLines={maxLines}
              variant={variant}
              disableAnimations={disableAnimations}
              className={className}
              id={generatedId.current}
              role="tooltip"
              {...props}
            >
              {content}
            </EnhancedTooltipContent>
          </TooltipPrimitive.Portal>
        </EnhancedTooltipRoot>
      </EnhancedTooltipProvider>
    );
  }
);
EnhancedTooltip.displayName = 'EnhancedTooltip';

export { 
  EnhancedTooltip as Tooltip, 
  EnhancedTooltipProvider as TooltipProvider,
  EnhancedTooltipRoot as TooltipRoot,
  EnhancedTooltipTrigger as TooltipTrigger,
  EnhancedTooltipContent as TooltipContent
};
