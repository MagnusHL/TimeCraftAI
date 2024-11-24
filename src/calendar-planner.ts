import { TodoistApi } from '@doist/todoist-api-typescript'
import { Client } from '@microsoft/microsoft-graph-client'
import { ClientSecretCredential } from '@azure/identity'
import dotenv from 'dotenv'
import { CalendarEvent, TodoistTask, TimeSlot, DashboardData, TaskSuggestion, ProjectContext } from './types'
import { writeFileSync } from 'fs'
import OpenAI from 'openai';

dotenv.config()

export class CalendarTodoPlanner {
    private todoistClient: TodoistApi
    private graphClient: Client
    private workBegin: number
    private workEnd: number
    private userEmail: string
    private openai: OpenAI;

    constructor() {
        const requiredEnvVars = {
            TODOIST_API_TOKEN: process.env.TODOIST_API_TOKEN,
            MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
            MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
            MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
            MS_USER_EMAIL: process.env.MS_USER_EMAIL
        }

        const missingVars = Object.entries(requiredEnvVars)
            .filter(([_, value]) => !value)
            .map(([key]) => key)

        if (missingVars.length > 0) {
            throw new Error(`Fehlende Umgebungsvariablen: ${missingVars.join(', ')}`)
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(requiredEnvVars.MS_USER_EMAIL!)) {
            throw new Error(`Ungültige E-Mail-Adresse: ${requiredEnvVars.MS_USER_EMAIL}`)
        }

        this.todoistClient = new TodoistApi(requiredEnvVars.TODOIST_API_TOKEN!)
        
        const credential = new ClientSecretCredential(
            requiredEnvVars.MICROSOFT_TENANT_ID!,
            requiredEnvVars.MICROSOFT_CLIENT_ID!,
            requiredEnvVars.MICROSOFT_CLIENT_SECRET!
        )

        this.graphClient = Client.initWithMiddleware({
            authProvider: {
                getAccessToken: async () => {
                    try {
                        console.log('Versuche Token zu erhalten...');
                        const token = await credential.getToken('https://graph.microsoft.com/.default')
                        if (!token?.token) {
                            console.error('Kein Token erhalten!');
                            throw new Error('Konnte kein Token von Microsoft Graph API erhalten')
                        }
                        console.log('Token erfolgreich erhalten:', {
                            expiresOn: token.expiresOnTimestamp,
                        });
                        return token.token
                    } catch (error: any) {
                        console.error('Token-Fehler:', {
                            name: error?.name || 'Unbekannt',
                            message: error?.message || 'Kein Fehlertext verfügbar',
                            stack: error?.stack || 'Kein Stack-Trace verfügbar'
                        });
                        throw error
                    }
                }
            },
            debugLogging: true
        })

        this.workBegin = parseInt(process.env.WORK_BEGIN || '9')
        this.workEnd = parseInt(process.env.WORK_END || '17')
        
        if (isNaN(this.workBegin) || isNaN(this.workEnd) || 
            this.workBegin < 0 || this.workBegin > 23 || 
            this.workEnd < 0 || this.workEnd > 23 || 
            this.workBegin >= this.workEnd) {
            throw new Error(`Ungültige Arbeitszeiten: Begin=${this.workBegin}, End=${this.workEnd}`)
        }

        this.userEmail = requiredEnvVars.MS_USER_EMAIL!

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    private async getMsCalendarEvents(): Promise<CalendarEvent[]> {
        try {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const endOfDay = new Date(today)
            endOfDay.setHours(23, 59, 59, 999)

            const response = await this.graphClient
                .api(`/users/${this.userEmail}/calendar/events`)
                .select('subject,start,end')
                .filter(`start/dateTime ge '${today.toISOString()}' and end/dateTime le '${endOfDay.toISOString()}'`)
                .get()
                .catch(error => {
                    console.error('Detaillierter Kalenderereignis-Fehler:', {
                        statusCode: error.statusCode,
                        code: error.code,
                        message: error.message,
                        body: error.body
                    });
                    if (error.statusCode === 404) {
                        throw new Error(`Kalender nicht gefunden für Benutzer: ${this.userEmail}`)
                    }
                    if (error.statusCode === 403) {
                        throw new Error('Keine Berechtigung für den Kalenderzugriff')
                    }
                    throw error
                })

            return response.value
        } catch (error) {
            console.error('Fehler beim Abrufen der Kalenderereignisse:', error)
            throw error
        }
    }

    private getFreeTimeSlots(events: CalendarEvent[]): TimeSlot[] {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const workStart = new Date(today)
        workStart.setHours(this.workBegin, 0, 0, 0)
        const workEnd = new Date(today)
        workEnd.setHours(this.workEnd, 0, 0, 0)

        const busySlots = events
            .map(event => ({
                start: new Date(event.start.dateTime),
                end: new Date(event.end.dateTime)
            }))
            .filter(slot => slot.start >= workStart && slot.end <= workEnd)
            .sort((a, b) => a.start.getTime() - b.start.getTime())

        const freeSlots: TimeSlot[] = []
        let currentTime = workStart

        busySlots.forEach(slot => {
            if (currentTime < slot.start) {
                freeSlots.push({
                    start: currentTime,
                    end: slot.start
                })
            }
            currentTime = new Date(Math.max(currentTime.getTime(), slot.end.getTime()))
        })

        if (currentTime < workEnd) {
            freeSlots.push({
                start: currentTime,
                end: workEnd
            })
        }

        return freeSlots
    }

    private calculateTotalFreeTime(freeSlots: TimeSlot[]): number {
        return freeSlots.reduce((total, slot) => {
            return total + (slot.end.getTime() - slot.start.getTime()) / (1000 * 60 * 60)
        }, 0)
    }

    private async getTodoistTasks(): Promise<TodoistTask[]> {
        try {
            const allTasks = await this.todoistClient.getTasks()
            return allTasks.filter(task => {
                if (!task.due?.date) return false
                const dueDate = new Date(task.due.date)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return dueDate < today
            }) as TodoistTask[]
        } catch (error) {
            console.error('Fehler beim Abrufen der Todoist-Aufgaben:', error)
            return []
        }
    }

    private async listCalendars(): Promise<void> {
        try {
            console.log('Starte Kalenderabfrage für:', this.userEmail);
            console.log('Tenant ID:', process.env.MICROSOFT_TENANT_ID);
            console.log('Client ID:', process.env.MICROSOFT_CLIENT_ID);
            
            // Versuche zuerst alle verfügbaren Benutzer zu listen
            console.log('Liste alle Benutzer...');
            const usersResponse = await this.graphClient
                .api('/users')
                .select('displayName,mail,id')
                .get()
                .catch(error => {
                    console.error('Fehler beim Auflisten der Benutzer:', error);
                });

            if (usersResponse) {
                console.log('Verfügbare Benutzer:');
                usersResponse.value.forEach((user: any) => {
                    console.log(`- ${user.displayName} (${user.mail})`);
                });
            }

            // Direkt den Benutzer und seine Kalender abfragen
            console.log('Suche Benutzer...');
            const userResponse = await this.graphClient
                .api(`/users/${this.userEmail}`)
                .select('displayName,mail,id')  // Nur notwendige Felder
                .get()
                .catch(error => {
                    console.error('Detaillierter Benutzerfehler:', {
                        statusCode: error.statusCode,
                        code: error.code,
                        message: error.message,
                        body: error.body
                    });
                    throw new Error(`Benutzer nicht gefunden oder keine Berechtigung: ${this.userEmail}`);
                });

            console.log('Benutzer gefunden:', {
                displayName: userResponse.displayName,
                mail: userResponse.mail,
                id: userResponse.id
            });

            // Versuche Kalender zu listen
            console.log('Versuche Kalender abzurufen...');
            const response = await this.graphClient
                .api(`/users/${this.userEmail}/calendar`)  // Nur den Hauptkalender abfragen
                .select('id,name,owner')  // Nur notwendige Felder
                .get()
                .catch(error => {
                    console.error('Detaillierter Kalenderfehler:', {
                        statusCode: error.statusCode,
                        code: error.code,
                        message: error.message,
                        body: error.body
                    });
                    if (error.statusCode === 403) {
                        throw new Error(`Keine Berechtigung für Kalender von: ${this.userEmail}\nBitte prüfe die App-Berechtigungen im Azure Portal`);
                    }
                    throw error;
                });
            
            console.log('Kalender gefunden:', {
                name: response.name,
                id: response.id,
                owner: response.owner?.address || 'Unbekannt'
            });

        } catch (error) {
            console.error('Finaler Kalenderfehler:', error);
            throw error;
        }
    }

    public async generateHtmlReport(): Promise<void> {
        try {
            await this.listCalendars()
            const events = await this.getMsCalendarEvents()
            const freeSlots = this.getFreeTimeSlots(events)
            const freeHours = this.calculateTotalFreeTime(freeSlots)
            const overdueTasks = await this.getTodoistTasks()
            
            const html = `
                <!DOCTYPE html>
                <html lang="de">
                <head>
                    <meta charset="UTF-8">
                    <title>Überfällige Aufgaben</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; }
                        .container { max-width: 800px; margin: 0 auto; }
                        .task { 
                            margin: 10px 0; 
                            padding: 10px; 
                            border: 1px solid #ff4444;
                            background-color: #fff5f5;
                        }
                        .time-info { background-color: #f0f0f0; padding: 15px; margin-bottom: 20px; }
                        .overdue { color: #cc0000; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Überfällige Aufgaben</h1>
                        <div class="time-info">
                            <h2>Zeitübersicht</h2>
                            <p>Verfügbare Zeit heute: ${freeHours.toFixed(1)} Stunden</p>
                        </div>
                        <h2>Überfällige Aufgaben</h2>
                        ${overdueTasks.map(task => `
                            <div class="task">
                                <h3>${task.content}</h3>
                                <p class="overdue">Fällig am: ${task.due?.date || 'Kein Datum'}</p>
                                <p>Priorität: ${5-task.priority}</p>
                            </div>
                        `).join('')}
                    </div>
                </body>
                </html>
            `

            writeFileSync('ueberfaellige-aufgaben.html', html)
            console.log('Bericht wurde erfolgreich erstellt!')
        } catch (error) {
            console.error('Fehler bei der Berichtserstellung:', error)
            throw error
        }
    }

    public async generateDashboardData(): Promise<DashboardData> {
        const events = await this.getMsCalendarEvents()
        const freeSlots = this.getFreeTimeSlots(events)
        const freeHours = this.calculateTotalFreeTime(freeSlots)
        const overdueTasks = await this.getTodoistTasks()
        
        return {
            timestamp: new Date().toISOString(),
            freeTimeSlots: freeSlots,
            totalFreeHours: freeHours,
            overdueTasks,
            events
        }
    }

    private async getAllProjects(): Promise<ProjectContext[]> {
        try {
            const projects = await this.todoistClient.getProjects();
            const projectContexts: ProjectContext[] = [];
            
            for (const project of projects) {
                const tasks = await this.todoistClient.getTasks({ projectId: project.id });
                projectContexts.push({
                    id: project.id,
                    name: project.name,
                    tasks: tasks as TodoistTask[]
                });
            }
            
            return projectContexts;
        } catch (error) {
            console.error('Fehler beim Abrufen der Projekte:', error);
            return [];
        }
    }

    private async getTaskSuggestions(tasks: TodoistTask[]): Promise<TaskSuggestion[]> {
        if (tasks.length === 0) return [];

        const projects = await this.getAllProjects();
        const openAiModel = process.env.OPENAI_MODEL || 'gpt-4'; // Fallback auf gpt-4 wenn nicht konfiguriert
        
        const prompt = `
Als erfahrener Projektmanager und Aufgabenorganisator, analysiere bitte die folgenden Aufgaben und deren Kontext.
Schlage präzisere oder bessere Titel vor, die:
1. Den Kontext besser widerspiegeln
2. Klarer und aktionsorientierter sind
3. Mit anderen Aufgaben im gleichen Projekt zusammenhängen
4. Die Priorität und Dringlichkeit berücksichtigen

Projektkontext:
${JSON.stringify(projects, null, 2)}

Zu überarbeitende Aufgaben:
${JSON.stringify(tasks, null, 2)}

Liefere für jede Aufgabe:
1. Einen verbesserten Titel
2. Eine kurze Begründung für die Änderung
`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: openAiModel,
                messages: [
                    { 
                        role: "system", 
                        content: "Du bist ein erfahrener Projektmanager, der Aufgaben optimiert und verbessert." 
                    },
                    { 
                        role: "user", 
                        content: prompt 
                    }
                ],
                temperature: 0.7
            });

            const suggestions = JSON.parse(completion.choices[0].message.content || '[]');
            return suggestions as TaskSuggestion[];
        } catch (error) {
            console.error('Fehler bei OpenAI Anfrage:', error);
            return [];
        }
    }

    public async startService(intervalMinutes: number = 5): Promise<void> {
        console.clear();
        console.log('\n=== TimeCraft Service ===');
        console.log('Initialisiere Service...\n');
        console.log('Konfiguration:');
        console.log(`- Arbeitszeit: ${this.workBegin}:00 - ${this.workEnd}:00 Uhr`);
        console.log(`- Benutzer: ${this.userEmail}`);
        console.log(`- Update-Intervall: ${intervalMinutes} Minuten`);
        console.log('\nZugriffspunkte:');
        console.log('1. Dashboard: http://localhost:3000');
        console.log('2. API Endpoint: http://localhost:3000/api/dashboard');
        console.log('3. JSON Datei: ./dashboard-data.json');
        console.log('\nVerfügbare Befehle:');
        console.log('- Ctrl+C: Service beenden');
        console.log('\nStarte Service...\n');
        
        const updateDashboard = async () => {
            try {
                const data = await this.generateDashboardData();
                const suggestions = await this.getTaskSuggestions([
                    ...data.overdueTasks,
                    ...data.events.map(event => ({
                        id: event.subject || '',
                        content: event.subject || 'Termin',
                        priority: 1,
                        due: { date: event.start.dateTime }
                    } as TodoistTask))
                ]);
                
                // Generiere eine übersichtliche Konsolenausgabe
                console.clear()
                console.log('\n=== TimeCraft Dashboard ===')
                console.log(`Letzte Aktualisierung: ${new Date().toLocaleTimeString()}`)
                console.log('\nVerfügbare Zeit heute:', `${data.totalFreeHours.toFixed(1)} Stunden`)
                
                console.log('\nFreie Zeitslots:')
                data.freeTimeSlots.forEach(slot => {
                    console.log(`  ${slot.start.toLocaleTimeString()} - ${slot.end.toLocaleTimeString()}`)
                })
                
                console.log('\nÜberfällige Aufgaben:')
                data.overdueTasks.forEach(task => {
                    console.log(`  - ${task.content} (Fällig: ${task.due?.date})`)
                })
                
                console.log('\nHeutige Termine:')
                data.events.forEach(event => {
                    const start = new Date(event.start.dateTime)
                    const end = new Date(event.end.dateTime)
                    console.log(`  - ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}: ${event.subject || 'Termin'}`)
                })
                
                if (suggestions.length > 0) {
                    console.log('\nVorschläge zur Aufgabenoptimierung:');
                    suggestions.forEach(suggestion => {
                        console.log(`\nAufgabe: ${suggestion.originalTask.content}`);
                        console.log(`Vorschlag: ${suggestion.suggestedTitle}`);
                        console.log(`Begründung: ${suggestion.reasoning}`);
                        console.log('------------------------');
                    });
                }
                
                console.log('\nZugriffspunkte:');
                console.log('1. Dashboard: http://localhost:3000');
                console.log('2. API Endpoint: http://localhost:3000/api/dashboard');
                console.log('\nDrücke Ctrl+C zum Beenden...')
            } catch (error) {
                console.error('Fehler beim Update:', error)
            }
        }

        // Initial update
        await updateDashboard()
        
        // Regelmäßiges Update
        setInterval(updateDashboard, intervalMinutes * 60 * 1000)
    }
} 