import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, CheckCircle, XCircle, ChevronRight, Award, Search } from 'lucide-react';

const tutorials = [
  {
    id: 1,
    title: 'Differential Privacy',
    description: 'Add statistical noise to protect individual data while preserving aggregate insights.',
    steps: [
      'Differential privacy guarantees that query results are nearly identical whether or not any single individual is in the dataset.',
      'The privacy budget ε (epsilon) controls the privacy-utility tradeoff — smaller ε means stronger privacy.',
      'Noise is calibrated to the sensitivity of the query and the desired ε value.',
      'Common mechanisms: Laplace (numeric), Exponential (categorical), Gaussian (approximate DP).',
    ],
  },
  {
    id: 2,
    title: 'Secure Multi-Party Computation',
    description: 'Multiple parties jointly compute a function without revealing their private inputs.',
    steps: [
      'MPC allows parties to collaborate on computations without exposing raw data to each other.',
      'Secret sharing splits data into shares — no single party can reconstruct the original value.',
      'Garbled circuits and oblivious transfer are core cryptographic primitives in MPC.',
      'Use cases: joint analytics, private set intersection, federated learning.',
    ],
  },
  {
    id: 3,
    title: 'Zero-Knowledge Proofs',
    description: 'Prove knowledge of a fact without revealing the fact itself.',
    steps: [
      'A ZK proof lets a prover convince a verifier that a statement is true without revealing why.',
      'Properties: completeness, soundness, zero-knowledge.',
      'zk-SNARKs and Bulletproofs are efficient ZK proof systems used in blockchain contexts.',
      'Stellar uses ZK proofs to verify compliance without exposing sensitive data.',
    ],
  },
];

const quizzes = [
  {
    id: 1,
    question: 'What does a smaller ε (epsilon) value mean in differential privacy?',
    options: ['Weaker privacy', 'Stronger privacy', 'More noise removed', 'Faster computation'],
    answer: 1,
  },
  {
    id: 2,
    question: 'In MPC, what is the purpose of secret sharing?',
    options: [
      'Encrypt data with a public key',
      'Split data so no single party can reconstruct it alone',
      'Hash data for integrity checks',
      'Compress data for storage',
    ],
    answer: 1,
  },
  {
    id: 3,
    question: 'Which property ensures a ZK proof reveals nothing beyond the truth of the statement?',
    options: ['Completeness', 'Soundness', 'Zero-knowledge', 'Succinctness'],
    answer: 2,
  },
];

const glossary = [
  { term: 'Differential Privacy', def: 'A mathematical framework guaranteeing individual privacy in statistical datasets.' },
  { term: 'Epsilon (ε)', def: 'Privacy budget parameter — lower values provide stronger privacy guarantees.' },
  { term: 'MPC', def: 'Secure Multi-Party Computation — joint computation without revealing private inputs.' },
  { term: 'ZK Proof', def: 'Zero-Knowledge Proof — proves a statement is true without revealing underlying data.' },
  { term: 'Homomorphic Encryption', def: 'Encryption that allows computation on ciphertext, producing encrypted results.' },
  { term: 'Data Minimization', def: 'Collecting only the data strictly necessary for a given purpose.' },
  { term: 'k-Anonymity', def: 'Each record is indistinguishable from at least k-1 others on quasi-identifiers.' },
  { term: 'Sensitivity', def: 'Maximum change in a query result from adding/removing one individual.' },
];

export const PrivacyEducation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tutorials' | 'quiz' | 'glossary'>('tutorials');
  const [activeTutorial, setActiveTutorial] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [glossarySearch, setGlossarySearch] = useState('');

  const score = quizSubmitted
    ? quizzes.filter((q) => quizAnswers[q.id] === q.answer).length
    : 0;

  const filteredGlossary = glossary.filter(
    (g) =>
      g.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
      g.def.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  const tutorial = tutorials.find((t) => t.id === activeTutorial);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Privacy Education</h1>
          <p className="text-gray-600 mt-1">Learn privacy-preserving techniques through interactive tutorials</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
          <Award className="h-5 w-5" />
          {completed.size}/{tutorials.length} completed
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['tutorials', 'quiz', 'glossary'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'tutorials' && (
          <motion.div key="tutorials" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {activeTutorial === null ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tutorials.map((t) => (
                  <motion.div
                    key={t.id}
                    whileHover={{ scale: 1.02 }}
                    className="bg-white rounded-lg shadow p-5 cursor-pointer border border-gray-200 hover:border-blue-400 transition-colors"
                    onClick={() => { setActiveTutorial(t.id); setActiveStep(0); }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <BookOpen className="h-6 w-6 text-blue-500" />
                      {completed.has(t.id) && <CheckCircle className="h-5 w-5 text-green-500" />}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{t.title}</h3>
                    <p className="text-sm text-gray-600">{t.description}</p>
                    <div className="mt-3 flex items-center text-xs text-blue-600 font-medium">
                      Start <ChevronRight className="h-3 w-3 ml-1" />
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : tutorial ? (
              <div className="bg-white rounded-lg shadow p-6">
                <button
                  onClick={() => setActiveTutorial(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
                >
                  ← Back to tutorials
                </button>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{tutorial.title}</h2>
                <p className="text-gray-600 mb-6">{tutorial.description}</p>

                {/* Progress */}
                <div className="flex gap-2 mb-6">
                  {tutorial.steps.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i <= activeStep ? 'bg-blue-500' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-blue-50 rounded-lg p-5 mb-6"
                >
                  <p className="text-sm font-medium text-gray-500 mb-2">Step {activeStep + 1} of {tutorial.steps.length}</p>
                  <p className="text-gray-800">{tutorial.steps[activeStep]}</p>
                </motion.div>

                <div className="flex justify-between">
                  <button
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep((s) => s - 1)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  {activeStep < tutorial.steps.length - 1 ? (
                    <button
                      onClick={() => setActiveStep((s) => s + 1)}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setCompleted((prev) => new Set(prev).add(tutorial.id));
                        setActiveTutorial(null);
                      }}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                      <CheckCircle className="h-4 w-4" /> Complete
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </motion.div>
        )}

        {activeTab === 'quiz' && (
          <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {quizzes.map((q) => (
              <div key={q.id} className="bg-white rounded-lg shadow p-5">
                <p className="font-medium text-gray-900 mb-3">{q.question}</p>
                <div className="space-y-2">
                  {q.options.map((opt, i) => {
                    const selected = quizAnswers[q.id] === i;
                    const correct = quizSubmitted && i === q.answer;
                    const wrong = quizSubmitted && selected && i !== q.answer;
                    return (
                      <button
                        key={i}
                        disabled={quizSubmitted}
                        onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: i }))}
                        className={`w-full text-left px-4 py-2 rounded-lg border text-sm transition-colors flex items-center justify-between ${
                          correct ? 'border-green-500 bg-green-50 text-green-800' :
                          wrong ? 'border-red-500 bg-red-50 text-red-800' :
                          selected ? 'border-blue-500 bg-blue-50' :
                          'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {opt}
                        {correct && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {wrong && <XCircle className="h-4 w-4 text-red-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {!quizSubmitted ? (
              <button
                onClick={() => setQuizSubmitted(true)}
                disabled={Object.keys(quizAnswers).length < quizzes.length}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium"
              >
                Submit Quiz
              </button>
            ) : (
              <div className="bg-white rounded-lg shadow p-5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">Score: {score}/{quizzes.length}</p>
                  <p className="text-sm text-gray-600">{score === quizzes.length ? '🎉 Perfect score!' : 'Review the tutorials and try again.'}</p>
                </div>
                <button
                  onClick={() => { setQuizAnswers({}); setQuizSubmitted(false); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Retry
                </button>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'glossary' && (
          <motion.div key="glossary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search terms..."
                value={glossarySearch}
                onChange={(e) => setGlossarySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {filteredGlossary.map((g) => (
                <div key={g.term} className="px-5 py-4">
                  <p className="font-semibold text-gray-900 text-sm">{g.term}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{g.def}</p>
                </div>
              ))}
              {filteredGlossary.length === 0 && (
                <div className="px-5 py-8 text-center text-gray-500 text-sm">No terms found.</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
