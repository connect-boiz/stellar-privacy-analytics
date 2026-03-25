import { motion } from 'framer-motion'
import { BookOpen, Users, BarChart3, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function LearningTracks() {
  const tracks = [
    {
      id: 'beginner',
      title: 'Beginner Track',
      description: 'Start your journey into privacy-preserving analytics with foundational concepts and practical examples.',
      icon: BookOpen,
      color: 'green',
      modules: [
        'Differential Privacy Basics',
        'SMPC Overview',
        'ZK Proofs Introduction',
        'Privacy Budget Fundamentals'
      ],
      duration: '2-3 hours',
      level: 'Beginner'
    },
    {
      id: 'provider',
      title: 'Data Provider Track',
      description: 'Learn how to securely share and manage data while maintaining privacy guarantees.',
      icon: Users,
      color: 'blue',
      modules: [
        'Privacy Query Language (PQL)',
        'Epsilon Budget Management',
        'Data Anonymization Techniques',
        'Secure Data Sharing'
      ],
      duration: '3-4 hours',
      level: 'Intermediate'
    },
    {
      id: 'analyst',
      title: 'Analyst Track',
      description: 'Master advanced techniques for privacy-preserving data analysis and interpretation.',
      icon: BarChart3,
      color: 'purple',
      modules: [
        'Advanced SMPC Protocols',
        'ZK Proof Applications',
        'Privacy-Preserving Machine Learning',
        'Statistical Analysis with Privacy'
      ],
      duration: '4-5 hours',
      level: 'Advanced'
    }
  ]

  return (
    <div className="grid md:grid-cols-3 gap-8">
      {tracks.map((track, index) => (
        <motion.div
          key={track.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: index * 0.1 }}
          className={`track-card ${track.id}`}
        >
          <div className="flex items-center mb-4">
            <div className={`p-3 bg-${track.color}-100 rounded-lg mr-4`}>
              <track.icon className={`w-6 h-6 text-${track.color}-600`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{track.title}</h3>
              <span className={`text-sm bg-${track.color}-100 text-${track.color}-800 px-2 py-1 rounded`}>
                {track.level}
              </span>
            </div>
          </div>

          <p className="text-gray-600 mb-4">{track.description}</p>

          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">What you'll learn:</h4>
            <ul className="space-y-1">
              {track.modules.map((module, idx) => (
                <li key={idx} className="text-sm text-gray-600 flex items-center">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2"></span>
                  {module}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">
              <span className="font-medium">Duration:</span> {track.duration}
            </span>
          </div>

          <Link href={`/tracks/${track.id}`}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full bg-${track.color}-600 text-white py-2 px-4 rounded-lg hover:bg-${track.color}-700 transition-colors flex items-center justify-center`}
            >
              Start Learning
              <ArrowRight className="w-4 h-4 ml-2" />
            </motion.button>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}
