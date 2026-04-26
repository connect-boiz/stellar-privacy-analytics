import React, { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Modal context for managing nested modals
interface ModalContextValue {
  modalCount: number;
  addModal: () => void;
  removeModal: () => void;
}

const ModalContext = createContext<ModalContextValue>({
  modalCount: 0,
  addModal: () => {},
  removeModal: () => {}
});

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalCount, setModalCount] = useState(0);

  const addModal = useCallback(() => {
    setModalCount(prev => prev + 1);
  }, []);

  const removeModal = useCallback(() => {
    setModalCount(prev => Math.max(0, prev - 1));
  }, []);

  return (
    <ModalContext.Provider value={{ modalCount, addModal, removeModal }}>
      {children}
    </ModalContext.Provider>
  );
};

const useModalContext = () => useContext(ModalContext);

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  finalFocusRef?: React.RefObject<HTMLElement>;
  className?: string;
  overlayClassName?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

// Focus trap hook
function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isActive) {
      // Store the currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [isActive]);

  const restoreFocus = useCallback(() => {
    if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      // Use requestAnimationFrame to ensure focus restoration happens after React's cleanup
      requestAnimationFrame(() => {
        previousFocusRef.current?.focus();
      });
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Tab key handling for focus trap
    if (event.key === 'Tab') {
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, handleKeyDown]);

  return { containerRef, restoreFocus };
}

// Screen reader announcement component
interface LiveAnnouncerProps {
  message: string;
  assertive?: boolean;
}

const LiveAnnouncer: React.FC<LiveAnnouncerProps> = ({ message, assertive = false }) => (
  <div
    role="status"
    aria-live={assertive ? 'assertive' : 'polite'}
    aria-atomic="true"
    className="sr-only"
    style={{
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: 0,
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: 0
    }}
  >
    {message}
  </div>
);

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  initialFocusRef,
  finalFocusRef,
  className = '',
  overlayClassName = '',
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy
}) => {
  const { addModal, removeModal } = useModalContext();
  const { containerRef, restoreFocus } = useFocusTrap(isOpen);
  const titleId = useRef(`modal-title-${Math.random().toString(36).substr(2, 9)}`);
  const descriptionId = useRef(`modal-description-${Math.random().toString(36).substr(2, 9)}`);
  const [announcement, setAnnouncement] = useState('');

  // Register/unregister modal with context
  useEffect(() => {
    if (isOpen) {
      addModal();
      setAnnouncement(`${title || 'Dialog'} opened`);
    }
    return () => {
      if (isOpen) {
        removeModal();
      }
    };
  }, [isOpen, addModal, removeModal, title]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Handle initial focus
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const focusElement = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        // Focus the first focusable element or the container
        const container = containerRef.current;
        const firstFocusable = container?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          // Focus the container itself as fallback
          container?.focus();
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(focusElement, 50);
    return () => clearTimeout(timeoutId);
  }, [isOpen, initialFocusRef]);

  // Handle focus restoration on close
  useEffect(() => {
    if (!isOpen) {
      if (finalFocusRef?.current) {
        finalFocusRef.current.focus();
      } else {
        restoreFocus();
      }
      setAnnouncement('Dialog closed');
    }
  }, [isOpen, finalFocusRef, restoreFocus]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl'
  };

  const labelledBy = ariaLabelledBy || (title ? titleId.current : undefined);
  const describedBy = ariaDescribedBy || (description ? descriptionId.current : undefined);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Screen reader announcements */}
          <LiveAnnouncer message={announcement} />

          {/* Overlay */}
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClassName}`}
            onClick={handleOverlayClick}
            role="presentation"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black bg-opacity-50"
              aria-hidden="true"
            />

            {/* Modal dialog */}
            <motion.div
              ref={containerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              aria-describedby={describedBy}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className={`relative bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} ${className}`}
              tabIndex={-1}
            >
              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  {title && (
                    <h2
                      id={titleId.current}
                      className="text-lg font-semibold text-gray-900"
                    >
                      {title}
                    </h2>
                  )}
                  {showCloseButton && (
                    <button
                      onClick={onClose}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label="Close dialog"
                      type="button"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}

              {/* Description */}
              {description && (
                <p
                  id={descriptionId.current}
                  className="px-4 pt-4 text-sm text-gray-600"
                >
                  {description}
                </p>
              )}

              {/* Content */}
              <div className="p-4">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// Confirmation Dialog variant
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger' | 'warning';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const variantClasses = {
    default: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      initialFocusRef={confirmButtonRef}
    >
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmButtonRef}
          onClick={onConfirm}
          disabled={isLoading}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${variantClasses[variant]}`}
        >
          {isLoading ? 'Loading...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

// Alert Dialog variant
interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  buttonLabel?: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  onClose,
  title,
  message,
  buttonLabel = 'OK',
  variant = 'default'
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const variantClasses = {
    default: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    success: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
    error: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      initialFocusRef={buttonRef}
    >
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end">
        <button
          ref={buttonRef}
          onClick={onClose}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantClasses[variant]}`}
        >
          {buttonLabel}
        </button>
      </div>
    </Modal>
  );
};

export default Modal;
