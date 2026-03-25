import { motion } from 'framer-motion'
import { Rocket, BookOpen, Code, Users } from 'lucide-react'
import Link from 'next/link'

export function QuickStart() {
  const steps = [
    {
      icon: Rocket,
      title: 'Get Started in Minutes',
      description: 'Choose your learning track and begin your journey into privacy-preserving analytics.',
      action: 'Choose Your Track',
      href: '/tracks'
    },
    {
      icon: BookOpen,
      title: 'Learn the Basics',
      description: 'Master fundamental concepts like differential privacy, SMPC, and ZK proofs.',
      action: 'Start Learning',
      href: '/docs/beginner'
    },
    {
      icon: Code,
      title: 'Try PQL',
      description: 'Write your first Privacy Query Language queries and see results instantly.',
      action: 'Try Examples',
      href: '/docs/pql-examples'
    },
    {
      icon: Users,
      title: 'Join the Community',
      description: 'Connect with other developers and privacy experts in our community.',
      action: 'Join Discord',
      href: '/community'
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white rounded-xl shadow-lg p-8 border border-gray-200"
    >
      <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
        Quick Start Guide
      </h2>
      <p className="text-gray-600 text-center mb-8 max-w-2xl mx-auto">
        Get up and running with Stellar Privacy Analytics in just a few simple steps. 
        Whether you're a beginner or an experienced developer, we have a path for you.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className="flex items-start space-x-4 p-4 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0">
              <div className="p-3 bg-blue-100 rounded-lg">
                <step.icon className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {step.title}
              </h3>
              <p className="text-gray-600 mb-3">{step.description}</p>
              <Link href={step.href}>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
                >
                  {step.action}
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>
              </Link>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/docs/quick-start">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            View Full Documentation
          </motion.button>
        </Link>
      </div>
    </motion.div>
  )
}
