import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  AlertCircle, 
  Save, 
  RotateCcw,
  Clock,
  Info
} from 'lucide-react';
import { Modal } from '../ui/Modal';

// Types
export interface StepConfig<T> {
  id: string;
  title: string;
  description?: string;
  isOptional?: boolean;
  validate?: (values: T) => Record<string, string> | null;
  canSkip?: (values: T) => boolean;
}

export interface MultiStepFormProps<T extends Record<string, unknown>> {
  /** Form steps configuration */
  steps: StepConfig<T>[];
  /** Current form values */
  values: T;
  /** Update form values */
  onChange: (values: T) => void;
  /** Form validation errors */
  errors?: Record<string, string>;
  /** Update errors */
  onErrorsChange?: (errors: Record<string, string>) => void;
  /** Current step index (0-based) */
  currentStep?: number;
  /** Callback when step changes */
  onStepChange?: (step: number) => void;
  /** Submit handler */
  onSubmit: (values: T) => void | Promise<void>;
  /** Cancel handler */
  onCancel?: () => void;
  /** Auto-save state */
  isSaving?: boolean;
  lastSavedAt?: Date | null;
  /** Whether form was recovered */
  wasRecovered?: boolean;
  /** Recovery data for abandoned forms */
  recoveryData?: { savedAt: Date; step: number } | null;
  /** Clear recovery data */
  onClearRecovery?: () => void;
  /** Whether form is read-only */
  readOnly?: boolean;
  /** Custom progress indicator */
  renderProgress?: (props: ProgressProps) => React.ReactNode;
  /** Custom step summary */
  renderStepSummary?: (props: StepSummaryProps<T>) => React.ReactNode;
  /** Accessibility label for the form */
  ariaLabel?: string;
  /** Show step numbers */
  showStepNumbers?: boolean;
  /** Allow navigation to any step */
  allowFreeNavigation?: boolean;
  /** Confirm before leaving with unsaved changes */
  confirmOnLeave?: boolean;
}

export interface ProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: StepConfig<Record<string, unknown>>[];
  completedSteps: number[];
  errors: Record<string, string>;
}

export interface StepSummaryProps<T> {
  values: T;
  steps: StepConfig<T>[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

// Context for step-level validation
interface StepFormContextValue {
  errors: Record<string, string>;
  setFieldError: (field: string, error: string | null) => void;
  clearFieldError: (field: string) => void;
}

const StepFormContext = createContext<StepFormContextValue | null>(null);

export function useStepForm() {
  const context = useContext(StepFormContext);
  if (!context) {
    throw new Error('useStepForm must be used within a MultiStepForm');
  }
  return context;
}

// Progress Indicator Component
export function ProgressIndicator({ 
  currentStep, 
  totalSteps, 
  steps, 
  completedSteps,
  errors 
}: ProgressProps) {
  return (
    <nav aria-label="Form progress" className="mb-8">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(index);
          const isCurrent = index === currentStep;
          const hasErrors = Object.keys(errors).length > 0 && isCurrent;
          
          return (
            <li key={step.id} className="flex-1 relative">
              <div
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors
                  ${isCompleted 
                    ? 'bg-green-600 border-green-600 text-white' 
                    : isCurrent
                      ? hasErrors
                        ? 'bg-red-50 border-red-500 text-red-600'
                        : 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-100 border-gray-300 text-gray-500'
                  }
                `}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="mt-2 text-center">
                <p className={`text-sm font-medium ${isCurrent ? 'text-blue-600' : 'text-gray-700'}`}>
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
                    {step.description}
                  </p>
                )}
              </div>
              {index < totalSteps - 1 && (
                <div 
                  className={`absolute top-5 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-0.5 ${
                    completedSteps.includes(index) ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Step Summary Component
export function StepSummary<T>({ values, steps, currentStep, onStepClick }: StepSummaryProps<T>) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Form Summary</h3>
      <dl className="space-y-2">
        {steps.slice(0, currentStep + 1).map((step, index) => (
          <div key={step.id}>
            <dt className="text-xs text-gray-500">{step.title}</dt>
            <dd className="text-sm text-gray-900">
              {index < currentStep ? (
                <button
                  onClick={() => onStepClick?.(index)}
                  className="text-blue-600 hover:underline focus:outline-none focus:underline"
                >
                  Edit
                </button>
              ) : (
                <span className="text-gray-500">In progress</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Recovery Dialog Component
interface RecoveryDialogProps {
  isOpen: boolean;
  recoveryData: { savedAt: Date; step: number };
  onRecover: () => void;
  onStartFresh: () => void;
}

function RecoveryDialog({ isOpen, recoveryData, onRecover, onStartFresh }: RecoveryDialogProps) {
  const timeAgo = getTimeAgo(recoveryData.savedAt);
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onStartFresh}
      title="Recover Your Progress?"
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm text-blue-800">
              We found your previously saved form data from <strong>{timeAgo}</strong>.
            </p>
            <p className="text-sm text-blue-700 mt-1">
              You were on step {recoveryData.step + 1}.
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onRecover}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Recover Progress
          </button>
          <button
            onClick={onStartFresh}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Start Fresh
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Helper function
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// Main Component
export function MultiStepForm<T extends Record<string, unknown>>({
  steps,
  values,
  onChange,
  errors = {},
  onErrorsChange,
  currentStep: controlledStep,
  onStepChange,
  onSubmit,
  onCancel,
  isSaving = false,
  lastSavedAt,
  wasRecovered = false,
  recoveryData,
  onClearRecovery,
  readOnly = false,
  renderProgress,
  renderStepSummary,
  ariaLabel = 'Multi-step form',
  showStepNumbers = true,
  allowFreeNavigation = false,
  confirmOnLeave = true,
  children
}: MultiStepFormProps<T> & { children?: React.ReactNode }) {
  const [internalStep, setInternalStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<number | null>(null);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>(errors);
  
  const currentStep = controlledStep ?? internalStep;
  const setCurrentStep = useCallback((step: number) => {
    if (controlledStep === undefined) {
      setInternalStep(step);
    }
    onStepChange?.(step);
  }, [controlledStep, onStepChange]);

  const stepRef = useRef<HTMLDivElement>(null);

  // Show recovery dialog if form was abandoned
  useEffect(() => {
    if (wasRecovered && recoveryData) {
      setShowRecoveryDialog(true);
    }
  }, [wasRecovered, recoveryData]);

  // Sync errors
  useEffect(() => {
    setStepErrors(errors);
  }, [errors]);

  // Focus management on step change
  useEffect(() => {
    if (stepRef.current) {
      stepRef.current.focus();
    }
  }, [currentStep]);

  // Validate current step
  const validateStep = useCallback((stepIndex: number): boolean => {
    const step = steps[stepIndex];
    if (!step.validate) return true;
    
    const stepErrors = step.validate(values);
    if (stepErrors && Object.keys(stepErrors).length > 0) {
      onErrorsChange?.(stepErrors);
      return false;
    }
    
    onErrorsChange?.({});
    return true;
  }, [steps, values, onErrorsChange]);

  // Navigate to next step
  const goNext = useCallback(() => {
    if (currentStep >= steps.length - 1) return;
    
    if (!validateStep(currentStep)) return;
    
    setCompletedSteps(prev => [...prev.filter(s => s !== currentStep), currentStep]);
    setCurrentStep(currentStep + 1);
  }, [currentStep, steps.length, validateStep, setCurrentStep]);

  // Navigate to previous step
  const goBack = useCallback(() => {
    if (currentStep <= 0) return;
    setCurrentStep(currentStep - 1);
  }, [currentStep, setCurrentStep]);

  // Navigate to specific step
  const goToStep = useCallback((step: number) => {
    if (step < 0 || step >= steps.length) return;
    
    if (!allowFreeNavigation && step > currentStep) {
      // Need to validate all steps between current and target
      let canProceed = true;
      for (let i = currentStep; i < step; i++) {
        if (!validateStep(i)) {
          canProceed = false;
          break;
        }
      }
      if (!canProceed) return;
    }
    
    setCurrentStep(step);
  }, [steps.length, currentStep, allowFreeNavigation, validateStep, setCurrentStep]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!validateStep(currentStep)) return;
    
    // Validate all steps
    let allValid = true;
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(i)) {
        allValid = false;
        setCurrentStep(i);
        break;
      }
    }
    
    if (allValid) {
      await onSubmit(values);
    }
  }, [currentStep, steps, validateStep, onSubmit, values, setCurrentStep]);

  // Handle recovery
  const handleRecover = useCallback(() => {
    setShowRecoveryDialog(false);
    if (recoveryData) {
      setCurrentStep(recoveryData.step);
    }
  }, [recoveryData, setCurrentStep]);

  const handleStartFresh = useCallback(() => {
    setShowRecoveryDialog(false);
    onClearRecovery?.();
  }, [onClearRecovery]);

  // Context value
  const contextValue: StepFormContextValue = {
    errors: stepErrors,
    setFieldError: (field, error) => {
      setStepErrors(prev => {
        const next = { ...prev };
        if (error) {
          next[field] = error;
        } else {
          delete next[field];
        }
        return next;
      });
    },
    clearFieldError: (field) => {
      setStepErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const currentStepConfig = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <StepFormContext.Provider value={contextValue}>
      <div className="multi-step-form" aria-label={ariaLabel}>
        {/* Recovery Dialog */}
        {recoveryData && (
          <RecoveryDialog
            isOpen={showRecoveryDialog}
            recoveryData={recoveryData}
            onRecover={handleRecover}
            onStartFresh={handleStartFresh}
          />
        )}

        {/* Auto-save indicator */}
        {(isSaving || lastSavedAt) && (
          <div className="flex items-center justify-end gap-2 text-sm text-gray-500 mb-4">
            {isSaving ? (
              <>
                <Save className="w-4 h-4 animate-pulse" aria-hidden="true" />
                <span>Saving...</span>
              </>
            ) : lastSavedAt && (
              <>
                <Clock className="w-4 h-4" aria-hidden="true" />
                <span>Last saved {getTimeAgo(lastSavedAt)}</span>
              </>
            )}
          </div>
        )}

        {/* Progress Indicator */}
        {renderProgress ? (
          renderProgress({ currentStep, totalSteps: steps.length, steps, completedSteps, errors: stepErrors })
        ) : (
          <ProgressIndicator 
            currentStep={currentStep}
            totalSteps={steps.length}
            steps={steps}
            completedSteps={completedSteps}
            errors={stepErrors}
          />
        )}

        {/* Step Summary */}
        {renderStepSummary && renderStepSummary({ values, steps, currentStep, onStepClick: goToStep })}

        {/* Step Content */}
        <div
          ref={stepRef}
          tabIndex={-1}
          role="group"
          aria-labelledby={`step-${currentStep}-title`}
          className="outline-none"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step Header */}
              <div className="mb-6">
                <h2 
                  id={`step-${currentStep}-title`}
                  className="text-xl font-semibold text-gray-900"
                >
                  {showStepNumbers && `Step ${currentStep + 1}: `}
                  {currentStepConfig.title}
                </h2>
                {currentStepConfig.description && (
                  <p className="text-gray-600 mt-1">{currentStepConfig.description}</p>
                )}
                {currentStepConfig.isOptional && (
                  <span className="inline-block mt-2 text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    Optional
                  </span>
                )}
              </div>

              {/* Validation Errors Summary */}
              {Object.keys(stepErrors).length > 0 && (
                <div 
                  role="alert"
                  className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-red-800">Please fix the following errors:</p>
                    <ul className="mt-1 text-sm text-red-700 list-disc list-inside">
                      {Object.entries(stepErrors).map(([field, error]) => (
                        <li key={field}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Step Content (children render prop) */}
              {typeof children === 'function' 
                ? children({ step: currentStep, values, onChange, errors: stepErrors })
                : children
              }
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <div className="flex gap-3">
            {!isFirstStep && !readOnly && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                Back
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex gap-3">
            {isLastStep ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={readOnly}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Submit
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={readOnly}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </StepFormContext.Provider>
  );
}

export default MultiStepForm;
