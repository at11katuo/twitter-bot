import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hana 花 — Twitter Dashboard',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-pink-900/40 bg-indigo-950/80 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <span className="text-2xl">🌸</span>
          <div>
            <h1 className="text-base font-semibold text-pink-200 leading-tight">Hana 花</h1>
            <p className="text-xs text-slate-400">AI和装美女 Twitter Dashboard</p>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-3 py-4 sm:px-4 sm:py-8">{children}</main>
      </body>
    </html>
  )
}
