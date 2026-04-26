import { useState, useEffect, useCallback, useRef } from 'react';

export interface TooltipPosition {
  side: 'top' | 'right' | 'bottom' | 'left';
  align: 'start' | 'center' | 'end';
  shouldFlip: boolean;
}

export interface UseResponsiveTooltipOptions {
  preferredSide?: 'top' | 'right' | 'bottom' | 'left';
  preferredAlign?: 'start' | 'center' | 'end';
  offset?: number;
  boundaryPadding?: number;
  flipEnabled?: boolean;
}

export const useResponsiveTooltip = ({
  preferredSide = 'top',
  preferredAlign = 'center',
  offset = 8,
  boundaryPadding = 8,
  flipEnabled = true,
}: UseResponsiveTooltipOptions = {}) => {
  const [position, setPosition] = useState<TooltipPosition>({
    side: preferredSide,
    align: preferredAlign,
    shouldFlip: false,
  });
  
  const triggerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const viewportRef = useRef({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const updateViewport = useCallback(() => {
    viewportRef.current = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }, []);

  useEffect(() => {
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, [updateViewport]);

  const calculateOptimalPosition = useCallback((
    triggerRect: DOMRect,
    contentSize: { width: number; height: number }
  ): TooltipPosition => {
    const { width: viewportWidth, height: viewportHeight } = viewportRef.current;
    
    // Calculate available space for each side
    const space = {
      top: triggerRect.top - boundaryPadding,
      right: viewportWidth - triggerRect.right - boundaryPadding,
      bottom: viewportHeight - triggerRect.bottom - boundaryPadding,
      left: triggerRect.left - boundaryPadding,
    };

    // Determine if we need to flip based on available space
    let optimalSide = preferredSide;
    let shouldFlip = false;

    if (flipEnabled) {
      // Check if preferred side has enough space
      const preferredSpace = space[preferredSide];
      const requiredSpace = preferredSide === 'top' || preferredSide === 'bottom' 
        ? contentSize.height + offset 
        : contentSize.width + offset;

      if (preferredSpace < requiredSpace) {
        // Find the side with most space
        const sides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
        const sortedSides = sides.sort((a, b) => space[b] - space[a]);
        
        for (const side of sortedSides) {
          const sideSpace = space[side];
          const sideRequiredSpace = side === 'top' || side === 'bottom' 
            ? contentSize.height + offset 
            : contentSize.width + offset;
          
          if (sideSpace >= sideRequiredSpace) {
            optimalSide = side;
            shouldFlip = side !== preferredSide;
            break;
          }
        }
      }
    }

    // Calculate optimal alignment
    let optimalAlign = preferredAlign;
    
    if (optimalSide === 'top' || optimalSide === 'bottom') {
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const contentWidth = contentSize.width;
      
      // Check if center alignment would overflow
      if (preferredAlign === 'center') {
        const leftPosition = triggerCenter - contentWidth / 2;
        const rightPosition = triggerCenter + contentWidth / 2;
        
        if (leftPosition < boundaryPadding) {
          optimalAlign = 'start';
        } else if (rightPosition > viewportWidth - boundaryPadding) {
          optimalAlign = 'end';
        }
      }
    } else {
      const triggerCenter = triggerRect.top + triggerRect.height / 2;
      const contentHeight = contentSize.height;
      
      // Check if center alignment would overflow
      if (preferredAlign === 'center') {
        const topPosition = triggerCenter - contentHeight / 2;
        const bottomPosition = triggerCenter + contentHeight / 2;
        
        if (topPosition < boundaryPadding) {
          optimalAlign = 'start';
        } else if (bottomPosition > viewportHeight - boundaryPadding) {
          optimalAlign = 'end';
        }
      }
    }

    return {
      side: optimalSide,
      align: optimalAlign,
      shouldFlip,
    };
  }, [preferredSide, preferredAlign, offset, boundaryPadding, flipEnabled]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !contentRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();
    
    const contentSize = {
      width: contentRect.width,
      height: contentRect.height,
    };

    const newPosition = calculateOptimalPosition(triggerRect, contentSize);
    setPosition(newPosition);
  }, [calculateOptimalPosition]);

  // Debounced resize handler
  const debouncedUpdatePosition = useCallback(() => {
    const timer = setTimeout(updatePosition, 100);
    return () => clearTimeout(timer);
  }, [updatePosition]);

  useEffect(() => {
    if (flipEnabled) {
      const cleanup = debouncedUpdatePosition();
      return cleanup;
    }
  }, [flipEnabled, debouncedUpdatePosition]);

  return {
    position,
    triggerRef,
    contentRef,
    updatePosition,
    calculateOptimalPosition,
  };
};

export default useResponsiveTooltip;
