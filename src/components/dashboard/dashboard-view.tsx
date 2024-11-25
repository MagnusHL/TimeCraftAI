'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Clock, AlertCircle } from 'lucide-react'
import type { DashboardData } from '@/lib/services/calendar-planner'
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

// Hilfsfunktion für konsistente Datumsformatierung
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

function TaskCard({ task, suggestion, isDueToday }: { 
  task: any, 
  suggestion: { newTitle: string; reason: string; estimatedDuration: number }, 
  isDueToday: boolean 
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="font-medium">{task.content}</p>
          {suggestion && (
            <p className="text-green-600">
              → {suggestion.newTitle}
            </p>
          )}
        </div>
        <Badge variant={isDueToday ? "default" : "destructive"}>
          {isDueToday ? "Heute fällig" : "Überfällig"}
        </Badge>
      </div>
      
      {suggestion && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Geschätzte Dauer: {suggestion.estimatedDuration} Minuten</span>
          </div>
          <Progress value={
            (suggestion.estimatedDuration / (8 * 60)) * 100
          } className="h-2" />
          <p className="text-sm text-gray-600 italic">
            {suggestion.reason}
          </p>
        </>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface LoadingStats {
  totalTasks?: number;
  processedTasks?: number;
  currentTask?: string;
  stage: 'init' | 'loading' | 'processing' | 'optimizing';
}

function LoadingOverlay({ stats }: { stats: LoadingStats }) {
  const stageMessages = {
    init: 'Initialisiere Dashboard...',
    loading: 'Lade Aufgaben...',
    processing: 'Verarbeite Aufgaben...',
    optimizing: 'Optimiere Aufgaben...'
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm">
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-[400px]">
          <CardContent className="pt-6 space-y-6">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-lg font-medium">{stageMessages[stats.stage]}</p>
            </div>

            {stats.totalTasks && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Aufgaben geladen</span>
                  <span>{stats.processedTasks || 0} / {stats.totalTasks}</span>
                </div>
                <Progress 
                  value={((stats.processedTasks || 0) / stats.totalTasks) * 100} 
                  className="h-2"
                />
              </div>
            )}

            {stats.currentTask && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Aktuelle Aufgabe:</p>
                <ScrollArea className="h-[60px] rounded-md border p-2">
                  <p className="text-sm">{stats.currentTask}</p>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingStats, setLoadingStats] = useState<LoadingStats>({ stage: 'init' })

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingStats({ stage: 'loading' })
        const response = await fetch('/api/dashboard')
        
        if (!response.ok) {
          throw new Error('Netzwerk-Antwort war nicht ok')
        }

        const eventSource = new EventSource('/api/dashboard/progress')
        eventSource.onmessage = (event) => {
          const progress = JSON.parse(event.data)
          setLoadingStats(progress)
        }

        const newData = await response.json()
        eventSource.close()
        
        if (newData.error) {
          throw new Error(newData.details || 'Unbekannter Fehler')
        }

        setData(newData)
        setLoadingStats({ stage: 'init' })
        setError(null)
      } catch (err) {
        console.error('Fehler beim Laden der Daten:', err)
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">Fehler beim Laden</p>
        </div>
        <p className="mt-2 text-sm text-red-500">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <>
        <LoadingOverlay stats={loadingStats} />
        <LoadingState />
      </>
    )
  }

  return (
    <Tabs defaultValue="tasks" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Übersicht</TabsTrigger>
        <TabsTrigger value="calendar">Kalender</TabsTrigger>
        <TabsTrigger value="tasks">Aufgaben</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Tagesübersicht</h3>
              <div className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Verfügbare Zeit heute: {data.totalFreeHours.toFixed(1)} Stunden</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{data.events.length} Termine heute</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{data.overdueTasks.length} offene Aufgaben</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="calendar">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Termine heute</h3>
              <div className="space-y-2">
                {data.events.map((event, i) => (
                  <div key={i} className="flex items-center justify-between border-b pb-2">
                    <span>{event.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatTime(new Date(event.start))} - {formatTime(new Date(event.end))}
                    </span>
                  </div>
                ))}
              </div>
              <h3 className="text-lg font-medium mt-6">Freie Zeitfenster</h3>
              <div className="space-y-2">
                {data.freeTimeSlots.map((slot, i) => (
                  <div key={i} className="flex items-center justify-between border-b pb-2">
                    <span>{(slot.duration / 60).toFixed(1)} Stunden frei</span>
                    <span className="text-sm text-muted-foreground">
                      {formatTime(new Date(slot.start))} - {formatTime(new Date(slot.end))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tasks">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-8">
              {/* Überfällige Aufgaben */}
              <div>
                <h3 className="text-lg font-medium text-red-600 mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Überfällige Aufgaben
                </h3>
                <div className="space-y-4">
                  {data.overdueTasks.map((task) => (
                    <TaskCard 
                      key={task.id}
                      task={task}
                      suggestion={data.taskSuggestions[task.id]}
                      isDueToday={false}
                    />
                  ))}
                </div>
              </div>

              {/* Heute fällige Aufgaben */}
              <div>
                <h3 className="text-lg font-medium text-blue-600 mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Heute fällige Aufgaben
                </h3>
                <div className="space-y-4">
                  {data.dueTodayTasks.map((task) => (
                    <TaskCard 
                      key={task.id}
                      task={task}
                      suggestion={data.taskSuggestions[task.id]}
                      isDueToday={true}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
} 