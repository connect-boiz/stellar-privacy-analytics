import React, { useMemo, useState } from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { TrendingUp, Award, AlertCircle, CheckCircle } from 'lucide-react';

interface DimensionScore {
  dimension: string;
  score: number;
  benchmark: number;
  fullMark: 100;
}

interface HistoricalEntry {
  date: string;
  score: number;
}

interface Suggestion {
  priority: 'high' | 'medium' | 'low';
  dimension: string;
  action: string;
  impact: number;
}

const DIMENSION_SCORES: DimensionScore[] = [
  { dimension: 'Encryption', score: 90, benchmark: 75, fullMark: 100 },
  { dimension: 'Access Control', score: 78, benchmark: 70, fullMark: 100 },
  { dimension: 'Audit Compliance', score: 85, benchmark: 80, fullMark: 100 },
  { dimension: 'Data Minimization', score: 65, benchmark: 72, fullMark: 100 },
  { dimension: 'Anonymization', score: 72, benchmark: 68, fullMark: 100 },
  { dimension: 'Consent Mgmt', score: 88, benchmark: 76, fullMark: 100 },
];

const HISTORICAL: HistoricalEntry[] = [
  { date: 'Nov', score: 68 },
  { date: 'Dec', score: 72 },
  { date: 'Jan', score: 75 },
  { date: 'Feb', score: 79 },
  { date: 'Mar', score: 83 },
  { date: 'Apr', score: 88 },
];

const SUGGESTIONS: Suggestion[] = [
  {
    priority: 'high',
    dimension: 'Data Minimization',
    action: 'Review and remove unnecessary data fields from analytics pipelines.',
    impact: 12,
  },
  {
    priority: 'medium',
    dimension: 'Access Control',
    action: 'Enable multi-factor authentication for all analyst accounts.',
    impact: 8,
  },
  {
    priority: 'low',
    dimension: 'Anonymization',
    action: 'Apply k-anonymity (k≥5) to exported datasets.',
    impact: 5,
  },
];

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

function overallScore(dims: DimensionScore[]) {
  return Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
}

function scoreLabel(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs Improvement';
}

export const PrivacyScoreVisualization: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'radar' | 'trends' | 'suggestions'>('radar');
  const score = useMemo(() => overallScore(DIMENSION_SCORES), []);
  const label = scoreLabel(score);

  // Radar data: merge user score + benchmark
  const radarData = DIMENSION_SCORES.map(d => ({
    dimension: d.dimension,
    'Your Score': d.score,
    Benchmark: d.benchmark,
    fullMark: 100,
  }));

  const tabs = [
    { id: 'radar', label: 'Radar Chart' },
    { id: 'trends', label: 'Historical Trends' },
    { id: 'suggestions', label: 'Improvements' },
  ] as const;

  return (
    <div className="space-y-6" aria-label="Privacy Score Visualization">
      {/* Score summary */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Privacy Score</h1>
          <p className="text-gray-600 mt-1">
            Multi-dimensional privacy protection rating
          </p>
        </div>
        <div className="text-center" aria-label={`Overall privacy score: ${score} out of 100, ${label}`}>
          <div className="text-5xl font-bold text-blue-600">{score}</div>
          <div className="text-sm text-gray-500 mt-1">/ 100</div>
          <div className="mt-1 flex items-center gap-1 text-green-600 font-medium">
            <Award className="h-4 w-4" aria-hidden="true" />
            {label}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div
          className="w-full bg-gray-200 rounded-full h-3"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Privacy score: ${score}%`}
        >
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-700"
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0</span>
          <span>Industry avg: {Math.round(DIMENSION_SCORES.reduce((s, d) => s + d.benchmark, 0) / DIMENSION_SCORES.length)}</span>
          <span>100</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div
          role="tablist"
          aria-label="Privacy score views"
          className="flex border-b border-gray-200"
        >
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Radar */}
        <div
          role="tabpanel"
          id="panel-radar"
          aria-labelledby="tab-radar"
          hidden={activeTab !== 'radar'}
          className="p-6"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Privacy Dimensions vs Industry Benchmark
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar
                name="Your Score"
                dataKey="Your Score"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
              />
              <Radar
                name="Benchmark"
                dataKey="Benchmark"
                stroke="#a855f7"
                fill="#a855f7"
                fillOpacity={0.15}
                strokeDasharray="4 2"
              />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>

          {/* Dimension breakdown table */}
          <table className="w-full mt-4 text-sm" aria-label="Privacy dimension scores">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Dimension</th>
                <th className="pb-2 font-medium text-right">Your Score</th>
                <th className="pb-2 font-medium text-right">Benchmark</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {DIMENSION_SCORES.map(d => (
                <tr key={d.dimension} className="border-b border-gray-50">
                  <td className="py-2 text-gray-900">{d.dimension}</td>
                  <td className="py-2 text-right font-medium text-blue-600">{d.score}</td>
                  <td className="py-2 text-right text-gray-500">{d.benchmark}</td>
                  <td className="py-2 text-right">
                    {d.score >= d.benchmark ? (
                      <CheckCircle className="h-4 w-4 text-green-500 inline" aria-label="Above benchmark" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-500 inline" aria-label="Below benchmark" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Trends */}
        <div
          role="tabpanel"
          id="panel-trends"
          aria-labelledby="tab-trends"
          hidden={activeTab !== 'trends'}
          className="p-6"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" aria-hidden="true" />
            6-Month Privacy Score Trend
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={HISTORICAL}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[50, 100]} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="score"
                name="Privacy Score"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-sm text-gray-600 mt-3">
            Score improved by{' '}
            <strong className="text-green-600">
              +{HISTORICAL[HISTORICAL.length - 1].score - HISTORICAL[0].score} points
            </strong>{' '}
            over the last 6 months.
          </p>
        </div>

        {/* Suggestions */}
        <div
          role="tabpanel"
          id="panel-suggestions"
          aria-labelledby="tab-suggestions"
          hidden={activeTab !== 'suggestions'}
          className="p-6"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Actionable Improvement Suggestions
          </h2>
          <ul className="space-y-4" aria-label="Improvement suggestions">
            {SUGGESTIONS.map((s, i) => (
              <li
                key={i}
                className="border border-gray-200 rounded-lg p-4 flex items-start gap-3"
              >
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded capitalize ${PRIORITY_STYLES[s.priority]}`}
                  aria-label={`Priority: ${s.priority}`}
                >
                  {s.priority}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{s.dimension}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{s.action}</p>
                </div>
                <div
                  className="text-right text-sm font-medium text-green-600 whitespace-nowrap"
                  aria-label={`Potential score improvement: +${s.impact} points`}
                >
                  +{s.impact} pts
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
