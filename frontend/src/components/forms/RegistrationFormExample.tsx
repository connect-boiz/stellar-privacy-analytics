import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  User, 
  Building, 
  FileText, 
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { MultiStepForm, ProgressIndicator, StepSummary } from './MultiStepForm';
import { FormField, FieldGroup, RadioOption } from './FormField';
import { useFormPersistence, prefillFromProfile } from '../../hooks/useFormPersistence';
import { validateFormData, rules, patterns } from '../../lib/formValidation';

// Example: User Registration Form with multiple steps

interface RegistrationFormData {
  // Step 1: Personal Info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  
  // Step 2: Organization
  organizationName: string;
  organizationType: string;
  jobTitle: string;
  department: string;
  teamSize: string;
  
  // Step 3: Preferences
  useCase: string;
  dataVolume: string;
  preferredFeatures: string[];
  referralSource: string;
  
  // Step 4: Agreement
  termsAccepted: boolean;
  privacyPolicyAccepted: boolean;
  marketingConsent: boolean;
}

const defaultValues: RegistrationFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: '',
  
  organizationName: '',
  organizationType: '',
  jobTitle: '',
  department: '',
  teamSize: '',
  
  useCase: '',
  dataVolume: '',
  preferredFeatures: [],
  referralSource: '',
  
  termsAccepted: false,
  privacyPolicyAccepted: false,
  marketingConsent: false
};

// Validation schema per step
const step1Schema = {
  firstName: rules.required('First name is required'),
  lastName: rules.required('Last name is required'),
  email: rules.email(),
  phone: { pattern: { value: patterns.phone, message: 'Invalid phone number' } },
  role: rules.required('Please select your role')
};

const step2Schema = {
  organizationName: rules.required('Organization name is required'),
  organizationType: rules.required('Please select organization type'),
  jobTitle: rules.required('Job title is required'),
  department: { required: false },
  teamSize: { required: false }
};

const step3Schema = {
  useCase: rules.required('Please select a primary use case'),
  dataVolume: rules.required('Please estimate your data volume'),
  preferredFeatures: { required: false },
  referralSource: { required: false }
};

const step4Schema = {
  termsAccepted: { 
    required: 'You must accept the terms of service',
    validate: (value: boolean) => value === true || 'You must accept the terms of service'
  },
  privacyPolicyAccepted: {
    required: 'You must accept the privacy policy',
    validate: (value: boolean) => value === true || 'You must accept the privacy policy'
  },
  marketingConsent: { required: false }
};

// Step configurations
const formSteps = [
  {
    id: 'personal',
    title: 'Personal Information',
    description: 'Tell us about yourself',
    icon: User,
    validate: (values: RegistrationFormData) => validateFormData(values, step1Schema)
  },
  {
    id: 'organization',
    title: 'Organization Details',
    description: 'Your workplace information',
    icon: Building,
    validate: (values: RegistrationFormData) => validateFormData(values, step2Schema)
  },
  {
    id: 'preferences',
    title: 'Usage Preferences',
    description: 'How you plan to use the platform',
    icon: FileText,
    validate: (values: RegistrationFormData) => validateFormData(values, step3Schema)
  },
  {
    id: 'agreement',
    title: 'Review & Submit',
    description: 'Finalize your registration',
    icon: CheckCircle,
    validate: (values: RegistrationFormData) => validateFormData(values, step4Schema)
  }
];

// Role options
const roleOptions = [
  { value: 'data_scientist', label: 'Data Scientist' },
  { value: 'analyst', label: 'Data Analyst' },
  { value: 'engineer', label: 'Software Engineer' },
  { value: 'manager', label: 'Engineering Manager' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'other', label: 'Other' }
];

const orgTypeOptions = [
  { value: 'startup', label: 'Startup (< 50 employees)' },
  { value: 'smb', label: 'Small/Medium Business (50-500)' },
  { value: 'enterprise', label: 'Enterprise (> 500)' },
  { value: 'academic', label: 'Academic Institution' },
  { value: 'government', label: 'Government Agency' },
  { value: 'nonprofit', label: 'Non-Profit Organization' }
];

const useCaseOptions = [
  { value: 'privacy_analytics', label: 'Privacy-Preserving Analytics', description: 'Analyze data without exposing raw values' },
  { value: 'secure_sharing', label: 'Secure Data Sharing', description: 'Share data with partners securely' },
  { value: 'compliance', label: 'Regulatory Compliance', description: 'Meet GDPR, CCPA, and other requirements' },
  { value: 'research', label: 'Academic Research', description: 'Conduct privacy-preserving research' }
];

const dataVolumeOptions = [
  { value: 'small', label: 'Small (< 10K records)' },
  { value: 'medium', label: 'Medium (10K - 1M records)' },
  { value: 'large', label: 'Large (1M - 100M records)' },
  { value: 'enterprise', label: 'Enterprise (> 100M records)' }
];

export function RegistrationFormExample() {
  // Simulate user profile data for pre-filling
  const userProfile = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com'
  };

  // Initialize form with persistence
  const [formState, formActions] = useFormPersistence({
    storageKey: 'registration-form',
    storageType: 'localStorage',
    defaultValues: prefillFromProfile(defaultValues, userProfile, ['firstName', 'lastName', 'email']),
    validate: (data) => {
      // Overall validation
      const allSchemas = { ...step1Schema, ...step2Schema, ...step3Schema, ...step4Schema };
      return validateFormData(data, allSchemas);
    },
    onRecover: (data) => {
      console.log('Form recovered:', data);
    },
    onAutoSave: (data) => {
      console.log('Auto-saved:', data);
    },
    expiryMs: 24 * 60 * 60 * 1000 // 24 hours
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
    setErrors({});
  }, []);

  const handleSubmit = useCallback(async (values: RegistrationFormData) => {
    setIsSubmitting(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('Form submitted:', values);
      formActions.markSubmitted();
      alert('Registration submitted successfully!');
    } catch (error) {
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [formActions]);

  const handleCancel = useCallback(() => {
    if (confirm('Are you sure you want to cancel? Your progress will be lost.')) {
      formActions.reset();
      setCurrentStep(0);
    }
  }, [formActions]);

  // Render step content
  const renderStepContent = ({ step, values, onChange, errors }: {
    step: number;
    values: RegistrationFormData;
    onChange: (values: RegistrationFormData) => void;
    errors: Record<string, string>;
  }) => {
    const updateField = <K extends keyof RegistrationFormData>(
      field: K,
      value: RegistrationFormData[K]
    ) => {
      onChange({ ...values, [field]: value });
    };

    switch (step) {
      case 0: // Personal Information
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                name="firstName"
                label="First Name"
                value={values.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                error={errors.firstName}
                required
                autoFocus
              />
              <FormField
                name="lastName"
                label="Last Name"
                value={values.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                error={errors.lastName}
                required
              />
            </div>

            <FormField
              name="email"
              label="Email Address"
              type="email"
              value={values.email}
              onChange={(e) => updateField('email', e.target.value)}
              error={errors.email}
              description="We'll never share your email"
              required
            />

            <FormField
              name="phone"
              label="Phone Number"
              type="tel"
              value={values.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              error={errors.phone}
              placeholder="+1 (555) 000-0000"
            />

            <FieldGroup
              label="Your Role"
              name="role"
              error={errors.role}
              required
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {roleOptions.map(option => (
                  <RadioOption
                    key={option.value}
                    name="role"
                    value={option.value}
                    label={option.label}
                    checked={values.role === option.value}
                    onChange={() => updateField('role', option.value)}
                  />
                ))}
              </div>
            </FieldGroup>
          </div>
        );

      case 1: // Organization
        return (
          <div className="space-y-4">
            <FormField
              name="organizationName"
              label="Organization Name"
              value={values.organizationName}
              onChange={(e) => updateField('organizationName', e.target.value)}
              error={errors.organizationName}
              required
              autoFocus
            />

            <FieldGroup
              label="Organization Type"
              name="organizationType"
              error={errors.organizationType}
              required
            >
              <div className="space-y-2">
                {orgTypeOptions.map(option => (
                  <RadioOption
                    key={option.value}
                    name="organizationType"
                    value={option.value}
                    label={option.label}
                    checked={values.organizationType === option.value}
                    onChange={() => updateField('organizationType', option.value)}
                  />
                ))}
              </div>
            </FieldGroup>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                name="jobTitle"
                label="Job Title"
                value={values.jobTitle}
                onChange={(e) => updateField('jobTitle', e.target.value)}
                error={errors.jobTitle}
                required
              />
              <FormField
                name="department"
                label="Department"
                value={values.department}
                onChange={(e) => updateField('department', e.target.value)}
                error={errors.department}
              />
            </div>

            <FormField
              name="teamSize"
              label="Team Size"
              type="select"
              value={values.teamSize}
              onChange={(e) => updateField('teamSize', e.target.value)}
              error={errors.teamSize}
            >
              <option value="">Select team size</option>
              <option value="1-5">1-5 people</option>
              <option value="6-20">6-20 people</option>
              <option value="21-50">21-50 people</option>
              <option value="50+">50+ people</option>
            </FormField>
          </div>
        );

      case 2: // Preferences
        return (
          <div className="space-y-4">
            <FieldGroup
              label="Primary Use Case"
              name="useCase"
              error={errors.useCase}
              required
            >
              <div className="space-y-2">
                {useCaseOptions.map(option => (
                  <RadioOption
                    key={option.value}
                    name="useCase"
                    value={option.value}
                    label={option.label}
                    description={option.description}
                    checked={values.useCase === option.value}
                    onChange={() => updateField('useCase', option.value)}
                  />
                ))}
              </div>
            </FieldGroup>

            <FieldGroup
              label="Estimated Data Volume"
              name="dataVolume"
              error={errors.dataVolume}
              required
              layout="horizontal"
            >
              {dataVolumeOptions.map(option => (
                <RadioOption
                  key={option.value}
                  name="dataVolume"
                  value={option.value}
                  label={option.label}
                  checked={values.dataVolume === option.value}
                  onChange={() => updateField('dataVolume', option.value)}
                />
              ))}
            </FieldGroup>

            <FormField
              name="referralSource"
              label="How did you hear about us?"
              type="select"
              value={values.referralSource}
              onChange={(e) => updateField('referralSource', e.target.value)}
              error={errors.referralSource}
            >
              <option value="">Select an option</option>
              <option value="search">Search Engine</option>
              <option value="social">Social Media</option>
              <option value="referral">Friend or Colleague</option>
              <option value="conference">Conference/Event</option>
              <option value="blog">Blog or Article</option>
              <option value="other">Other</option>
            </FormField>
          </div>
        );

      case 3: // Agreement
        return (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Registration Summary</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Name:</dt>
                  <dd className="text-gray-900">{values.firstName} {values.lastName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Email:</dt>
                  <dd className="text-gray-900">{values.email}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Organization:</dt>
                  <dd className="text-gray-900">{values.organizationName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Role:</dt>
                  <dd className="text-gray-900">{roleOptions.find(r => r.value === values.role)?.label}</dd>
                </div>
              </dl>
            </div>

            {/* Agreements */}
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={values.termsAccepted}
                  onChange={(e) => updateField('termsAccepted', e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-900">
                    I accept the Terms of Service <span className="text-red-500">*</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    By checking this box, you agree to our terms and conditions.
                  </p>
                  {errors.termsAccepted && (
                    <p className="text-sm text-red-600 mt-1">{errors.termsAccepted}</p>
                  )}
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={values.privacyPolicyAccepted}
                  onChange={(e) => updateField('privacyPolicyAccepted', e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-900">
                    I accept the Privacy Policy <span className="text-red-500">*</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Learn how we collect, use, and protect your data.
                  </p>
                  {errors.privacyPolicyAccepted && (
                    <p className="text-sm text-red-600 mt-1">{errors.privacyPolicyAccepted}</p>
                  )}
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={values.marketingConsent}
                  onChange={(e) => updateField('marketingConsent', e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-900">Marketing Communications</p>
                  <p className="text-sm text-gray-500">
                    Receive updates about new features and best practices (optional).
                  </p>
                </div>
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
        <p className="text-gray-600 mt-1">Complete the form below to get started</p>
      </div>

      <MultiStepForm
        steps={formSteps}
        values={formState.values}
        onChange={formActions.setValues}
        errors={errors}
        onErrorsChange={setErrors}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSaving={formState.isSaving}
        lastSavedAt={formState.lastSavedAt}
        wasRecovered={formState.wasRecovered}
        recoveryData={formState.recoveryData}
        onClearRecovery={formActions.clear}
        ariaLabel="Registration form"
        showStepNumbers
      >
        {renderStepContent}
      </MultiStepForm>
    </div>
  );
}

export default RegistrationFormExample;
