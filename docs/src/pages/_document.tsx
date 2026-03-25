import { Html, Head, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="description" content="Stellar Privacy Analytics Documentation - Learn about differential privacy, secure multi-party computation, and zero-knowledge proofs" />
        <meta name="keywords" content="privacy, cryptography, differential privacy, MPC, ZK proofs, documentation" />
        <meta name="author" content="Stellar Privacy Analytics Team" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Stellar Privacy Analytics Documentation" />
        <meta property="og:description" content="Comprehensive documentation for privacy-preserving analytics" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/og-image.png" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Stellar Privacy Analytics Documentation" />
        <meta name="twitter:description" content="Learn about privacy-preserving analytics" />
        <meta name="twitter:image" content="/twitter-image.png" />
        
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Service Worker Registration */}
        <Script id="service-worker" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                  console.log('SW registered: ', registration);
                })
                .catch((registrationError) => {
                  console.log('SW registration failed: ', registrationError);
                });
            }
          `}
        </Script>
      </Head>
      <body>
        <Main />
        <NextScript />
        
        {/* Analytics (if needed) */}
        {process.env.NODE_ENV === 'production' && (
          <Script id="analytics" strategy="afterInteractive">
            {`
              // Add analytics code here
            `}
          </Script>
        )}
      </body>
    </Html>
  )
}
