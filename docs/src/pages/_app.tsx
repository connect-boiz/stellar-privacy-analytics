import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { MotionProvider } from '@/components/providers/MotionProvider'
import { SearchProvider } from '@/components/providers/SearchProvider'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MotionProvider>
      <SearchProvider>
        <Component {...pageProps} />
      </SearchProvider>
    </MotionProvider>
  )
}
