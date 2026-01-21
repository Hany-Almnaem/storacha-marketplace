import type { Metadata } from 'next'
import { JetBrains_Mono, Outfit } from 'next/font/google'

import './globals.css'
import { Web3Provider } from '@/providers/Web3Provider'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Data Marketplace',
    template: '%s | Data Marketplace',
  },
  description:
    'Buy and sell datasets securely with encryption and blockchain payments.',
  keywords: ['data marketplace', 'decentralized', 'blockchain', 'datasets'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  )
}
