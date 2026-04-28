import React, { useId, useRef, useState } from 'react';
import { Shield, CheckCircle } from 'lucide-react';

interface PrivacyConfig {
  privacyLevel: 'minimal' | 'standard' | 'high' | 'maximum';
  dataRetention: string;
  allowDataExport: boolean;
  allowSharing: boolean;
  highContrastMode: boolean;
}

const PRIVACY_LEVELS = [
  { value: 'minimal', label: 'Minimal', description: 'Basic privacy protection with data encryption.' },
  { value: 'standard', label: 'Standard', description: 'Recommended for most use cases. Includes audit logging.' },
  { value: 'high', label: 'High', description: 'Enhanced protection with differential privacy.' },
  { value: 'maximum', label: 'Maximum', description: 'Highest protection with zero-knowledge proofs.' },
] as const;

const RETENTION_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
  { value: '730', label: '2 years' },
];

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}

const Toggle: React.FC<ToggleProps> = ({ id, checked, onChange, label, description }) => {
  const descId = `${id}-desc`;
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <label htmlFor={id} className="font-medium text-gray-900 cursor-pointer">
          {label}
        </label>
        <p id={descId} className="text-sm text-gray-600">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

export const AccessiblePrivacyConfigForm: React.FC = () => {
  const formId = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);

  const [config, setConfig] = useState<PrivacyConfig>({
    privacyLevel: 'high',
    dataRetention: '365',
    allowDataExport: true,
    allowSharing: false,
    highContrastMode: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    // Announce to screen readers
    if (statusRef.current) {
      statusRef.current.textContent = 'Privacy settings saved successfully.';
    }
    setTimeout(() => setSaved(false), 3000);
  };

  const retentionId = `${formId}-retention`;
  const retentionDescId = `${retentionId}-desc`;

  return (
    <div
      className={config.highContrastMode ? 'high-contrast' : ''}
      style={
        config.highContrastMode
          ? { filter: 'contrast(1.5)', background: '#000', color: '#fff' }
          : undefined
      }
    >
      {/* Skip link for keyboard users */}
      <a
        href={`#${formId}-main`}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded"
      >
        Skip to privacy settings form
      </a>

      {/* Live region for screen reader announcements */}
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <form
        id={`${formId}-main`}
        onSubmit={handleSubmit}
        aria-label="Privacy configuration settings"
        className="space-y-6"
        noValidate
      >
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900" id={`${formId}-title`}>
                Privacy Configuration
              </h1>
              <p className="text-gray-600 mt-1" id={`${formId}-subtitle`}>
                Configure your privacy and data protection preferences
              </p>
            </div>
            <Shield className="h-6 w-6 text-green-500" aria-hidden="true" />
          </div>
        </div>

        {/* Privacy Level */}
        <fieldset className="bg-white rounded-lg shadow p-6">
          <legend className="text-lg font-semibold text-gray-900 mb-1">
            Privacy Level
          </legend>
          <p className="text-sm text-gray-600 mb-4" id={`${formId}-level-hint`}>
            Select the level of privacy protection for your data.
          </p>
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
            role="radiogroup"
            aria-describedby={`${formId}-level-hint`}
          >
            {PRIVACY_LEVELS.map(level => {
              const inputId = `${formId}-level-${level.value}`;
              const isSelected = config.privacyLevel === level.value;
              return (
                <label
                  key={level.value}
                  htmlFor={inputId}
                  className={`border rounded-lg p-4 cursor-pointer transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    id={inputId}
                    name={`${formId}-privacy-level`}
                    value={level.value}
                    checked={isSelected}
                    onChange={() => setConfig(c => ({ ...c, privacyLevel: level.value }))}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-gray-900 flex items-center gap-2">
                      {level.label}
                      {isSelected && (
                        <CheckCircle
                          className="h-4 w-4 text-blue-600"
                          aria-label="Currently selected"
                        />
                      )}
                    </span>
                    <span className="text-sm text-gray-600">{level.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Data Management */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h2>

          {/* Data Retention */}
          <div className="mb-4">
            <label htmlFor={retentionId} className="block font-medium text-gray-900 mb-1">
              Data Retention Period
            </label>
            <p id={retentionDescId} className="text-sm text-gray-600 mb-2">
              How long processed data is retained before automatic deletion.
            </p>
            <select
              id={retentionId}
              aria-describedby={retentionDescId}
              value={config.dataRetention}
              onChange={e => setConfig(c => ({ ...c, dataRetention: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-auto"
            >
              {RETENTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-gray-100">
            <Toggle
              id={`${formId}-export`}
              checked={config.allowDataExport}
              onChange={v => setConfig(c => ({ ...c, allowDataExport: v }))}
              label="Allow Data Export"
              description="Permit users to export analysis results."
            />
            <Toggle
              id={`${formId}-sharing`}
              checked={config.allowSharing}
              onChange={v => setConfig(c => ({ ...c, allowSharing: v }))}
              label="Allow Data Sharing"
              description="Share anonymized insights with partners."
            />
            <Toggle
              id={`${formId}-contrast`}
              checked={config.highContrastMode}
              onChange={v => setConfig(c => ({ ...c, highContrastMode: v }))}
              label="High Contrast Mode"
              description="Increase color contrast for better visibility."
            />
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end gap-4">
          {saved && (
            <p role="status" className="text-green-600 font-medium flex items-center gap-1">
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              Settings saved
            </p>
          )}
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium"
          >
            Save Privacy Settings
          </button>
        </div>
      </form>
    </div>
  );
};
