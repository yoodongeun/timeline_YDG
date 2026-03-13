"use client"

import dynamic from "next/dynamic"

const TimelineView = dynamic(
  () => import("@/components/timeline-view").then((mod) => mod.TimelineView),
  { ssr: false }
)

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <TimelineView />
    </main>
  )
}
