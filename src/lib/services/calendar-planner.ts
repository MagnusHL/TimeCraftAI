import { Client } from "@microsoft/microsoft-graph-client";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { ConfidentialClientApplication } from "@azure/msal-node";
import OpenAI from 'openai';
import "isomorphic-fetch";
import { Event } from "@microsoft/microsoft-graph-types";
import { emitProgress } from '@/app/api/dashboard/progress/route'
import { emitLog } from '@/app/api/logs/route'
import fs from 'fs/promises';
import path from 'path';

export interface TimeSlot {
  start: Date;
  end: Date;
  title: string;
  duration: number;
}

export interface TodoistTask {
  id: string;
  content: string;
  due?: {
    date: string;
    datetime?: string | null;
  } | null;
  priority: number;
  projectId: string;
}

export interface TaskSuggestion {
  suggestions: Array<{
    newTitle: string;
    reason: string;
    estimatedDuration: number;
  }>;
}

export interface DashboardData {
  timestamp: string;
  freeTimeSlots: TimeSlot[];
  totalFreeHours: number;
  overdueTasks: TodoistTask[];
  dueTodayTasks: TodoistTask[];
  events: TimeSlot[];
  taskSuggestions: Record<string, TaskSuggestion>;
  lastContextUpdate: Date | null;
  loadedTasksCount: number;
}

export class CalendarPlanner {
  private timeSlots: TimeSlot[] = [];
  private todoistTasks: TodoistTask[] = [];
  private allTasksContext: string = '';
  private lastContextUpdate: number = 0;
  private readonly CONTEXT_UPDATE_INTERVAL = 5 * 60 * 1000;
  private msGraphClient: Client | null = null;
  private todoistApi: TodoistApi;
  private openai: OpenAI;
  private lastSuggestionsUpdate: Date | null = null;
  private taskSuggestionsCache: Record<string, TaskSuggestion> = {};
  private readonly CACHE_FILE = path.join(process.cwd(), 'data', 'suggestions-cache.json');
  
  constructor() {
    this.todoistApi = new TodoistApi(process.env.TODOIST_API_TOKEN || '');
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.loadCacheFromDisk().catch(console.error);
  }

  private async loadCacheFromDisk() {
    try {
      // Stelle sicher, dass das Verzeichnis existiert
      await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
      
      const cacheExists = await fs.access(this.CACHE_FILE)
        .then(() => true)
        .catch(() => false);

      if (cacheExists) {
        const cacheData = await fs.readFile(this.CACHE_FILE, 'utf-8');
        this.taskSuggestionsCache = JSON.parse(cacheData);
        emitLog({ message: `Cache geladen: ${Object.keys(this.taskSuggestionsCache).length} Optimierungen`, emoji: '💾' });
      } else {
        emitLog({ message: 'Kein Cache gefunden, starte mit leerem Cache', emoji: '🆕' });
      }
    } catch (error) {
      console.error('Fehler beim Laden des Caches:', error);
      emitLog({ message: 'Fehler beim Laden des Caches', emoji: '❌' });
    }
  }

  private async saveCacheToDisk() {
    try {
      await fs.writeFile(
        this.CACHE_FILE,
        JSON.stringify(this.taskSuggestionsCache, null, 2),
        'utf-8'
      );
      emitLog({ message: 'Cache gespeichert', emoji: '💾' });
    } catch (error) {
      console.error('Fehler beim Speichern des Caches:', error);
      emitLog({ message: 'Fehler beim Speichern des Caches', emoji: '❌' });
    }
  }

  public async initialize() {
    await this.initializeMsGraphClient();
  }

  private async initializeMsGraphClient() {
    const msalConfig = {
      auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`
      }
    };

    const cca = new ConfidentialClientApplication(msalConfig);
    
    try {
      const authResult = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default']
      });

      if (authResult?.accessToken) {
        this.msGraphClient = Client.init({
          authProvider: (done) => {
            done(null, authResult.accessToken);
          }
        });
      }
    } catch (error) {
      console.error('MS Graph Auth Error:', error);
    }
  }

  public async loadCalendarData() {
    if (!this.msGraphClient) {
      throw new Error('MS Graph Client nicht initialisiert');
    }

    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      const response = await this.msGraphClient
        .api(`/users/${process.env.MS_USER_EMAIL}/calendar/events`)
        .select('subject,start,end')
        .filter(`start/dateTime ge '${startOfDay}' and end/dateTime le '${endOfDay}'`)
        .get();

      this.timeSlots = response.value.map((event: Event) => ({
        start: new Date(event.start?.dateTime || ''),
        end: new Date(event.end?.dateTime || ''),
        title: event.subject || '',
        duration: this.calculateDuration(
          new Date(event.start?.dateTime || ''),
          new Date(event.end?.dateTime || '')
        )
      }));
    } catch (error) {
      console.error('Kalenderdaten Fehler:', error);
      throw error;
    }
  }

  public async loadTodoistTasks() {
    try {
      const tasks = await this.todoistApi.getTasks();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      emitLog({ message: `Lade ${tasks.length} Todoist Tasks...`, emoji: '📝' });
      
      const overdue: TodoistTask[] = [];
      const dueToday: TodoistTask[] = [];

      for (const task of tasks) {
        if (task.due) {
          const dueDate = new Date(task.due.date);
          dueDate.setHours(0, 0, 0, 0);
          
          const mappedTask = {
            id: task.id,
            content: task.content,
            due: {
              date: task.due.date,
              datetime: task.due.datetime
            },
            priority: task.priority,
            projectId: task.projectId
          };

          if (dueDate < today) {
            emitLog({ message: `Überfällige Aufgabe gefunden: ${task.content}`, emoji: '⏰' });
            overdue.push(mappedTask);
          } else if (dueDate.getTime() === today.getTime()) {
            emitLog({ message: `Heute fällige Aufgabe gefunden: ${task.content}`, emoji: '📅' });
            dueToday.push(mappedTask);
          }
        }
      }

      emitLog({ 
        message: `Gefunden: ${overdue.length} überfällige, ${dueToday.length} heute fällige Tasks`, 
        emoji: '✓' 
      });

      // Speichere alle Tasks für den Kontext
      this.todoistTasks = tasks.map(task => ({
        id: task.id,
        content: task.content,
        due: task.due ? {
          date: task.due.date,
          datetime: task.due.datetime
        } : null,
        priority: task.priority,
        projectId: task.projectId
      }));

      return { overdue, dueToday };
    } catch (error) {
      console.error('Todoist Fehler:', error);
      throw error;
    }
  }

  public findFreeTimeSlots(): TimeSlot[] {
    const today = new Date();
    const workStart = new Date(today.setHours(parseInt(process.env.WORK_BEGIN || '9'), 0, 0, 0));
    const workEnd = new Date(today.setHours(parseInt(process.env.WORK_END || '17'), 0, 0, 0));
    
    const todayEvents = this.timeSlots.filter(slot => {
      const eventDate = new Date(slot.start);
      return eventDate.toDateString() === today.toDateString();
    });

    const freeSlots: TimeSlot[] = [];
    let currentTime = workStart;

    todayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    for (const slot of todayEvents) {
      if (currentTime < slot.start) {
        freeSlots.push({
          start: currentTime,
          end: slot.start,
          title: 'Frei',
          duration: this.calculateDuration(currentTime, slot.start)
        });
      }
      currentTime = slot.end;
    }

    if (currentTime < workEnd) {
      freeSlots.push({
        start: currentTime,
        end: workEnd,
        title: 'Frei',
        duration: this.calculateDuration(currentTime, workEnd)
      });
    }

    return freeSlots;
  }

  private async updateTaskContext() {
    const now = Date.now();
    if (now - this.lastContextUpdate > this.CONTEXT_UPDATE_INTERVAL || !this.allTasksContext) {
      emitLog({ message: 'Starte Kontext-Update...', emoji: '🔄' });
      emitProgress({ stage: 'loading', taskCount: 0 });
      
      emitLog({ message: 'Lade Todoist Tasks...', emoji: '📥' });
      const tasks = await this.todoistApi.getTasks();
      emitLog({ message: `Gefunden: ${tasks.length} Tasks`, emoji: '📊' });
      
      emitProgress({ 
        stage: 'processing', 
        taskCount: tasks.length,
        processedTasks: 0 
      });

      this.todoistTasks = [];
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        this.todoistTasks.push({
          id: task.id,
          content: task.content,
          due: task.due ? {
            date: task.due.date,
            datetime: task.due.datetime
          } : null,
          priority: task.priority,
          projectId: task.projectId
        });

        emitLog({ message: `Verarbeite Task ${i + 1}/${tasks.length}: ${task.content.substring(0, 50)}...`, emoji: '✓' });
        emitProgress({ 
          stage: 'processing', 
          taskCount: tasks.length,
          processedTasks: i + 1,
          currentTask: task.content
        });

        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      emitLog({ message: 'Erstelle Kontext-String...', emoji: '📝' });
      this.allTasksContext = this.todoistTasks
        .map(t => `- ${t.content}`)
        .join('\n');
      
      this.lastContextUpdate = now;
      emitLog({ message: 'Kontext-Update abgeschlossen', emoji: '✅' });
      emitProgress({ 
        stage: 'complete', 
        taskCount: this.todoistTasks.length,
        processedTasks: this.todoistTasks.length
      });
    } else {
      emitLog({ message: 'Kontext ist noch aktuell, überspringe Update', emoji: 'ℹ️' });
    }
  }

  public async suggestOptimizations(): Promise<Record<string, TaskSuggestion>> {
    emitLog({ message: 'Starte Optimierungen...', emoji: '🤖' });
    await this.updateTaskContext();
    
    const { overdue, dueToday } = await this.loadTodoistTasks();
    const allRelevantTasks = [...overdue, ...dueToday];
    
    // Prüfe Cache-Vollständigkeit
    const cachedTaskIds = new Set(Object.keys(this.taskSuggestionsCache));
    const relevantTaskIds = new Set(allRelevantTasks.map(task => task.id));
    
    // Finde Tasks die im Cache fehlen
    const missingTasks = allRelevantTasks.filter(task => !cachedTaskIds.has(task.id));
    // Finde verwaiste Cache-Einträge (optional: Aufräumen)
    const orphanedCacheEntries = [...cachedTaskIds].filter(id => !relevantTaskIds.has(id));

    emitLog({ 
      message: `Cache Status:
      - ${cachedTaskIds.size} Tasks im Cache
      - ${missingTasks.length} Tasks fehlen
      - ${orphanedCacheEntries.length} verwaiste Cache-Einträge`, 
      emoji: '📊' 
    });

    // Entferne verwaiste Cache-Einträge
    orphanedCacheEntries.forEach(id => {
      delete this.taskSuggestionsCache[id];
    });
    
    if (missingTasks.length > 0) {
      emitLog({ 
        message: `Optimiere ${missingTasks.length} fehlende Tasks...`, 
        emoji: '🔄' 
      });
      
      // Optimiere nur die fehlenden Tasks
      for (let i = 0; i < missingTasks.length; i++) {
        const task = missingTasks[i];
        emitLog({ message: `Optimiere Task ${i + 1}/${missingTasks.length}: ${task.content}`, emoji: '🔄' });
        
        try {
          const systemPrompt = `Du bist ein Experte für die Optimierung von Aufgabenbeschreibungen. 
Antworte ausschließlich im JSON-Format mit einem optimierten Titel und einer Begründung.`;

          const userPrompt = `Analysiere diese Aufgabe und erstelle ein JSON mit Vorschlägen zur Optimierung:

Aktuelle Aufgabe: "${task.content}"

Kontext - Andere Aufgaben:
${this.allTasksContext}

Erstelle ein JSON-Objekt mit 'suggestions' Array, das 5 verschiedene Vorschläge enthält.
Jeder Vorschlag soll 'newTitle', 'reason' und 'estimatedDuration' enthalten.`;

          const completion = await this.openai.chat.completions.create({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
            temperature: 0.7,
            max_tokens: 500,
            response_format: { type: "json_object" }
          });

          const suggestion = JSON.parse(completion.choices[0].message.content || '{}');
          this.taskSuggestionsCache[task.id] = suggestion;
          
          // Speichere nach jeder neuen Optimierung
          await this.saveCacheToDisk();
          
          emitProgress({ 
            stage: 'optimizing',
            taskCount: missingTasks.length,
            processedTasks: i + 1,
            currentTask: task.content,
            optimizedTask: {
              id: task.id,
              suggestions: suggestion
            }
          });

          await new Promise(resolve => setTimeout(resolve, 200));
          
          emitLog({ message: `Optimierung für "${task.content}" abgeschlossen`, emoji: '✓' });
        } catch (error) {
          console.error(`Fehler bei Task "${task.content}":`, error);
          emitLog({ message: `Fehler bei Task "${task.content}"`, emoji: '❌' });
          continue;
        }
      }
    } else {
      emitLog({ message: 'Alle relevanten Tasks sind bereits optimiert', emoji: '✅' });
    }

    // Speichere finalen Cache-Zustand
    await this.saveCacheToDisk();
    
    return this.taskSuggestionsCache;
  }

  private calculateDuration(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  }

  public getTodoistTasks() {
    return this.todoistTasks;
  }

  public getTimeSlots() {
    return this.timeSlots;
  }

  private async shouldUpdateSuggestions(): Promise<boolean> {
    if (!this.lastSuggestionsUpdate) return true;
    
    const now = new Date();
    const lastUpdate = this.lastSuggestionsUpdate;
    
    // Update wenn:
    // - Erster Start
    // - Tageswechsel
    return !this.lastSuggestionsUpdate ||
           lastUpdate.getDate() !== now.getDate() ||
           lastUpdate.getMonth() !== now.getMonth() ||
           lastUpdate.getFullYear() !== now.getFullYear();
  }

  public async updateContextInBackground() {
    try {
      await this.updateTaskContext();
      return {
        success: true,
        taskCount: this.todoistTasks.length,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Background Update Fehler:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async getDashboardData(forceUpdate = false): Promise<DashboardData> {
    emitLog({ message: `Lade Dashboard Daten${forceUpdate ? ' (erzwungen)' : ''}...`, emoji: '🔄' });
    
    // Erst Kalender und Zeitberechnung
    emitLog({ message: 'Lade Kalenderdaten...', emoji: '📅' });
    await this.loadCalendarData();
    
    emitLog({ message: 'Berechne freie Zeitfenster...', emoji: '⏰' });
    const freeTimeSlots = this.findFreeTimeSlots();
    const totalFreeHours = freeTimeSlots.reduce((acc, slot) => acc + slot.duration / 60, 0);
    
    // Lade aktuelle Tasks
    emitLog({ message: 'Lade Todoist Tasks...', emoji: '📝' });
    const { overdue, dueToday } = await this.loadTodoistTasks();
    
    // Prüfe, ob alle relevanten Tasks optimiert sind
    const allRelevantTasks = [...overdue, ...dueToday];
    const unoptimizedTasks = allRelevantTasks.filter(
      task => !this.taskSuggestionsCache[task.id]
    );

    emitLog({ 
      message: `Cache Status: ${allRelevantTasks.length} relevante Tasks, ${unoptimizedTasks.length} nicht optimiert`, 
      emoji: '📊' 
    });
    
    // Sende die initialen Daten sofort
    const initialData: DashboardData = {
      timestamp: new Date().toISOString(),
      freeTimeSlots,
      totalFreeHours,
      overdueTasks: overdue,
      dueTodayTasks: dueToday,
      events: this.getTimeSlots(),
      taskSuggestions: this.taskSuggestionsCache,
      lastContextUpdate: new Date(this.lastContextUpdate),
      loadedTasksCount: this.todoistTasks.length
    };

    // Sende die initialen Daten ans Frontend
    emitProgress({
      stage: 'initial_data',
      data: initialData,
      taskCount: overdue.length + dueToday.length,
      processedTasks: 0
    });
    
    // Aktualisiere den Kontext
    await this.updateTaskContext();
    
    // Optimiere wenn nötig
    if (forceUpdate || unoptimizedTasks.length > 0) {
      emitLog({ 
        message: forceUpdate 
          ? 'Erzwinge neue Optimierungen...' 
          : `Optimiere ${unoptimizedTasks.length} fehlende Tasks...`, 
        emoji: '🤖' 
      });
      await this.suggestOptimizations();
      this.lastSuggestionsUpdate = new Date();
    } else {
      emitLog({ message: 'Alle Tasks sind bereits optimiert', emoji: '✅' });
    }
    
    emitLog({ message: 'Dashboard Daten vollständig geladen', emoji: '✅' });
    
    // Sende die finalen Daten
    return {
      ...initialData,
      taskSuggestions: this.taskSuggestionsCache
    };
  }
} 