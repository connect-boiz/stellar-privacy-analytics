import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

interface FormValues {
  privacyLevel: string;
  dataRetention: string;
  allowDataExport: boolean;
  allowSharing: boolean;
  contactEmail: string;
  epsilonBudget: string;
}

interface FormErrors {
  contactEmail?: string;
  epsilonBudget?: string;
  dataRetention?: string;
}

const validate = (values: FormValues): FormErrors => {
  const errors: FormErrors = {};
  if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
    errors.contactEmail = 'Enter a valid email address.';
  }
  const eps = parseFloat(values.epsilonBudget);
  if (isNaN(eps) || eps <= 0 || eps > 10) {
    errors.epsilonBudget = 'Epsilon must be a number between 0 and 10.';
  }
  const ret = parseInt(values.dataRetention, 10);
  if (isNaN(ret) || ret < 1) {
    errors.dataRetention = 'Retention period must be at least 1 day.';
  }
  return errors;
};

const privacyLevels = [
  { value: 'minimal', name: 'Minimal', risk: 'High', features: ['Data encryption', 'Basic access control'] },
  { value: 'standard', name: 'Standard', risk: 'Medium', features: ['Data encryption', 'Access control', 'Audit logging'] },
  { value: 'high', name: 'High', risk: 'Low', features: ['Data encryption', 'Access control', 'Audit logging', 'Differential privacy'] },
  { value: 'maximum', name: 'Maximum', risk: 'Very Low', features: ['Data encryption', 'Access control', 'Audit logging', 'Differential privacy', 'Zero-knowledge proofs'] },
];

const riskColor: Record<string, string> = {
  'Very Low': 'bg-green-100 text-green-700',
  Low: 'bg-blue-100 text-blue-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  High: 'bg-red-100 text-red-700',
};

const STORAGE_KEY = 'privacy_settings';

export const PrivacySettings: React.FC = () => {
  const [values, setValues] = useState<FormValues>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {
        privacyLevel: 'high',
        dataRetention: '365',
        allowDataExport: true,
        allowSharing: false,
        contactEmail: '',
        epsilonBudget: '1.0',
      };
    } catch {
      return { privacyLevel: 'high', dataRetention: '365', allowDataExport: true, allowSharing: false, contactEmail: '', epsilonBudget: '1.0' };
    }
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [saved, setSaved] = useState(false);

  // Real-time validation on touched fields
  useEffect(() => {
    const errs = validate(values);
    const visibleErrors: FormErrors = {};
    if (touched.contactEmail) visibleErrors.contactEmail = errs.contactEmail;
    if (touched.epsilonBudget) visibleErrors.epsilonBudget = errs.epsilonBudget;
    if (touched.dataRetention) visibleErrors.dataRetention = errs.dataRetention;
    setErrors(visibleErrors);
  }, [values, touched]);

  const set = <K extends keyof FormValues>(key: K, val: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const touch = (key: keyof FormValues) =>
    setTouched((prev) => ({ ...prev, [key]: true }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const allTouched = { contactEmail: true, epsilonBudget: true, dataRetention: true };
    setTouched(allTouched);
    const errs = validate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const Field: React.FC<{ id: keyof FormErrors; label: string; children: React.ReactNode }> = ({ id, label, children }) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {errors[id] && (
        <p role="alert" className="mt-1 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {errors[id]}
        </p>
      )}
    </div>
  );

  const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string; desc: string }> = ({ checked, onChange, label, desc }) => (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900 text-sm">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-label="Privacy Settings Form">
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Privacy Settings</h1>
          <p className="text-gray-600 mt-1">Manage your privacy and security preferences</p>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-600">Privacy Protected</span>
        </div>
      </div>

      {/* Privacy Level */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Privacy Level</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="radiogroup" aria-label="Privacy Level">
          {privacyLevels.map((level) => (
            <motion.div
              key={level.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              role="radio"
              aria-checked={values.privacyLevel === level.value}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && set('privacyLevel', level.value)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${values.privacyLevel === level.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              onClick={() => set('privacyLevel', level.value)}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{level.name}</h3>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${riskColor[level.risk]}`}>Risk: {level.risk}</span>
              </div>
              <ul className="text-xs text-gray-500 space-y-1">
                {level.features.map((f) => (
                  <li key={f} className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{f}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-white rounded-lg shadow p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Data Management</h2>

        <Field id="dataRetention" label="Data Retention Period (days)">
          <input
            id="dataRetention"
            type="number"
            min={1}
            value={values.dataRetention}
            onChange={(e) => set('dataRetention', e.target.value)}
            onBlur={() => touch('dataRetention')}
            aria-invalid={!!errors.dataRetention}
            aria-describedby={errors.dataRetention ? 'dataRetention-error' : undefined}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.dataRetention ? 'border-red-400' : 'border-gray-300'}`}
          />
        </Field>

        <Field id="epsilonBudget" label="Privacy Budget (ε epsilon, 0–10)">
          <input
            id="epsilonBudget"
            type="number"
            step="0.1"
            min={0.1}
            max={10}
            value={values.epsilonBudget}
            onChange={(e) => set('epsilonBudget', e.target.value)}
            onBlur={() => touch('epsilonBudget')}
            aria-invalid={!!errors.epsilonBudget}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.epsilonBudget ? 'border-red-400' : 'border-gray-300'}`}
          />
        </Field>

        <Field id="contactEmail" label="Notification Email (optional)">
          <input
            id="contactEmail"
            type="email"
            placeholder="admin@example.com"
            value={values.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            onBlur={() => touch('contactEmail')}
            aria-invalid={!!errors.contactEmail}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.contactEmail ? 'border-red-400' : 'border-gray-300'}`}
          />
        </Field>

        <Toggle checked={values.allowDataExport} onChange={() => set('allowDataExport', !values.allowDataExport)} label="Allow Data Export" desc="Permit users to export analysis results" />
        <Toggle checked={values.allowSharing} onChange={() => set('allowSharing', !values.allowSharing)} label="Allow Data Sharing" desc="Share anonymized insights with partners" />
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> Settings saved
          </motion.span>
        )}
        {Object.keys(errors).length > 0 && (
          <span className="text-sm text-red-600 flex items-center gap-1" role="alert">
            <AlertTriangle className="h-4 w-4" /> Fix errors before saving
          </span>
        )}
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          Save Settings
        </button>
      </div>
    </form>
  );
};
