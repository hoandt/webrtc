"use client"
import { useEffect, useState } from 'react'
 

// These styles apply to every route in the application
import './globals.css'

 

// ClientOnly wrapper to ensure client-side rendering
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) return null // Don't render anything on the server
  return <>{children}</> // Render children once mounted
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {/* Ensure client-only rendering for the whole page */}
        <ClientOnly>{children}</ClientOnly>
      </body>
    </html>
  )
}
