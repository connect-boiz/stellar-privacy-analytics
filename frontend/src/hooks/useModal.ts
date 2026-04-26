import { useState, useCallback, useEffect, useRef } from 'react';

interface UseModalOptions {
  onClose?: () => void;
  onOpen?: () => void;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  finalFocusRef?: React.RefObject<HTMLElement>;
}

interface UseModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  modalProps: {
    isOpen: boolean;
    onClose: () => void;
    closeOnEscape: boolean;
    closeOnOverlayClick: boolean;
    initialFocusRef?: React.RefObject<HTMLElement>;
    finalFocusRef?: React.RefObject<HTMLElement>;
  };
}

export function useModal(options: UseModalOptions = {}): UseModalReturn {
  const {
    onClose,
    onOpen,
    closeOnEscape = true,
    closeOnOverlayClick = true,
    initialFocusRef,
    finalFocusRef
  } = options;

  const [isOpen, setIsOpen] = useState(false);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    // Store the currently focused element before opening
    previousActiveElement.current = document.activeElement as HTMLElement;
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  return {
    isOpen,
    open,
    close,
    toggle,
    modalProps: {
      isOpen,
      onClose: close,
      closeOnEscape,
      closeOnOverlayClick,
      initialFocusRef,
      finalFocusRef
    }
  };
}

// Hook for managing multiple modals
interface ModalStackItem {
  id: string;
  props: Record<string, unknown>;
}

interface UseModalStackReturn {
  stack: ModalStackItem[];
  push: (id: string, props?: Record<string, unknown>) => void;
  pop: () => void;
  clear: () => void;
  top: ModalStackItem | null;
  count: number;
}

export function useModalStack(): UseModalStackReturn {
  const [stack, setStack] = useState<ModalStackItem[]>([]);

  const push = useCallback((id: string, props: Record<string, unknown> = {}) => {
    setStack(prev => [...prev, { id, props }]);
  }, []);

  const pop = useCallback(() => {
    setStack(prev => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setStack([]);
  }, []);

  return {
    stack,
    push,
    pop,
    clear,
    top: stack[stack.length - 1] || null,
    count: stack.length
  };
}

// Hook for announcing to screen readers
export function useAnnouncer() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const element = document.createElement('div');
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', priority);
    element.setAttribute('aria-atomic', 'true');
    element.className = 'sr-only';
    element.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    document.body.appendChild(element);
    
    // Set the message after a small delay to ensure the screen reader picks it up
    setTimeout(() => {
      element.textContent = message;
    }, 100);

    // Remove the element after announcement
    setTimeout(() => {
      document.body.removeChild(element);
    }, 1000);
  }, []);

  return { announce };
}

export default useModal;
