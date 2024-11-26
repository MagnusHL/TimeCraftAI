'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Clock, AlertCircle, Check } from 'lucide-react'
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
import { cn } from "@/lib/utils"
import { Terminal, FileText, LayoutDashboard, Calendar, CheckSquare, Settings } from "lucide-react"
import type { LogEntry } from '@/types/logs';
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { DatePicker } from "@/components/date-picker"

// Hilfsfunktion für konsistente Datumsformatierung
const formatTime = (date: Date | string) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const formatDate = (date: Date | string) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Hilfsfunktion für die Datumsformatierung
const formatDateForDisplay = (date: Date) => {
  return format(date, "d. MMMM yyyy", { locale: de });
};

function TaskCard({ task, suggestions, isDueToday, onTitleUpdate }: { 
  task: TodoistTask,
  suggestions: { 
    suggestions: Array<{
      newTitle: string;
      reason: string;
      estimatedDuration: number;
    }> 
  } | undefined,
  isDueToday: boolean,
  onTitleUpdate: (taskId: string, newTitle: string) => Promise<void>
}) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null); // Speichert die ID des aktuell aktualisierten Vorschlags

  // Zeige keine Vorschläge für optimierte Tasks
  if (task.optimized) {
    return (
      <div className="w-full border rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-medium">{task.content}</span>
            <Badge variant="success" className="bg-green-100 text-green-800">
              Optimiert
            </Badge>
          </div>
          <Badge variant={isDueToday ? "default" : "destructive"}>
            {isDueToday ? "Heute fällig" : "Überfällig"}
          </Badge>
        </div>
      </div>
    );
  }

  const handleTitleUpdate = async (suggestionIndex: number) => {
    if (!suggestions) return;
    
    const suggestion = suggestions.suggestions[suggestionIndex];
    setIsUpdating(suggestionIndex.toString());
    
    try {
      await onTitleUpdate(task.id, suggestion.newTitle);
      // Erfolg wird durch Parent-Komponente gehandhabt
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Titels:', error);
      // Optional: Zeige Fehlermeldung
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <Accordion type="single" collapsible className="w-full border rounded-lg">
      <AccordionItem value="task" className="border-none">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <span className="font-medium text-left">{task.content}</span>
              {!suggestions && <Loader2 className="h-4 w-4 animate-spin" />}
              {task.optimized && (
                <Badge variant="secondary" className="ml-2">
                  Optimiert
                </Badge>
              )}
            </div>
            <Badge variant={isDueToday ? "default" : "destructive"} className="ml-2">
              {isDueToday ? "Heute fällig" : "Überfällig"}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          {suggestions ? (
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
                    <Button
                      onClick={() => handleTitleUpdate(index)}
                      disabled={!!isUpdating}
                      className="w-full mt-2"
                      variant="secondary"
                    >
                      {isUpdating === index.toString() ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Wird übernommen...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Vorschlag übernehmen
                        </>
                      )}
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Optimiere Aufgabe...</span>
            </div>
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

function Sidebar({ activeTab, onTabChange, isLoading }: { 
  activeTab: string;
  onTabChange: (tab: string) => void;
  isLoading: boolean;
}) {
  return (
    <div className="w-48 border-r h-screen flex flex-col">
      {/* Navigation */}
      <div className="flex-1 pt-2">
        <div>
          <h2 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-tight mb-1">
            Navigation
          </h2>
          <div className="space-y-0.5">
            <Button
              variant={activeTab === "overview" ? "secondary" : "ghost"}
              className="w-full justify-start h-8 text-sm"
              onClick={() => onTabChange("overview")}
            >
              <LayoutDashboard className="mr-2 h-3 w-3" />
              Übersicht
            </Button>
            <Button
              variant={activeTab === "calendar" ? "secondary" : "ghost"}
              className="w-full justify-start h-8 text-sm"
              onClick={() => onTabChange("calendar")}
            >
              <Calendar className="mr-2 h-3 w-3" />
              Kalender
            </Button>
            <Button
              variant={activeTab === "tasks" ? "secondary" : "ghost"}
              className="w-full justify-start h-8 text-sm"
              onClick={() => onTabChange("tasks")}
            >
              <CheckSquare className="mr-2 h-3 w-3" />
              Aufgaben
            </Button>
          </div>
        </div>
      </div>

      {/* Debug Tools */}
      <div className="border-t border-muted mt-2 pb-2">
        <h2 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-tight mb-1">
          Debug
        </h2>
        <div className="space-y-0.5">
          <Button
            variant={activeTab === "logs" ? "secondary" : "ghost"}
            className="w-full justify-start h-8 text-sm"
            onClick={() => onTabChange("logs")}
          >
            <Terminal className="mr-2 h-3 w-3" />
            System Logs
          </Button>
          <Button
            variant={activeTab === "context" ? "secondary" : "ghost"}
            className="w-full justify-start h-8 text-sm"
            onClick={() => onTabChange("context")}
          >
            <FileText className="mr-2 h-3 w-3" />
            Kontext
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedTasks, setLoadedTasks] = useState(0);
  const [lastContextUpdate, setLastContextUpdate] = useState<Date | null>(null);
  const [optimizedTasks, setOptimizedTasks] = useState<Record<string, TaskSuggestion>>({});
  const [activeTab, setActiveTab] = useState("overview");
  const [context, setContext] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  // Hilfsfunktion zum Prüfen ob ein Datum heute ist
  const isToday = (date: Date) => {
    const today = new Date()
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
  }

  // Vereinfachte handleDateChange Funktion
  const handleDateChange = useCallback(async (newDate: Date) => {
    console.log('Neues Datum ausgewählt:', newDate)
    setSelectedDate(newDate)
    
    try {
      setIsLoading(true)
      // Nur die Daten für den spezifischen Tag laden
      const response = await fetch(`/api/dashboard/daily?date=${newDate.toISOString()}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const newData = await response.json();
      setData(newData);
    } catch (error) {
      console.error('Fehler beim Laden der Tagesdaten:', error);
      setError(error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial Setup (nur einmal beim Start)
  useEffect(() => {
    handleDateChange(new Date());
  }, []);

  // EventSource setup effect
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const setupEventSource = () => {
      console.log('🔌 Verbinde mit EventSource...');
      eventSource = new EventSource('/api/dashboard/progress');
      
      eventSource.onmessage = (event) => {
        try {
          const progress = JSON.parse(event.data);
          console.log('📨 Progress Update erhalten:', progress);
          
          // Initial-Daten oder Task-Updates
          if ((progress.stage === 'initial_data' || progress.stage === 'processing') && progress.data) {
            console.log('📝 Setze Daten:', progress.data);
            setData(progress.data);
            // Aktualisiere lastContextUpdate wenn vorhanden
            if (progress.data.lastContextUpdate) {
              setLastContextUpdate(new Date(progress.data.lastContextUpdate));
            }
          }
          
          // Task-Verarbeitung
          if (progress.stage === 'processing') {
            console.log('⚙️ Verarbeite Tasks:', progress.processedTasks);
            setLoadedTasks(progress.processedTasks || 0);
          }

          // Kontext-Update abgeschlossen
          if (progress.stage === 'complete') {
            setLastContextUpdate(new Date());
          }
          
          // Neue optimierte Aufgabe
          if (progress.optimizedTask) {
            console.log('✨ Neue optimierte Aufgabe:', progress.optimizedTask);
            setData(prevData => {
              if (!prevData) return prevData;
              
              return {
                ...prevData,
                taskSuggestions: {
                  ...prevData.taskSuggestions,
                  [progress.optimizedTask.id]: progress.optimizedTask.suggestions
                }
              };
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
    };

    setupEventSource();

    return () => {
      eventSource?.close();
    };
  }, []);

  // Debug-Log für den aktuellen Zustand
  useEffect(() => {
    if (data) {
      console.log('📊 Aktueller Datenstand:', {
        overdueTasks: data.overdueTasks?.length || 0,
        dueTodayTasks: data.dueTodayTasks?.length || 0,
        suggestions: Object.keys(data.taskSuggestions || {}).length,
        tasks: [
          ...(data.overdueTasks || []),
          ...(data.dueTodayTasks || [])
        ].map(t => ({
          id: t.id,
          content: t.content,
          hasSuggestions: !!(data.taskSuggestions || {})[t.id]
        }))
      });
    }
  }, [data]);

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

  // Kontext-Management
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    const updateContext = async () => {
      try {
        const response = await fetch('/api/dashboard/context');
        const data = await response.json();
        setContext(data.context);
        setLastContextUpdate(new Date());
      } catch (error) {
        console.error('Fehler beim Kontext-Update:', error);
      }
    };

    // Initial und dann alle 5 Minuten
    updateContext();
    intervalId = setInterval(updateContext, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleTitleUpdate = useCallback(async (taskId: string, newTitle: string) => {
    try {
      const response = await fetch('/api/todoist/update-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          newTitle,
        }),
      });

      if (!response.ok) throw new Error('Fehler beim Aktualisieren der Aufgabe');

      // Aktualisiere lokalen State
      setData(prevData => {
        if (!prevData) return prevData;

        const updateTaskInList = (tasks: TodoistTask[]) =>
          tasks.map(task => 
            task.id === taskId 
              ? { ...task, content: newTitle, optimized: true }
              : task
          );

        return {
          ...prevData,
          overdueTasks: updateTaskInList(prevData.overdueTasks),
          dueTodayTasks: updateTaskInList(prevData.dueTodayTasks),
          taskSuggestions: {
            ...prevData.taskSuggestions,
            [taskId]: undefined // Entferne die Vorschläge für diese Aufgabe
          }
        };
      });
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Titels:', error);
      throw error;
    }
  }, []);

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

  useEffect(() => {
    const eventSource = new EventSource('/api/logs');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Ignoriere Ping-Nachrichten
        if (data.type === 'ping') return;
        
        setLogs(prev => [...prev, {
          timestamp: new Date(),
          message: data.message,
          emoji: data.emoji
        }]);
      } catch (err) {
        console.error('Log parsing error:', err);
      }
    };

    return () => eventSource.close();
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isLoading={isLoading}
      />
      
      <main className="flex-1 overflow-auto">
        {/* Übersicht */}
        <div className={cn(
          "p-4",
          activeTab === "overview" && "block",
          activeTab !== "overview" && "hidden"
        )}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Tagesübersicht</h2>
            
            <div className="flex items-center gap-2">
              <DatePicker 
                date={selectedDate}
                onDateChange={handleDateChange}
              />
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateChange(new Date())}
                disabled={isToday(selectedDate)}
              >
                Heute
              </Button>
            </div>
          </div>
          
          {/* Statistik-Karten */}
          <div className="grid gap-6 md:grid-cols-3 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <h3 className="font-medium">Verfügbare Zeit</h3>
                </div>
                <p className="text-2xl font-bold mt-2">
                  {displayData?.totalFreeHours.toFixed(1) || '0'} Stunden
                </p>
              </CardContent>
            </Card>

            {/* Überfällige Aufgaben nur anzeigen wenn heute */}
            {isToday(selectedDate) && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <h3 className="font-medium">Überfällige Aufgaben</h3>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {displayData?.overdueTasks?.length || 0}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-green-500" />
                  <h3 className="font-medium">Fällig am {formatDateForDisplay(selectedDate)}</h3>
                </div>
                <p className="text-2xl font-bold mt-2">
                  {displayData?.dueTodayTasks?.length || 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Kombinierte Ansicht */}
          <div className="flex gap-6">
            {/* Kalender-Bereich (1/3) */}
            <div className="w-1/3">
              <h3 className="text-lg font-medium mb-4">Termine am {formatDateForDisplay(selectedDate)}</h3>
              <div className="space-y-2">
                {displayData?.events?.map((event, i) => (
                  <div key={i} className="flex flex-col p-3 border rounded-lg hover:bg-muted/50">
                    <div className="text-sm font-medium text-muted-foreground">
                      {formatTime(new Date(event.start))} - {formatTime(new Date(event.end))}
                    </div>
                    <div className="font-medium">{event.title}</div>
                  </div>
                ))}
                {(!displayData?.events || displayData.events.length === 0) && (
                  <p className="text-muted-foreground">Keine Termine heute</p>
                )}
              </div>
            </div>

            {/* Aufgaben-Bereich (2/3) */}
            <div className="w-2/3 space-y-6">
              {/* Überfällige Aufgaben nur wenn heute */}
              {isToday(selectedDate) && displayData?.overdueTasks?.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-red-600 mb-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Überfällige Aufgaben
                  </h3>
                  <div className="space-y-2">
                    {displayData?.overdueTasks?.map((task) => (
                      <TaskCard 
                        key={task.id}
                        task={task}
                        suggestions={displayData.taskSuggestions[task.id]}
                        isDueToday={false}
                        onTitleUpdate={handleTitleUpdate}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Fällige Aufgaben */}
              <div>
                <h3 className="text-lg font-medium text-blue-600 mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Fällig am {formatDateForDisplay(selectedDate)}
                </h3>
                <div className="space-y-2">
                  {displayData?.dueTodayTasks?.map((task) => (
                    <TaskCard 
                      key={task.id}
                      task={task}
                      suggestions={displayData.taskSuggestions[task.id]}
                      isDueToday={true}
                      onTitleUpdate={handleTitleUpdate}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Kalender */}
        <div className={cn(activeTab === "calendar" && "block", activeTab !== "calendar" && "hidden")}>
          <Card>
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-6">Kalender</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Termine heute</h3>
                  <div className="space-y-2">
                    {displayData?.events?.map((event, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                        <span className="font-medium">{event.title}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatTime(new Date(event.start))} - {formatTime(new Date(event.end))}
                        </span>
                      </div>
                    ))}
                    {(!displayData?.events || displayData.events.length === 0) && (
                      <p className="text-muted-foreground">Keine Termine heute</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-4">Freie Zeitfenster</h3>
                  <div className="space-y-2">
                    {displayData?.freeTimeSlots?.map((slot, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                        <span className="font-medium">{(slot.duration / 60).toFixed(1)} Stunden frei</span>
                        <span className="text-sm text-muted-foreground">
                          {formatTime(new Date(slot.start))} - {formatTime(new Date(slot.end))}
                        </span>
                      </div>
                    ))}
                    {(!displayData?.freeTimeSlots || displayData.freeTimeSlots.length === 0) && (
                      <p className="text-muted-foreground">Keine freien Zeitfenster</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Aufgaben */}
        <div className={cn(activeTab === "tasks" && "block", activeTab !== "tasks" && "hidden")}>
          <Card>
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-6">Aufgaben</h2>
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
                        onTitleUpdate={handleTitleUpdate}
                      />
                    ))}
                    {(!displayData?.overdueTasks || displayData.overdueTasks.length === 0) && (
                      <p className="text-muted-foreground">Keine überfälligen Aufgaben</p>
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
                        onTitleUpdate={handleTitleUpdate}
                      />
                    ))}
                    {(!displayData?.dueTodayTasks || displayData.dueTodayTasks.length === 0) && (
                      <p className="text-muted-foreground">Keine Aufgaben für heute</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Logs */}
        <div className={cn(activeTab === "logs" && "block", activeTab !== "logs" && "hidden")}>
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">System Logs</h2>
              <div className="text-sm text-muted-foreground">
                {logs.length} Einträge
              </div>
            </div>
            <div className="space-y-1">
              {[...logs].reverse().map((log, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-2 py-1 border-b last:border-0 hover:bg-muted/50 rounded px-2"
                >
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {log.timestamp.toLocaleTimeString()}
                  </div>
                  <div className="w-6 text-center flex-shrink-0">
                    {log.emoji}
                  </div>
                  <div className="flex-1 text-sm">
                    {log.message}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Kontext */}
        <div className={cn(activeTab === "context" && "block", activeTab !== "context" && "hidden")}>
          <div className="p-4">
            <h2 className="text-xl font-semibold mb-4">Aktueller Kontext</h2>
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {context}
            </pre>
          </div>
        </div>
      </main>
    </div>
  )
} 