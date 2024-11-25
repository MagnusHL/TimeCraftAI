import { Client } from "@microsoft/microsoft-graph-client";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { ConfidentialClientApplication } from "@azure/msal-node";
import OpenAI from 'openai';
import "isomorphic-fetch";
import { Event } from "@microsoft/microsoft-graph-types";

interface TimeSlot {
  start: Date;
  end: Date;
  title: string;
  duration: number;
}

interface TodoistTask {
  id: string;
  content: string;
  due?: {
    date: string;
    datetime?: string | null;
  } | null;
  priority: number;
  projectId: string;
}

interface TaskSuggestion {
  newTitle: string;
  reason: string;
  estimatedDuration: number;
}

export interface DashboardData {
  timestamp: string;
  freeTimeSlots: TimeSlot[];
  totalFreeHours: number;
  overdueTasks: TodoistTask[];
  dueTodayTasks: TodoistTask[];
  events: TimeSlot[];
  taskSuggestions: Record<string, TaskSuggestion>;
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
  
  constructor() {
    this.todoistApi = new TodoistApi(process.env.TODOIST_API_TOKEN || '');
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
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

      const { overdue, dueToday } = this.todoistTasks.reduce((acc, task) => {
        if (!task.due) return acc;
        const dueDate = new Date(task.due.date);
        dueDate.setHours(0, 0, 0, 0);
        
        if (dueDate.getTime() < today.getTime()) {
          acc.overdue.push(task);
        } else if (dueDate.getTime() === today.getTime()) {
          acc.dueToday.push(task);
        }
        
        return acc;
      }, { overdue: [] as TodoistTask[], dueToday: [] as TodoistTask[] });

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
      const tasks = await this.todoistApi.getTasks();
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
      
      this.allTasksContext = this.todoistTasks
        .map(t => `- ${t.content}`)
        .join('\n');
      
      this.lastContextUpdate = now;
      console.log('Task Kontext aktualisiert');
    }
  }

  public async suggestOptimizations(): Promise<Record<string, TaskSuggestion>> {
    await this.updateTaskContext();
    const { overdue, dueToday } = await this.loadTodoistTasks();
    const allRelevantTasks = [...overdue, ...dueToday];
    
    if (!process.env.OPENAI_TASK_PROMPT || !process.env.OPENAI_SYSTEM_PROMPT) {
      throw new Error('OPENAI_TASK_PROMPT und OPENAI_SYSTEM_PROMPT müssen in der .env definiert sein');
    }
    
    const suggestions: Record<string, TaskSuggestion> = {};
    
    for (const task of allRelevantTasks) {
      const fullPrompt = `
${process.env.OPENAI_TASK_PROMPT}

Zu optimierende Aufgabe:
"${task.content}"

Kontext - Alle meine anderen Aufgaben (für Zusammenhänge und Verständnis):
${this.allTasksContext}

Antworte NUR im folgenden JSON-Format:
{
  "newTitle": "Optimierter Titel",
  "reason": "Begründung für die Optimierung",
  "estimatedDuration": 30
}`;

      try {
        const completion = await this.openai.chat.completions.create({
          messages: [{ 
            role: "system", 
            content: process.env.OPENAI_SYSTEM_PROMPT
          }, { 
            role: "user", 
            content: fullPrompt 
          }],
          model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
          temperature: 0.7,
          max_tokens: 150,
          response_format: { type: "json_object" }
        });

        const suggestion = JSON.parse(completion.choices[0].message.content || '{}');
        suggestions[task.id] = suggestion;
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`OpenAI Fehler für Task "${task.content}":`, error);
        throw error;
      }
    }

    return suggestions;
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

  public async getDashboardData(): Promise<DashboardData> {
    await this.loadCalendarData();
    const { overdue, dueToday } = await this.loadTodoistTasks();
    const taskSuggestions = await this.suggestOptimizations();
    
    const freeTimeSlots = this.findFreeTimeSlots();
    
    return {
      timestamp: new Date().toISOString(),
      freeTimeSlots,
      totalFreeHours: freeTimeSlots.reduce((acc, slot) => acc + slot.duration / 60, 0),
      overdueTasks: overdue,
      dueTodayTasks: dueToday,
      events: this.getTimeSlots(),
      taskSuggestions
    };
  }
} 