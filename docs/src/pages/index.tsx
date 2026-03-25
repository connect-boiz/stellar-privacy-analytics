import { GetStaticProps } from 'next'
import { motion } from 'framer-motion'
import { SearchBar } from '@/components/search/SearchBar'
import { LearningTracks } from '@/components/tracks/LearningTracks'
import { QuickStart } from '@/components/home/QuickStart'
import { FeaturedTopics } from '@/components/home/FeaturedTopics'
import { RecentUpdates } from '@/components/home/RecentUpdates'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            <span className="gradient-text">Stellar Privacy Analytics</span>
            <br />
            Documentation Portal
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Master differential privacy, secure multi-party computation, and zero-knowledge proofs 
            with our comprehensive, beginner-friendly documentation.
          </p>
          <SearchBar />
        </motion.div>

        {/* Learning Tracks */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Choose Your Learning Path
          </h2>
          <LearningTracks />
        </motion.section>

        {/* Quick Start */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-16"
        >
          <QuickStart />
        </motion.section>

        {/* Featured Topics */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Featured Topics
          </h2>
          <FeaturedTopics />
        </motion.section>

        {/* Recent Updates */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <RecentUpdates />
        </motion.section>
      </main>

      <Footer />
    </div>
  )
}

export const getStaticProps: GetStaticProps = async () => {
  // This would typically fetch data from a CMS or API
  return {
    props: {
      // Static props can be added here
    },
    revalidate: 3600, // Revalidate every hour
  }
}
