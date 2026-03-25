import { createContext, useContext } from 'react'
import { motion } from 'framer-motion'

interface MotionProviderProps {
  children: React.ReactNode
}

const MotionContext = createContext({})

export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionContext.Provider value={{}}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {children}
      </motion.div>
    </MotionContext.Provider>
  )
}

export function useMotion() {
  const context = useContext(MotionContext)
  return context
}
