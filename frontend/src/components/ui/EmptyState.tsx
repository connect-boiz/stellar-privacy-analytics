import React from 'react';

// ─── Inline SVG Illustrations ────────────────────────────────────────────────

const NoDataIllustration: React.FC<{ className?: string }> = ({ className = 'w-40 h-40' }) => (
  <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    {/* Background circle */}
    <circle cx="80" cy="80" r="72" fill="#EFF6FF" />
    {/* Database stack */}
    <ellipse cx="80" cy="58" rx="32" ry="10" fill="#BFDBFE" />
    <rect x="48" y="58" width="64" height="28" fill="#BFDBFE" />
    <ellipse cx="80" cy="86" rx="32" ry="10" fill="#93C5FD" />
    <rect x="48" y="86" width="64" height="20" fill="#93C5FD" />
    <ellipse cx="80" cy="106" rx="32" ry="10" fill="#60A5FA" />
    {/* Question mark */}
    <text x="80" y="76" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#1D4ED8" fontFamily="sans-serif">?</text>
    {/* Sparkle dots */}
    <circle cx="122" cy="44" r="4" fill="#BFDBFE" />
    <circle cx="134" cy="60" r="2.5" fill="#93C5FD" />
    <circle cx="38" cy="50" r="3" fill="#BFDBFE" />
  </svg>
);

const NoSearchResultsIllustration: React.FC<{ className?: string }> = ({ className = 'w-40 h-40' }) => (
  <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="80" cy="80" r="72" fill="#F0FDF4" />
    {/* Magnifying glass */}
    <circle cx="72" cy="72" r="28" stroke="#86EFAC" strokeWidth="6" fill="white" />
    <line x1="92" y1="92" x2="112" y2="112" stroke="#86EFAC" strokeWidth="6" strokeLinecap="round" />
    {/* X inside glass */}
    <line x1="62" y1="62" x2="82" y2="82" stroke="#4ADE80" strokeWidth="4" strokeLinecap="round" />
    <line x1="82" y1="62" x2="62" y2="82" stroke="#4ADE80" strokeWidth="4" strokeLinecap="round" />
    {/* Dots */}
    <circle cx="118" cy="50" r="4" fill="#BBF7D0" />
    <circle cx="40" cy="100" r="3" fill="#BBF7D0" />
    <circle cx="130" cy="90" r="2.5" fill="#86EFAC" />
  </svg>
);

const NoAuditLogsIllustration: React.FC<{ className?: string }> = ({ className = 'w-40 h-40' }) => (
  <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="80" cy="80" r="72" fill="#F5F3FF" />
    {/* Shield */}
    <path d="M80 36 L112 50 L112 82 C112 100 80 118 80 118 C80 118 48 100 48 82 L48 50 Z" fill="#DDD6FE" stroke="#A78BFA" strokeWidth="3" />
    {/* Checkmark */}
    <path d="M65 80 L75 90 L96 68" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Lines suggesting log entries */}
    <rect x="30" y="100" width="20" height="3" rx="1.5" fill="#C4B5FD" />
    <rect x="30" y="108" width="14" height="3" rx="1.5" fill="#DDD6FE" />
    <rect x="110" y="100" width="20" height="3" rx="1.5" fill="#C4B5FD" />
    <rect x="114" y="108" width="14" height="3" rx="1.5" fill="#DDD6FE" />
  </svg>
);

const NoChartDataIllustration: React.FC<{ className?: string }> = ({ className = 'w-40 h-40' }) => (
  <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="80" cy="80" r="72" fill="#FFF7ED" />
    {/* Chart axes */}
    <line x1="44" y1="112" x2="120" y2="112" stroke="#FED7AA" strokeWidth="3" strokeLinecap="round" />
    <line x1="44" y1="112" x2="44" y2="44" stroke="#FED7AA" strokeWidth="3" strokeLinecap="round" />
    {/* Dashed bars (empty) */}
    <rect x="56" y="80" width="14" height="32" rx="3" fill="none" stroke="#FDBA74" strokeWidth="2" strokeDasharray="4 3" />
    <rect x="76" y="64" width="14" height="48" rx="3" fill="none" stroke="#FDBA74" strokeWidth="2" strokeDasharray="4 3" />
    <rect x="96" y="72" width="14" height="40" rx="3" fill="none" stroke="#FDBA74" strokeWidth="2" strokeDasharray="4 3" />
    {/* Dots */}
    <circle cx="122" cy="48" r="4" fill="#FED7AA" />
    <circle cx="36" cy="56" r="3" fill="#FED7AA" />
  </svg>
);

const NoResultsGenericIllustration: React.FC<{ className?: string }> = ({ className = 'w-40 h-40' }) => (
  <svg className={className} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="80" cy="80" r="72" fill="#F8FAFC" />
    {/* Document stack */}
    <rect x="52" y="48" width="56" height="72" rx="6" fill="#E2E8F0" />
    <rect x="46" y="54" width="56" height="72" rx="6" fill="#CBD5E1" />
    <rect x="40" y="60" width="56" height="72" rx="6" fill="white" stroke="#CBD5E1" strokeWidth="2" />
    {/* Lines on doc */}
    <rect x="52" y="76" width="32" height="3" rx="1.5" fill="#CBD5E1" />
    <rect x="52" y="84" width="24" height="3" rx="1.5" fill="#E2E8F0" />
    <rect x="52" y="92" width="28" height="3" rx="1.5" fill="#E2E8F0" />
    {/* Sad face */}
    <circle cx="80" cy="108" r="14" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="2" />
    <circle cx="75" cy="105" r="1.5" fill="#94A3B8" />
    <circle cx="85" cy="105" r="1.5" fill="#94A3B8" />
    <path d="M75 112 Q80 109 85 112" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
);

// ─── Illustration map ─────────────────────────────────────────────────────────

const illustrations = {
  'no-data': NoDataIllustration,
  'no-search-results': NoSearchResultsIllustration,
  'no-audit-logs': NoAuditLogsIllustration,
  'no-chart-data': NoChartDataIllustration,
  'no-results': NoResultsGenericIllustration,
} as const;

export type EmptyStateVariant = keyof typeof illustrations;

// ─── EmptyState Component ─────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Which illustration to show */
  variant?: EmptyStateVariant;
  /** Main heading */
  title: string;
  /** Supporting description */
  description?: string;
  /** Optional action button(s) */
  action?: React.ReactNode;
  /** Extra class names for the wrapper */
  className?: string;
  /** Override illustration size */
  illustrationClassName?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'no-results',
  title,
  description,
  action,
  className = '',
  illustrationClassName,
}) => {
  const Illustration = illustrations[variant];

  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}
      role="status"
      aria-label={title}
    >
      <Illustration className={illustrationClassName ?? 'w-36 h-36 mb-6'} />
      <h3 className="text-base font-semibold text-gray-800 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-xs mb-4">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export default EmptyState;
