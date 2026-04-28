import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

// Animation preferences context
interface AnimationContextValue {
  /** Whether user prefers reduced motion */
  prefersReducedMotion: boolean;
  /** Whether animations are enabled (user preference + system) */
  animationsEnabled: boolean;
  /** Animation speed multiplier (0.5 = slower, 2 = faster) */
  animationSpeed: number;
  /** Whether device supports GPU acceleration */
  hasGpuAcceleration: boolean;
  /** Set user animation preference */
  setAnimationsEnabled: (enabled: boolean) => void;
  /** Set animation speed */
  setAnimationSpeed: (speed: number) => void;
  /** Get optimized animation props */
  getAnimationProps: (baseProps: AnimationProps) => OptimizedAnimationProps;
  /** Report animation performance issue */
  reportPerformanceIssue: (animationId: string, metrics: AnimationMetrics) => void;
}

const AnimationContext = createContext<AnimationContextValue | null>(null);

export function useAnimationContext() {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useAnimationContext must be used within AnimationProvider');
  }
  return context;
}

// Animation props interface
export interface AnimationProps {
  duration?: number;
  delay?: number;
  easing?: string;
  transform?: string;
  opacity?: number;
  scale?: number;
  rotate?: number;
  translateX?: number | string;
  translateY?: number | string;
}

export interface OptimizedAnimationProps {
  style: React.CSSProperties;
  transition: string;
  willChange: string;
  transform: string;
  animationDuration: string;
  animationTimingFunction: string;
  shouldAnimate: boolean;
}

export interface AnimationMetrics {
  fps: number;
  frameTime: number;
  droppedFrames: number;
}

// Storage key for preferences
const PREFERENCES_KEY = 'animation-preferences';

interface StoredPreferences {
  enabled: boolean;
  speed: number;
}

// Detect GPU acceleration support
function detectGpuAcceleration(): boolean {
  if (typeof window === 'undefined') return true;
  
  // Check for hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 4;
  
  // Check device memory (if available)
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  
  // Check for touch device (often indicates mobile)
  const isTouchDevice = 'ontouchstart' in window;
  
  // Check for low-power mode indicators
  const isLowPower = cores <= 2 || memory <= 2;
  
  // Check for CSS transform3d support
  const hasTransform3d = 'WebKitCSSMatrix' in window && 
    'webkitTransform' in document.documentElement.style;
  
  // If device is low-power but has transform3d, still allow animations
  // but they'll be simplified
  return hasTransform3d && !isLowPower;
}

// Check for reduced motion preference
function checkReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Animation Provider Component
export interface AnimationProviderProps {
  children: React.ReactNode;
  /** Default animation speed multiplier */
  defaultSpeed?: number;
  /** Force disable animations */
  forceDisable?: boolean;
  /** Performance threshold (fps) below which animations are disabled */
  performanceThreshold?: number;
}

export function AnimationProvider({
  children,
  defaultSpeed = 1,
  forceDisable = false,
  performanceThreshold = 30
}: AnimationProviderProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(checkReducedMotion);
  const [userEnabled, setUserEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const prefs: StoredPreferences = JSON.parse(stored);
        return prefs.enabled;
      }
    } catch {}
    return true;
  });
  const [animationSpeed, setAnimationSpeed] = useState(() => {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const prefs: StoredPreferences = JSON.parse(stored);
        return prefs.speed || defaultSpeed;
      }
    } catch {}
    return defaultSpeed;
  });
  const [hasGpuAcceleration] = useState(detectGpuAcceleration);
  const [performanceIssues, setPerformanceIssues] = useState<Map<string, AnimationMetrics>>(new Map());

  // Listen for reduced motion preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    const prefs: StoredPreferences = {
      enabled: userEnabled,
      speed: animationSpeed
    };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  }, [userEnabled, animationSpeed]);

  // Auto-disable animations if too many performance issues
  useEffect(() => {
    if (performanceIssues.size >= 3) {
      const avgFps = Array.from(performanceIssues.values())
        .reduce((sum, m) => sum + m.fps, 0) / performanceIssues.size;
      
      if (avgFps < performanceThreshold) {
        console.warn('Animations auto-disabled due to poor performance');
        setUserEnabled(false);
        setPerformanceIssues(new Map());
      }
    }
  }, [performanceIssues, performanceThreshold]);

  const animationsEnabled = userEnabled && !prefersReducedMotion && !forceDisable;

  const setAnimationsEnabled = useCallback((enabled: boolean) => {
    setUserEnabled(enabled);
  }, []);

  const setAnimationSpeedWithClamp = useCallback((speed: number) => {
    // Clamp speed between 0.25x and 4x
    setAnimationSpeed(Math.max(0.25, Math.min(4, speed)));
  }, []);

  const getAnimationProps = useCallback((baseProps: AnimationProps): OptimizedAnimationProps => {
    const shouldAnimate = animationsEnabled && hasGpuAcceleration;
    
    if (!shouldAnimate) {
      // Return static props for no animation
      return {
        style: {
          transform: 'none',
          opacity: baseProps.opacity ?? 1,
          transition: 'none'
        },
        transition: 'none',
        willChange: 'auto',
        transform: 'none',
        animationDuration: '0s',
        animationTimingFunction: 'linear',
        shouldAnimate: false
      };
    }

    // Build transform string
    const transforms: string[] = [];
    
    if (baseProps.scale !== undefined && baseProps.scale !== 1) {
      transforms.push(`scale(${baseProps.scale})`);
    }
    if (baseProps.rotate !== undefined && baseProps.rotate !== 0) {
      transforms.push(`rotate(${baseProps.rotate}deg)`);
    }
    if (baseProps.translateX !== undefined) {
      const x = typeof baseProps.translateX === 'number' 
        ? `${baseProps.translateX}px` 
        : baseProps.translateX;
      transforms.push(`translateX(${x})`);
    }
    if (baseProps.translateY !== undefined) {
      const y = typeof baseProps.translateY === 'number' 
        ? `${baseProps.translateY}px` 
        : baseProps.translateY;
      transforms.push(`translateY(${y})`);
    }
    if (baseProps.transform) {
      transforms.push(baseProps.transform);
    }

    const transform = transforms.length > 0 ? transforms.join(' ') : 'none';
    
    // Calculate duration with speed multiplier
    const duration = (baseProps.duration ?? 300) / animationSpeed;
    const delay = (baseProps.delay ?? 0) / animationSpeed;
    const easing = baseProps.easing ?? 'cubic-bezier(0.4, 0, 0.2, 1)';

    // Determine will-change for GPU acceleration hint
    const willChangeParts: string[] = [];
    if (transforms.length > 0) willChangeParts.push('transform');
    if (baseProps.opacity !== undefined) willChangeParts.push('opacity');
    const willChange = willChangeParts.length > 0 ? willChangeParts.join(', ') : 'auto';

    const transition = shouldAnimate
      ? `transform ${duration}ms ${easing} ${delay}ms${baseProps.opacity !== undefined ? `, opacity ${duration}ms ${easing} ${delay}ms` : ''}`
      : 'none';

    return {
      style: {
        transform,
        opacity: baseProps.opacity,
        transition,
        willChange
      },
      transition,
      willChange,
      transform,
      animationDuration: `${duration}ms`,
      animationTimingFunction: easing,
      shouldAnimate: true
    };
  }, [animationsEnabled, hasGpuAcceleration, animationSpeed]);

  const reportPerformanceIssue = useCallback((animationId: string, metrics: AnimationMetrics) => {
    setPerformanceIssues(prev => {
      const next = new Map(prev);
      next.set(animationId, metrics);
      // Keep only last 10 issues
      if (next.size > 10) {
        const firstKey = next.keys().next().value;
        if (firstKey) next.delete(firstKey);
      }
      return next;
    });
  }, []);

  const value: AnimationContextValue = {
    prefersReducedMotion,
    animationsEnabled,
    animationSpeed,
    hasGpuAcceleration,
    setAnimationsEnabled,
    setAnimationSpeed: setAnimationSpeedWithClamp,
    getAnimationProps,
    reportPerformanceIssue
  };

  return (
    <AnimationContext.Provider value={value}>
      {children}
    </AnimationContext.Provider>
  );
}

// Hook for animated components
export function useAnimatedTransition(
  isVisible: boolean,
  options: {
    duration?: number;
    enterDelay?: number;
    exitDelay?: number;
    easing?: string;
    onEnter?: () => void;
    onExit?: () => void;
  } = {}
) {
  const {
    duration = 300,
    enterDelay = 0,
    exitDelay = 0,
    easing = 'cubic-bezier(0.4, 0, 0.2, 1)',
    onEnter,
    onExit
  } = options;

  const { animationsEnabled, animationSpeed, getAnimationProps } = useAnimationContext();
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isAnimating, setIsAnimating] = useState(false);

  const adjustedDuration = duration / animationSpeed;
  const adjustedEnterDelay = enterDelay / animationSpeed;
  const adjustedExitDelay = exitDelay / animationSpeed;

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setIsAnimating(true);
      onEnter?.();
    } else {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsAnimating(false);
        onExit?.();
      }, adjustedDuration + adjustedExitDelay);
      return () => clearTimeout(timer);
    }
  }, [isVisible, adjustedDuration, adjustedExitDelay, onEnter, onExit]);

  const animationProps = getAnimationProps({
    duration: adjustedDuration,
    delay: isVisible ? adjustedEnterDelay : adjustedExitDelay,
    easing,
    opacity: isVisible ? 1 : 0,
    scale: isVisible ? 1 : 0.95
  });

  return {
    shouldRender,
    isAnimating,
    animationProps,
    isReducedMotion: !animationsEnabled
  };
}

// Hook for animation performance monitoring
export function useAnimationPerformance(animationId: string) {
  const { reportPerformanceIssue, animationsEnabled } = useAnimationContext();
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  const startMonitoring = useCallback(() => {
    if (!animationsEnabled) return;

    let lastTime = performance.now();
    
    const measureFrame = (currentTime: number) => {
      const frameTime = currentTime - lastTime;
      frameTimesRef.current.push(frameTime);
      lastTime = currentTime;
      
      // Keep only last 60 frames
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }
      
      animationFrameRef.current = requestAnimationFrame(measureFrame);
    };
    
    animationFrameRef.current = requestAnimationFrame(measureFrame);
  }, [animationsEnabled]);

  const stopMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Calculate metrics
    const frameTimes = frameTimesRef.current;
    if (frameTimes.length > 0) {
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const fps = 1000 / avgFrameTime;
      const droppedFrames = frameTimes.filter(t => t > 33).length; // > 30fps threshold
      
      if (fps < 30 || droppedFrames > 10) {
        reportPerformanceIssue(animationId, {
          fps,
          frameTime: avgFrameTime,
          droppedFrames
        });
      }
    }
    
    frameTimesRef.current = [];
  }, [animationId, reportPerformanceIssue]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return { startMonitoring, stopMonitoring };
}

// Hook for staggered animations
export function useStaggeredAnimation(
  itemCount: number,
  options: {
    staggerDelay?: number;
    duration?: number;
    easing?: string;
  } = {}
) {
  const { staggerDelay = 50, duration = 300, easing } = options;
  const { animationsEnabled, animationSpeed, getAnimationProps } = useAnimationContext();

  const getStaggeredProps = useCallback((index: number) => {
    const delay = (index * staggerDelay) / animationSpeed;
    return getAnimationProps({
      duration,
      delay,
      easing,
      opacity: 1,
      translateY: 0
    });
  }, [staggerDelay, duration, easing, animationSpeed, getAnimationProps]);

  return {
    getStaggeredProps,
    totalDuration: (duration + (itemCount - 1) * staggerDelay) / animationSpeed,
    isReducedMotion: !animationsEnabled
  };
}

export default useAnimationContext;
