'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Clock, AlertCircle } from 'lucide-react'
import type { DashboardData, TodoistTask, TaskSuggestion, TimeSlot } from '@/lib/services/calendar-planner'
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { StatusMenubar } from '@/components/status-menubar'
import { Button } from "@/components/ui/button"
import type { ProgressUpdate } from '@/app/api/dashboard/progress/route'

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

function TaskCard({ task, suggestions, isDueToday }: { 
  task: TodoistTask,
  suggestions: { 
    suggestions: Array<{
      newTitle: string;
      reason: string;
      estimatedDuration: number;
    }> 
  }, 
  isDueToday: boolean 
}) {
  return (
    <Accordion type="single" collapsible className="w-full border rounded-lg">
      <AccordionItem value="task" className="border-none">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex justify-between items-center w-full">
            <span className="font-medium text-left">{task.content}</span>
            <Badge variant={isDueToday ? "default" : "destructive"} className="ml-2">
              {isDueToday ? "Heute fällig" : "Überfällig"}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          {suggestions && (
            <Accordion type="single" collapsible className="w-full">
              {suggestions.suggestions.map((suggestion, index) => (
                <AccordionItem key={index} value={`suggestion-${index}`} className="border-b">
                  <AccordionTrigger className="text-green-600 hover:text-green-700 py-2">
                    Vorschlag {index + 1}: {suggestion.newTitle}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Geschätzte Dauer: {suggestion.estimatedDuration} Minuten</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {suggestion.reason}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
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
  const [isLoading, setIsLoading] = useState(false)
  const [loadedTasks, setLoadedTasks] = useState(0)
  const [lastContextUpdate, setLastContextUpdate] = useState<Date | null>(null)
  const [optimizedTasks, setOptimizedTasks] = useState<Record<string, TaskSuggestion>>({})

  const refreshDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/dashboard?force=true');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const newData = await response.json();
      if ('error' in newData) {
        throw new Error(newData.details || 'Unbekannter Fehler');
      }

      setData(newData);
      setLastContextUpdate(new Date());
      setOptimizedTasks({});
    } catch (err) {
      console.error('Refresh Fehler:', err);
      setError(err instanceof Error ? err.message : 'Ein unerwarteter Fehler ist aufgetreten');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      console.log('🔄 Starte initiales Laden...');
      try {
        const response = await fetch('/api/dashboard');
        console.log('📥 Response erhalten:', response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Daten geladen:', {
          events: data.events?.length,
          overdueTasks: data.overdueTasks?.length,
          dueTodayTasks: data.dueTodayTasks?.length
        });
        
        setData(data);
      } catch (error) {
        console.error('❌ Fehler beim Laden:', error);
        setError(error instanceof Error ? error.message : 'Unbekannter Fehler');
      }
    };

    loadInitialData();

    const setupEventSource = () => {
      console.log('🔌 Versuche EventSource Verbindung...');
      try {
        console.log('🔌 Verbinde mit EventSource...');
        eventSource = new EventSource('/api/dashboard/progress');
        
        eventSource.onmessage = (event) => {
          try {
            const progress = JSON.parse(event.data);
            console.log('📨 Progress Update erhalten:', progress);
            
            if (progress.stage === 'initial_data' && progress.data) {
              console.log('📝 Setze initiale Daten:', progress.data);
              setData(progress.data);
            }
            
            if (progress.stage === 'processing') {
              console.log('⚙️ Verarbeite Tasks:', progress.processedTasks);
              setLoadedTasks(progress.processedTasks || 0);
            }
            
            if (progress.optimizedTask) {
              console.log('✨ Neue optimierte Aufgabe:', progress.optimizedTask.id);
              setData(prevData => {
                if (!prevData) {
                  console.warn('❌ Keine vorherigen Daten vorhanden');
                  return prevData;
                }
                
                const newData = {
                  ...prevData,
                  taskSuggestions: {
                    ...prevData.taskSuggestions,
                    [progress.optimizedTask.id]: progress.optimizedTask.suggestions
                  }
                };
                console.log('📊 Aktualisierte Daten:', {
                  suggestions: Object.keys(newData.taskSuggestions).length
                });
                return newData;
              });
            }
          } catch (err) {
            console.error('❌ Event parsing error:', err);
          }
        };

        eventSource.onerror = (err) => {
          console.error('❌ EventSource Fehler:', err);
          eventSource?.close();
          setTimeout(setupEventSource, 5000);
        };

        eventSource.onopen = () => {
          console.log('✅ EventSource Verbindung hergestellt');
        };
      } catch (err) {
        console.error('❌ EventSource setup failed:', err);
      }
    };

    console.log('🔄 Starte initiales Setup...');
    setupEventSource();
    return () => {
      console.log('🔌 Schließe EventSource');
      eventSource?.close();
    };
  }, []);

  console.log('🎨 Render mit Daten:', {
    hasData: !!data,
    hasError: !!error,
    loadedTasks,
    lastUpdate: lastContextUpdate?.toISOString()
  });

  // Kombiniere die Daten für die Anzeige
  const displayData = useMemo(() => {
    if (!data) return null;
    
    return {
      ...data,
      taskSuggestions: {
        ...data.taskSuggestions,
        ...optimizedTasks
      }
    };
  }, [data, optimizedTasks]);

  // Zeige Fehler an
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">Fehler beim Laden</p>
        </div>
        <p className="mt-2 text-sm text-red-500">{error}</p>
        <Button 
          onClick={() => refreshDashboard()} 
          variant="outline" 
          size="sm" 
          className="mt-4"
        >
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <>
      <StatusMenubar
        loadedTasks={loadedTasks}
        lastContextUpdate={lastContextUpdate}
        isLoading={isLoading}
        onRefresh={refreshDashboard}
      />
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
                    <span>
                      Verfügbare Zeit heute: {
                        typeof displayData?.totalFreeHours === 'number' 
                          ? displayData.totalFreeHours.toFixed(1) 
                          : '0'
                      } Stunden
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{displayData?.events?.length || 0} Termine heute</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>
                      {(displayData?.overdueTasks?.length || 0) + 
                       (displayData?.dueTodayTasks?.length || 0)} offene Aufgaben
                    </span>
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
                  {displayData?.events?.map((event, i) => (
                    <div key={i} className="flex items-center justify-between border-b pb-2">
                      <span>{event.title}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatTime(new Date(event.start))} - {formatTime(new Date(event.end))}
                      </span>
                    </div>
                  ))}
                  {(!displayData?.events || displayData.events.length === 0) && (
                    <div className="text-sm text-muted-foreground">Keine Termine heute</div>
                  )}
                </div>
                <h3 className="text-lg font-medium mt-6">Freie Zeitfenster</h3>
                <div className="space-y-2">
                  {displayData?.freeTimeSlots?.map((slot, i) => (
                    <div key={i} className="flex items-center justify-between border-b pb-2">
                      <span>{(slot.duration / 60).toFixed(1)} Stunden frei</span>
                      <span className="text-sm text-muted-foreground">
                        {formatTime(new Date(slot.start))} - {formatTime(new Date(slot.end))}
                      </span>
                    </div>
                  ))}
                  {(!displayData?.freeTimeSlots || displayData.freeTimeSlots.length === 0) && (
                    <div className="text-sm text-muted-foreground">Keine freien Zeitfenster</div>
                  )}
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
                    {displayData?.overdueTasks?.map((task) => (
                      <TaskCard 
                        key={task.id}
                        task={task}
                        suggestions={displayData.taskSuggestions[task.id]}
                        isDueToday={false}
                      />
                    ))}
                    {(!displayData?.overdueTasks || displayData.overdueTasks.length === 0) && (
                      <div className="text-sm text-muted-foreground">Keine überfälligen Aufgaben</div>
                    )}
                  </div>
                </div>

                {/* Heute fällige Aufgaben */}
                <div>
                  <h3 className="text-lg font-medium text-blue-600 mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Heute fällige Aufgaben
                  </h3>
                  <div className="space-y-4">
                    {displayData?.dueTodayTasks?.map((task) => (
                      <TaskCard 
                        key={task.id}
                        task={task}
                        suggestions={displayData.taskSuggestions[task.id]}
                        isDueToday={true}
                      />
                    ))}
                    {(!displayData?.dueTodayTasks || displayData.dueTodayTasks.length === 0) && (
                      <div className="text-sm text-muted-foreground">Keine Aufgaben für heute</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
} 