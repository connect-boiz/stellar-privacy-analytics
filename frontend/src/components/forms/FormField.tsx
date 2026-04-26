import React, { useId, forwardRef } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export interface FormFieldProps {
  /** Field name/id */
  name: string;
  /** Field label */
  label: string;
  /** Field type */
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'radio';
  /** Placeholder text */
  placeholder?: string;
  /** Help text/description */
  description?: string;
  /** Error message */
  error?: string;
  /** Success state */
  success?: boolean;
  /** Success message */
  successMessage?: string;
  /** Current value */
  value?: string | number;
  /** Default value for uncontrolled */
  defaultValue?: string | number;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  /** Blur handler */
  onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  /** Focus handler */
  onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  /** Required field */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Read-only state */
  readOnly?: boolean;
  /** Auto-focus */
  autoFocus?: boolean;
  /** Additional input props */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> | React.TextareaHTMLAttributes<HTMLTextAreaElement> | React.SelectHTMLAttributes<HTMLSelectElement>;
  /** Custom className for wrapper */
  className?: string;
  /** Custom className for input */
  inputClassName?: string;
  /** Children for select options or radio group */
  children?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Layout variant */
  layout?: 'vertical' | 'horizontal';
  /** Show character count */
  showCharCount?: boolean;
  /** Max character length */
  maxLength?: number;
  /** Prefix element */
  prefix?: React.ReactNode;
  /** Suffix element */
  suffix?: React.ReactNode;
}

/**
 * Accessible form field component with proper ARIA attributes,
 * error handling, and screen reader support
 */
export const FormField = forwardRef<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  FormFieldProps
>(({
  name,
  label,
  type = 'text',
  placeholder,
  description,
  error,
  success,
  successMessage,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  required = false,
  disabled = false,
  readOnly = false,
  autoFocus = false,
  inputProps,
  className = '',
  inputClassName = '',
  children,
  size = 'md',
  layout = 'vertical',
  showCharCount = false,
  maxLength,
  prefix,
  suffix
}, ref) => {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const successId = `${id}-success`;
  
  const hasError = !!error;
  const hasSuccess = success && !hasError;
  const hasDescription = !!description;
  
  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  // Base input classes
  const baseInputClasses = `
    w-full rounded-lg border transition-colors
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:bg-gray-100 disabled:cursor-not-allowed
    read-only:bg-gray-50
    ${sizeClasses[size]}
  `;

  // State-specific classes
  const stateClasses = hasError
    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
    : hasSuccess
      ? 'border-green-500 focus:ring-green-500 focus:border-green-500'
      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500';

  // Layout classes
  const layoutClasses = layout === 'horizontal'
    ? 'flex items-start gap-4'
    : 'space-y-1';

  // ARIA attributes
  const ariaDescribedBy = [
    hasDescription && descriptionId,
    hasError && errorId,
    hasSuccess && successId
  ].filter(Boolean).join(' ') || undefined;

  const ariaInvalid = hasError ? true : undefined;
  const ariaRequired = required ? true : undefined;

  // Character count
  const charCount = typeof value === 'string' ? value.length : 0;

  // Render input element based on type
  const renderInput = () => {
    const commonProps = {
      id,
      name,
      value,
      defaultValue,
      onChange,
      onBlur,
      onFocus,
      disabled,
      readOnly,
      autoFocus,
      required,
      placeholder,
      maxLength,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      'aria-required': ariaRequired,
      className: `${baseInputClasses} ${stateClasses} ${inputClassName}`
    };

    if (type === 'textarea') {
      return (
        <textarea
          {...commonProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>}
          ref={ref as React.Ref<HTMLTextAreaElement>}
          rows={4}
        />
      );
    }

    if (type === 'select') {
      return (
        <select
          {...commonProps as React.SelectHTMLAttributes<HTMLSelectElement>}
          ref={ref as React.Ref<HTMLSelectElement>}
        >
          {children}
        </select>
      );
    }

    // Checkbox and radio have different layout
    if (type === 'checkbox' || type === 'radio') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            {...commonProps as React.InputHTMLAttributes<HTMLInputElement>}
            ref={ref as React.Ref<HTMLInputElement>}
            type={type}
            checked={value === true || value === 'true'}
            className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${hasError ? 'border-red-500' : ''}`}
          />
          <span className="text-sm text-gray-700">{label}</span>
        </label>
      );
    }

    // Regular input with prefix/suffix
    if (prefix || suffix) {
      return (
        <div className="flex items-center">
          {prefix && (
            <div className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-500">
              {prefix}
            </div>
          )}
          <input
            {...commonProps as React.InputHTMLAttributes<HTMLInputElement>}
            ref={ref as React.Ref<HTMLInputElement>}
            type={type}
            className={`${baseInputClasses} ${stateClasses} ${prefix ? 'rounded-l-none' : ''} ${suffix ? 'rounded-r-none' : ''}`}
          />
          {suffix && (
            <div className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500">
              {suffix}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        {...commonProps as React.InputHTMLAttributes<HTMLInputElement>}
        ref={ref as React.Ref<HTMLInputElement>}
        type={type}
      />
    );
  };

  // Don't show label for checkbox/radio (it's inline)
  const showLabel = type !== 'checkbox' && type !== 'radio';

  return (
    <div className={`form-field ${layoutClasses} ${className}`}>
      {showLabel && (
        <label 
          htmlFor={id} 
          className={`block text-sm font-medium ${hasError ? 'text-red-700' : 'text-gray-700'}`}
        >
          {label}
          {required && (
            <span className="text-red-500 ml-1" aria-hidden="true">*</span>
          )}
        </label>
      )}

      <div className="relative">
        {renderInput()}
      </div>

      {/* Character count */}
      {showCharCount && maxLength && (
        <div className="flex justify-end mt-1">
          <span className={`text-xs ${charCount > maxLength ? 'text-red-500' : 'text-gray-400'}`}>
            {charCount}/{maxLength}
          </span>
        </div>
      )}

      {/* Description */}
      {hasDescription && !hasError && !hasSuccess && (
        <p id={descriptionId} className="text-sm text-gray-500 flex items-start gap-1">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          {description}
        </p>
      )}

      {/* Error message */}
      {hasError && (
        <p 
          id={errorId}
          role="alert"
          className="text-sm text-red-600 flex items-start gap-1"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Success message */}
      {hasSuccess && successMessage && (
        <p 
          id={successId}
          className="text-sm text-green-600 flex items-start gap-1"
        >
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          {successMessage}
        </p>
      )}
    </div>
  );
});

FormField.displayName = 'FormField';

/**
 * Field Group for radio buttons and checkboxes
 */
export interface FieldGroupProps {
  /** Group label */
  label: string;
  /** Group name */
  name: string;
  /** Error message */
  error?: string;
  /** Description */
  description?: string;
  /** Required */
  required?: boolean;
  /** Children (radio/checkbox options) */
  children: React.ReactNode;
  /** Layout */
  layout?: 'vertical' | 'horizontal';
  /** Custom className */
  className?: string;
}

export function FieldGroup({
  label,
  name,
  error,
  description,
  required = false,
  children,
  layout = 'vertical',
  className = ''
}: FieldGroupProps) {
  const id = useId();
  const groupId = `${id}-group`;
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;

  return (
    <fieldset className={`form-field-group ${className}`}>
      <legend className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </legend>

      {description && (
        <p id={descriptionId} className="text-sm text-gray-500 mt-1">
          {description}
        </p>
      )}

      <div 
        className={`mt-2 ${layout === 'horizontal' ? 'flex flex-wrap gap-4' : 'space-y-2'}`}
        role="group"
        aria-labelledby={groupId}
        aria-describedby={description ? descriptionId : undefined}
        aria-required={required}
      >
        {children}
      </div>

      {error && (
        <p 
          id={errorId}
          role="alert"
          className="text-sm text-red-600 mt-2 flex items-start gap-1"
        >
          <AlertCircle className="w-4 h-4 mt-0.5" aria-hidden="true" />
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Radio option component
 */
export interface RadioOptionProps {
  name: string;
  value: string;
  label: string;
  description?: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

export function RadioOption({
  name,
  value,
  label,
  description,
  checked,
  onChange,
  disabled
}: RadioOptionProps) {
  const id = useId();

  return (
    <label 
      htmlFor={id}
      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
        checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
      />
      <div>
        <span className="text-sm font-medium text-gray-900">{label}</span>
        {description && (
          <p className="text-sm text-gray-500">{description}</p>
        )}
      </div>
    </label>
  );
}

export default FormField;
