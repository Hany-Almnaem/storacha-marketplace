import { ConnectWallet } from '@/components/ConnectWallet'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function Home() {
  return (
    <main className="min-h-screen gradient-mesh">
      <div className="mx-auto max-w-7xl px-4 pt-10 flex items-center justify-end gap-3">
        <ThemeToggle />
        <ConnectWallet />
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="animate-fade-in text-center">
          <div className="mb-6 inline-flex items-center rounded-full bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400">
            <span className="animate-pulse-slow mr-2 h-2 w-2 rounded-full bg-brand-500" />
            Powered by Storacha & Base
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Decentralized
            <span className="block text-brand-500">Data Marketplace</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Buy and sell datasets with encryption-based access control. Your
            data, your keys, your rules.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <button className="btn-primary px-8 py-3 text-base">
              Browse Datasets
            </button>
            <button className="btn-outline px-8 py-3 text-base">
              Start Selling
            </button>
          </div>
        </div>

        <div className="animate-slide-up mt-24 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon="🔐"
            title="Encryption-First"
            description="AES-256-GCM encryption in your browser. Only buyers with the key can decrypt."
          />
          <FeatureCard
            icon="⛓️"
            title="On-Chain Payments"
            description="USDC payments on Base with 24-hour buyer protection."
          />
          <FeatureCard
            icon="🌐"
            title="Decentralized Storage"
            description="Datasets stored on Storacha/IPFS. No single point of failure."
          />
        </div>

        <div className="mt-16 rounded-xl border border-border bg-card/50 p-4 text-center backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">
            <strong>MVP v0.1</strong> — Development in progress
          </p>
        </div>
      </div>
    </main>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="card group">
      <div className="mb-4 text-4xl">{icon}</div>
      <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-brand-500">
        {title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
