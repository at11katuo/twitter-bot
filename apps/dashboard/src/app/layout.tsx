import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hana 花 — Twitter Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-pink-900/40 bg-indigo-950/80 px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">🌸</span>
          <div>
            <h1 className="text-lg font-semibold text-pink-200">Hana 花</h1>
            <p className="text-xs text-slate-400">AI和装美女 Twitter Dashboard</p>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
