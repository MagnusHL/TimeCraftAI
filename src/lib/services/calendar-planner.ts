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
import { suggestOptimizations } from './task-optimizer'

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
  optimized?: boolean;
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
  private contextUpdateInterval = 5 * 60 * 1000; // 5 Minuten
  private contextUpdateTimer: NodeJS.Timeout | null = null;
  private msGraphClient: Client | null = null;
  private todoistApi: TodoistApi;
  private openai: OpenAI;
  private lastSuggestionsUpdate: Date | null = null;
  private taskSuggestionsCache: Record<string, TaskSuggestion> = {};
  private calendarCache: { events: TimeSlot[]; lastUpdate: number } = { events: [], lastUpdate: 0 };
  private readonly SUGGESTIONS_CACHE_FILE = path.join(process.cwd(), 'data', 'suggestions-cache.json');
  private readonly CALENDAR_CACHE_FILE = path.join(process.cwd(), 'data', 'calendar-cache.json');
  private readonly CONTEXT_CACHE_FILE = path.join(process.cwd(), 'data', 'context-cache.json');
  private contextCache: {
    tasks: Array<{
      title: string;
      project: string;
      due: string;
      priority: number;
    }>;
    calendar: Array<{
      title: string;
      start: Date;
      end: Date;
    }>;
    lastUpdate: number;
  } = { tasks: [], calendar: [], lastUpdate: 0 };
  private readonly OPTIMIZED_TASKS_FILE = path.join(process.cwd(), 'data', 'optimized-tasks.json');
  private optimizedTasks: string[] = [];
  
  constructor() {
    this.todoistApi = new TodoistApi(process.env.TODOIST_API_TOKEN || '');
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Initialisiere alles in der richtigen Reihenfolge
    this.initializeAll().catch(console.error);
  }

  private async initializeAll() {
    try {
      // Erst MS Graph initialisieren
      await this.initializeMsGraphClient();
      
      // Dann die Caches laden
      await Promise.all([
        this.loadCacheFromDisk(),
        this.loadCalendarCacheFromDisk(),
        this.loadOptimizedTasks()
      ]);

      // Zuletzt den Kontext initialisieren
      await this.initializeContext();
    } catch (error) {
      console.error('Fehler bei der Initialisierung:', error);
    }
  }

  private async initializeContext() {
    try {
      // Lade erst den Cache
      await this.loadContextCache();
      
      // Prüfe dann das Alter
      if (Date.now() - this.contextCache.lastUpdate > this.contextUpdateInterval) {
        await this.updateContext();
      }

      // Timer für regelmäßige Updates starten
      this.startContextUpdateTimer();
    } catch (error) {
      console.error('Fehler beim Initialisieren des Kontexts:', error);
    }
  }

  private startContextUpdateTimer() {
    if (this.contextUpdateTimer) {
      clearInterval(this.contextUpdateTimer);
    }
    
    this.contextUpdateTimer = setInterval(async () => {
      await this.updateContext();
    }, this.contextUpdateInterval);
  }

  private async updateContext() {
    console.log('Aktualisiere Kontext...');
    // Lade alle Kalendereinträge für den konfigurierten Zeitraum
    await this.loadCalendarData();
    // Lade alle Todoist-Aufgaben für den Kontext
    await this.loadAllTodoistTasks();
    // Cache aktualisieren
    await this.saveCacheToDisk();
  }

  private async loadCacheFromDisk() {
    try {
      // Stelle sicher, dass das Verzeichnis existiert
      await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
      
      const cacheExists = await fs.access(this.SUGGESTIONS_CACHE_FILE)
        .then(() => true)
        .catch(() => false);

      if (cacheExists) {
        const cacheData = await fs.readFile(this.SUGGESTIONS_CACHE_FILE, 'utf-8');
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
        this.SUGGESTIONS_CACHE_FILE,
        JSON.stringify(this.taskSuggestionsCache, null, 2),
        'utf-8'
      );
      emitLog({ message: 'Cache gespeichert', emoji: '💾' });
    } catch (error) {
      console.error('Fehler beim Speichern des Caches:', error);
      emitLog({ message: 'Fehler beim Speichern des Caches', emoji: '❌' });
    }
  }

  private async loadCalendarCacheFromDisk() {
    try {
      await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
      
      const cacheExists = await fs.access(this.CALENDAR_CACHE_FILE)
        .then(() => true)
        .catch(() => false);

      if (cacheExists) {
        const cacheData = await fs.readFile(this.CALENDAR_CACHE_FILE, 'utf-8');
        const rawCache = JSON.parse(cacheData);
        
        // Konvertiere die Datumsstrings zurück zu Date-Objekten
        this.calendarCache = {
          events: rawCache.events.map((event: any) => ({
            ...event,
            start: new Date(event.start),
            end: new Date(event.end)
          })),
          lastUpdate: rawCache.lastUpdate
        };
        
        emitLog({ message: `Kalender-Cache geladen: ${this.calendarCache.events.length} Einträge`, emoji: '💾' });
      }
    } catch (error) {
      console.error('Fehler beim Laden des Kalender-Caches:', error);
      emitLog({ message: 'Fehler beim Laden des Kalender-Caches', emoji: '❌' });
    }
  }

  private async saveCalendarCacheToDisk() {
    try {
      await fs.writeFile(
        this.CALENDAR_CACHE_FILE,
        JSON.stringify(this.calendarCache, null, 2),
        'utf-8'
      );
      emitLog({ message: 'Kalender-Cache gespeichert', emoji: '💾' });
    } catch (error) {
      console.error('Fehler beim Speichern des Kalender-Caches:', error);
      emitLog({ message: 'Fehler beim Speichern des Kalender-Caches', emoji: '❌' });
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
    try {
      if (!this.msGraphClient) {
        await this.initializeMsGraphClient();
      }

      const now = Date.now();
      const daysToInclude = parseInt(process.env.DAYS_TO_INCLUDE || '30');
      
      // Prüfe ob Cache aktuell ist
      if (now - this.calendarCache.lastUpdate < this.contextUpdateInterval) {
        emitLog({ message: 'Verwende gecachte Kalenderdaten', emoji: 'ℹ️' });
        this.timeSlots = this.filterTodayEvents(this.calendarCache.events);
        return;
      }

      // Lade Termine ab heute 00:00 Uhr
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Ende der Zeitspanne ist heute + daysToInclude Tage um 23:59:59
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + (daysToInclude - 1)); // -1 weil heute auch mitgezählt wird
      endDate.setHours(23, 59, 59, 999);

      const startOfPeriod = today.toISOString();
      const endOfPeriod = endDate.toISOString();

      console.log('Loading calendar data:', {
        start: startOfPeriod,
        end: endOfPeriod,
        today: today.toISOString(),
        endDate: endDate.toISOString()
      });

      emitLog({ message: `Lade Kalenderdaten für die nächsten ${daysToInclude} Tage...`, emoji: '📅' });

      const response = await this.msGraphClient
        .api(`/users/${process.env.MS_USER_EMAIL}/calendar/events`)
        .select('subject,start,end')
        .filter(`start/dateTime ge '${startOfPeriod}' and end/dateTime le '${endOfPeriod}'`)
        .orderby('start/dateTime')
        .get();

      // Alle Termine im Cache speichern
      const allEvents = response.value.map((event: Event) => ({
        start: new Date(event.start?.dateTime || ''),
        end: new Date(event.end?.dateTime || ''),
        title: event.subject || '',
        duration: this.calculateDuration(
          new Date(event.start?.dateTime || ''),
          new Date(event.end?.dateTime || '')
        )
      }));

      console.log('Loaded events:', allEvents.map(e => ({
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString()
      })));

      // Cache aktualisieren
      this.calendarCache = {
        events: allEvents,
        lastUpdate: now
      };
      await this.saveCalendarCacheToDisk();
      
      // Für UI nur heutige Events filtern
      this.timeSlots = this.filterTodayEvents(allEvents);
      
      emitLog({ 
        message: `${allEvents.length} Kalendereinträge geladen (${this.timeSlots.length} heute)`, 
        emoji: '📅' 
      });
    } catch (error) {
      console.error('Fehler beim Laden der Kalenderdaten:', error);
      throw error;
    }
  }

  public async loadTodoistTasks() {
    try {
      const tasks = await this.todoistApi.getTasks();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Lade optimierte Tasks
      let optimizedTasks: string[] = [];
      try {
        const optimizedTasksCache = path.join(process.cwd(), 'data', 'optimized-tasks.json');
        const existing = await fs.readFile(optimizedTasksCache, 'utf-8');
        optimizedTasks = JSON.parse(existing);
      } catch (e) {
        // Cache existiert noch nicht
      }

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
            projectId: task.projectId,
            optimized: optimizedTasks.includes(task.id)  // Setze optimized Flag
          };

          if (dueDate < today) {
            overdue.push(mappedTask);
          } else if (dueDate.getTime() === today.getTime()) {
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
    
    // Hole und sortiere die Events für heute
    const todayEvents = this.filterTodayEvents(this.timeSlots);

    const freeSlots: TimeSlot[] = [];
    let currentTime = workStart;

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

  public async suggestOptimizations(): Promise<Record<string, TaskSuggestion>> {
    emitLog({ message: 'Starte Optimierungen...', emoji: '🤖' });
    await this.updateTaskContext();
    
    const { overdue, dueToday } = await this.loadTodoistTasks();
    const allRelevantTasks = [...overdue, ...dueToday];
    
    // Prüfe Cache-Vollständigkeit
    const cachedTaskIds = new Set(Object.keys(this.taskSuggestionsCache));
    const relevantTaskIds = new Set(allRelevantTasks.map(task => task.id));
    
    // Finde Tasks die im Cache fehlen
    const missingTasks = allRelevantTasks.filter(
      task => !this.taskSuggestionsCache[task.id] && !task.optimized
    );
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

  public async getDashboardData(forceUpdate = false, targetDate: Date = new Date()): Promise<DashboardData> {
    emitLog({ message: `Lade Dashboard Daten${forceUpdate ? ' (erzwungen)' : ''}...`, emoji: '🔄' });
    
    // Erst Kalender und Zeitberechnung
    emitLog({ message: 'Lade Kalenderdaten...', emoji: '📅' });
    await this.loadCalendarData();
    
    emitLog({ message: 'Berechne freie Zeitfenster...', emoji: '⏰' });
    const freeTimeSlots = this.findFreeTimeSlots();
    const totalFreeHours = freeTimeSlots.reduce((acc, slot) => acc + slot.duration / 60, 0);
    
    // Aktualisiere den Kontext
    await this.updateTaskContext();
    
    // Lade aktuelle Tasks
    emitLog({ message: 'Lade Todoist Tasks...', emoji: '📝' });
    const { overdue, dueToday } = await this.loadTodoistTasks();
    
    // Prüfe, ob alle relevanten Tasks optimiert sind
    const allRelevantTasks = [...overdue, ...dueToday];
    const unoptimizedTasks = allRelevantTasks.filter(
      task => !this.taskSuggestionsCache[task.id]
    );

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
      emitLog({ message: 'Alle Tasks sind bereits optimiert', emoji: '' });
    }
    
    emitLog({ message: 'Dashboard Daten vollständig geladen', emoji: '✅' });
    
    // Sende die finalen Daten mit aktuellem Kontext-Update-Zeitstempel
    return {
      ...initialData,
      lastContextUpdate: new Date(this.lastContextUpdate),
      taskSuggestions: this.taskSuggestionsCache
    };
  }

  public async getCurrentContext(): Promise<string> {
    try {
      // Nur den Kontext aktualisieren, wenn nötig
      if (Date.now() - this.lastContextUpdate > this.contextUpdateInterval || !this.allTasksContext) {
        await this.updateTaskContext();
      }
      
      // Wenn kein Kontext vorhanden ist, einen leeren Kontext zurückgeben
      if (!this.allTasksContext) {
        return `Keine Daten verfügbar.
Mögliche Gründe:
- Keine Verbindung zu MS Graph
- Keine Todoist Tasks geladen
- Kontext noch nicht initialisiert`;
      }
      
      return this.allTasksContext;
    } catch (error) {
      console.error('Fehler beim Laden des Kontexts:', error);
      
      // Strukturierte Fehlermeldung zurückgeben
      return `Fehler beim Laden des Kontexts:
${error instanceof Error ? error.message : 'Unbekannter Fehler'}

Aktueller Status:
- Letztes Update: ${this.lastContextUpdate ? new Date(this.lastContextUpdate).toLocaleString() : 'Nie'}
- Tasks geladen: ${this.todoistTasks.length}
- MS Graph Client: ${this.msGraphClient ? 'Initialisiert' : 'Nicht initialisiert'}`;
    }
  }

  public async markTaskAsOptimized(taskId: string): Promise<void> {
    // Aktualisiere die Aufgabe in den todoistTasks
    this.todoistTasks = this.todoistTasks.map(task => 
      task.id === taskId 
        ? { ...task, optimized: true }
        : task
    );

    // Speichere den optimierten Status im Cache
    const optimizedTasksCache = path.join(process.cwd(), 'data', 'optimized-tasks.json');
    try {
      let optimizedTasks: string[] = [];
      try {
        const existing = await fs.readFile(optimizedTasksCache, 'utf-8');
        optimizedTasks = JSON.parse(existing);
      } catch (e) {
        // Cache existiert noch nicht
      }
      
      if (!optimizedTasks.includes(taskId)) {
        optimizedTasks.push(taskId);
        await fs.writeFile(optimizedTasksCache, JSON.stringify(optimizedTasks, null, 2));
      }
    } catch (error) {
      console.error('Fehler beim Speichern des optimierten Status:', error);
    }

    // Entferne die Vorschläge aus dem Cache
    delete this.taskSuggestionsCache[taskId];
    await this.saveCacheToDisk();
  }

  // Neue Methode für Kontext-Kalendereinträge
  private async loadContextCache() {
    try {
      const exists = await fs.access(this.CONTEXT_CACHE_FILE).then(() => true).catch(() => false);
      if (exists) {
        const data = await fs.readFile(this.CONTEXT_CACHE_FILE, 'utf-8');
        this.contextCache = JSON.parse(data);
        emitLog({ message: 'Kontext-Cache geladen', emoji: '💾' });
      }
    } catch (error) {
      console.error('Fehler beim Laden des Kontext-Cache:', error);
    }
  }

  private async saveContextCache() {
    try {
      await fs.writeFile(
        this.CONTEXT_CACHE_FILE,
        JSON.stringify(this.contextCache, null, 2)
      );
      emitLog({ message: 'Kontext-Cache gespeichert', emoji: '💾' });
    } catch (error) {
      console.error('Fehler beim Speichern des Kontext-Cache:', error);
    }
  }

  // Überarbeitete Methode für Tagesaufgaben
  public async getTasksForDate(targetDate: Date): Promise<{ 
    overdueTasks: TodoistTask[],
    dueTodayTasks: TodoistTask[],
    taskSuggestions: Record<string, TaskSuggestion>
  }> {
    try {
      // 1. Lade alle Aufgaben von Todoist
      const tasks = await this.todoistApi.getTasks();
      const targetDay = new Date(targetDate);
      targetDay.setHours(0, 0, 0, 0);
      
      const overdueTasks: TodoistTask[] = [];
      const dueTodayTasks: TodoistTask[] = [];

      // 2. Sortiere die Aufgaben nach überfällig und fällig
      for (const task of tasks) {
        if (task.due) {
          const dueDate = new Date(task.due.date);
          dueDate.setHours(0, 0, 0, 0);
          
          const taskId = task.id.toString();
          const mappedTask = {
            id: task.id,
            content: task.content,
            due: {
              date: task.due.date,
              datetime: task.due.datetime
            },
            priority: task.priority,
            projectId: task.projectId,
            optimized: this.optimizedTasks.includes(taskId)
          };

          if (this.isToday(targetDate)) {
            if (dueDate < targetDay) {
              overdueTasks.push(mappedTask);
            } else if (dueDate.getTime() === targetDay.getTime()) {
              dueTodayTasks.push(mappedTask);
            }
          } else if (dueDate.getTime() === targetDay.getTime()) {
            dueTodayTasks.push(mappedTask);
          }
        }
      }

      // 3. Prüfe und generiere Vorschläge für nicht optimierte Aufgaben
      const allTasks = [...overdueTasks, ...dueTodayTasks];
      for (const task of allTasks) {
        const taskId = task.id.toString();
        
        // Wenn keine Vorschläge im Cache und Task nicht optimiert
        if (!this.taskSuggestionsCache[taskId] && !this.optimizedTasks.includes(taskId)) {
          emitLog({ message: `Generiere neue Vorschläge für: ${task.content}`, emoji: '🤖' });
          try {
            // Hier direkt generateSuggestionsForTask aufrufen statt suggestOptimizations
            const suggestions = await this.generateSuggestionsForTask(task);
            this.taskSuggestionsCache[taskId] = suggestions;
            await this.saveCacheToDisk();
            
            emitLog({ 
              message: `Neue Vorschläge für "${task.content}" generiert`, 
              emoji: '✨' 
            });
          } catch (error) {
            console.error(`Fehler beim Generieren der Vorschläge für ${task.content}:`, error);
          }
        }
      }

      // Log-Eintrag für geladene Suggestions
      const cachedSuggestionsCount = Object.keys(this.taskSuggestionsCache).length;
      if (cachedSuggestionsCount > 0) {
        emitLog({ 
          message: `${cachedSuggestionsCount} Optimierungsvorschläge aus Cache geladen`, 
          emoji: '💡' 
        });
      }

      return { 
        overdueTasks, 
        dueTodayTasks,
        taskSuggestions: this.taskSuggestionsCache
      };
    } catch (error) {
      console.error('Fehler beim Laden der Tasks:', error);
      return { 
        overdueTasks: [], 
        dueTodayTasks: [],
        taskSuggestions: {}
      };
    }
  }

  // Neue Hilfsmethode für die Generierung von Suggestions
  private async generateSuggestionsForTask(task: TodoistTask): Promise<TaskSuggestion> {
    emitLog({ message: `Optimiere Task: ${task.content}`, emoji: '' });
    
    const systemPrompt = `Du bist ein Experte für die Optimierung von Aufgabenbeschreibungen. 
Antworte ausschließlich im JSON-Format mit einem optimierten Titel und einer Begründung.`;

    const userPrompt = `Analysiere diese Aufgabe und erstelle ein JSON mit Vorschlägen zur Optimierung:

Aktuelle Aufgabe: "${task.content}"

Kontext - Andere Aufgaben:
${this.allTasksContext}

Erstelle ein JSON-Objekt mit 'suggestions' Array, das 5 verschiedene Vorschläge enthält.
Jeder Vorschlag soll 'newTitle', 'reason' und 'estimatedDuration' enthalten.`;

    try {
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
      emitLog({ message: `Optimierung für "${task.content}" abgeschlossen`, emoji: '✅' });
      return suggestion;
    } catch (error) {
      console.error(`Fehler bei der Optimierung von "${task.content}":`, error);
      emitLog({ message: `Fehler bei der Optimierung von "${task.content}"`, emoji: '❌' });
      throw error;
    }
  }

  // Überarbeitete Kontext-Update Methode
  private async updateContext() {
    try {
      const now = Date.now();
      
      // Prüfe ob Update nötig ist
      if (now - this.contextCache.lastUpdate < this.contextUpdateInterval) {
        return;
      }

      // Lade aktuelle Daten
      const [tasks, events] = await Promise.all([
        this.todoistApi.getTasks(),
        this.loadCalendarData()
      ]);

      // Aktualisiere Kontext
      this.contextCache = {
        tasks: tasks.map(task => ({
          title: task.content,
          project: task.projectId,
          due: task.due?.date || 'Kein Datum',
          priority: task.priority
        })),
        calendar: this.calendarCache.events.map(event => ({
          title: event.title,
          start: event.start,
          end: event.end
        })),
        lastUpdate: now
      };

      // Speichere neuen Kontext
      await this.saveContextCache();
      
      emitLog({ message: 'Kontext aktualisiert', emoji: '' });
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Kontexts:', error);
      throw error;
    }
  }

  private filterTodayEvents(events: TimeSlot[]): TimeSlot[] {
    // Setze den Start des heutigen Tages auf Mitternacht
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Ende des heutigen Tages
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('Filtering events:', {
      todayStart: today.toISOString(),
      todayEnd: tomorrow.toISOString(),
      totalEvents: events.length,
      eventDates: events.map(e => ({
        start: new Date(e.start).toISOString(),
        title: e.title
      }))
    });

    const todayEvents = events
      .filter(event => {
        const eventStart = new Date(event.start);
        // Vergleiche nur die Datumsteile
        const eventDate = new Date(eventStart);
        eventDate.setHours(0, 0, 0, 0);
        
        const isToday = eventDate.getTime() === today.getTime();
        console.log('Event check:', {
          event: event.title,
          eventDate: eventDate.toISOString(),
          today: today.toISOString(),
          isToday
        });
        
        return isToday;
      })
      .sort((a, b) => {
        const dateA = new Date(a.start);
        const dateB = new Date(b.start);
        return dateA.getTime() - dateB.getTime();
      });

    console.log('Filtered today events:', {
      count: todayEvents.length,
      events: todayEvents.map(e => ({
        title: e.title,
        start: new Date(e.start).toISOString()
      }))
    });

    return todayEvents;
  }

  private async getEvents(targetDate: Date): Promise<Event[]> {
    // Anpassen der Event-Abfrage für das spezifische Datum
  }

  private async getTasks(targetDate: Date): Promise<TodoistTask[]> {
    // Anpassen der Task-Abfrage für das spezifische Datum
  }

  // Neue Methode für Events eines spezifischen Tages
  public async getEventsForDate(targetDate: Date): Promise<TimeSlot[]> {
    try {
      // Stelle sicher, dass MS Graph Client initialisiert ist
      if (!this.msGraphClient) {
        await this.initializeMsGraphClient();
      }

      // Lade Kalendereinträge aus dem Cache wenn möglich
      if (this.calendarCache.events.length > 0) {
        return this.filterEventsForDate(this.calendarCache.events, targetDate);
      }

      // Ansonsten lade neue Daten
      await this.loadCalendarData();
      return this.filterEventsForDate(this.calendarCache.events, targetDate);
    } catch (error) {
      console.error('Fehler beim Laden der Events:', error);
      return [];
    }
  }

  // Neue Methode für Tasks eines spezifischen Tages
  public async getTasksForDate(targetDate: Date): Promise<{ 
    overdueTasks: TodoistTask[],
    dueTodayTasks: TodoistTask[] 
  }> {
    try {
      const tasks = await this.todoistApi.getTasks();
      const targetDay = new Date(targetDate);
      targetDay.setHours(0, 0, 0, 0);
      
      const overdueTasks: TodoistTask[] = [];
      const dueTodayTasks: TodoistTask[] = [];

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

          // Für den heutigen Tag zeigen wir auch überfällige Tasks
          if (this.isToday(targetDate)) {
            if (dueDate < targetDay) {
              overdueTasks.push(mappedTask);
            } else if (dueDate.getTime() === targetDay.getTime()) {
              dueTodayTasks.push(mappedTask);
            }
          } else {
            // Für andere Tage nur die Tasks des spezifischen Tages
            if (dueDate.getTime() === targetDay.getTime()) {
              dueTodayTasks.push(mappedTask);
            }
          }
        }
      }

      return { overdueTasks, dueTodayTasks };
    } catch (error) {
      console.error('Fehler beim Laden der Tasks:', error);
      return { overdueTasks: [], dueTodayTasks: [] };
    }
  }

  // Hilfsmethode zum Filtern der Events für ein spezifisches Datum
  private filterEventsForDate(events: TimeSlot[], targetDate: Date): TimeSlot[] {
    const targetDay = new Date(targetDate);
    targetDay.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(targetDay);
    nextDay.setDate(nextDay.getDate() + 1);

    return events
      .filter(event => {
        const eventStart = new Date(event.start);
        return eventStart >= targetDay && eventStart < nextDay;
      })
      .sort((a, b) => {
        const dateA = new Date(a.start);
        const dateB = new Date(b.start);
        return dateA.getTime() - dateB.getTime();
      });
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  public async getFreeTimeSlotsForDate(targetDate: Date): Promise<TimeSlot[]> {
    const events = await this.getEventsForDate(targetDate);
    const targetDay = new Date(targetDate);
    targetDay.setHours(0, 0, 0, 0);
    
    // Arbeitszeitgrenzen für den Tag
    const workStart = new Date(targetDay);
    workStart.setHours(parseInt(process.env.WORK_BEGIN || '9'), 0, 0, 0);
    
    const workEnd = new Date(targetDay);
    workEnd.setHours(parseInt(process.env.WORK_END || '17'), 0, 0, 0);
    
    const freeSlots: TimeSlot[] = [];
    let currentTime = workStart;

    // Sortiere Events nach Startzeit
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    for (const event of sortedEvents) {
      const eventStart = new Date(event.start);
      if (currentTime < eventStart) {
        freeSlots.push({
          start: currentTime,
          end: eventStart,
          title: 'Frei',
          duration: this.calculateDuration(currentTime, eventStart)
        });
      }
      currentTime = new Date(event.end);
    }

    // Füge letzten Slot bis Arbeitsende hinzu
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
    try {
      // Lade aktuelle Tasks
      const tasks = await this.todoistApi.getTasks();
      this.todoistTasks = tasks;

      // Erstelle Kontext aus Tasks und Kalenderdaten
      const taskContext = tasks.map(task => ({
        title: task.content,
        project: task.projectId,
        due: task.due?.date || 'Kein Datum',
        priority: task.priority
      }));

      // Füge Kalenderevents zum Kontext hinzu
      const calendarContext = this.calendarCache.events.map(event => ({
        title: event.title,
        start: event.start,
        end: event.end
      }));

      // Kombiniere alles in einen Kontext-String
      this.allTasksContext = JSON.stringify({
        tasks: taskContext,
        calendar: calendarContext
      }, null, 2);

      this.lastContextUpdate = Date.now();
      
      emitLog({ 
        message: 'Kontext aktualisiert', 
        emoji: '🔄' 
      });
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Kontexts:', error);
      throw error;
    }
  }

  private async loadOptimizedTasks() {
    try {
      const exists = await fs.access(this.OPTIMIZED_TASKS_FILE).then(() => true).catch(() => false);
      if (exists) {
        const data = await fs.readFile(this.OPTIMIZED_TASKS_FILE, 'utf-8');
        this.optimizedTasks = JSON.parse(data);
        emitLog({ message: `${this.optimizedTasks.length} optimierte Tasks geladen`, emoji: '💾' });
      }
    } catch (error) {
      console.error('Fehler beim Laden der optimierten Tasks:', error);
    }
  }

  private async getCacheAge(): Promise<number> {
    try {
      const exists = await fs.access(this.CONTEXT_CACHE_FILE).then(() => true).catch(() => false);
      if (!exists) {
        return Infinity; // Wenn kein Cache existiert, maximales Alter zurückgeben
      }

      const stats = await fs.stat(this.CONTEXT_CACHE_FILE);
      const lastModified = stats.mtimeMs;
      return Date.now() - lastModified;
    } catch (error) {
      console.error('Fehler beim Prüfen des Cache-Alters:', error);
      return Infinity; // Im Fehlerfall maximales Alter zurückgeben
    }
  }
} 