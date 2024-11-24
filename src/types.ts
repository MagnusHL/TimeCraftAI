export interface CalendarEvent {
    start: { dateTime: string };
    end: { dateTime: string };
    subject?: string;
}

export interface TodoistDue {
    string: string;
    date: string;
    isRecurring: boolean;
    datetime?: string | null;
    timezone?: string | null;
}

export interface TodoistTask {
    id: string;
    content: string;
    priority: number;
    due?: TodoistDue | null;
    // andere Felder können bei Bedarf hinzugefügt werden
}

export interface TimeSlot {
    start: Date;
    end: Date;
}

export interface DashboardData {
    timestamp: string;
    freeTimeSlots: TimeSlot[];
    totalFreeHours: number;
    overdueTasks: TodoistTask[];
    events: CalendarEvent[];
}

export interface TaskSuggestion {
    originalTask: TodoistTask;
    suggestedTitle: string;
    reasoning: string;
}

export interface ProjectContext {
    id: string;
    name: string;
    tasks: TodoistTask[];
} 