export interface DashboardData {
  timestamp: string;
  overdueTasks: TodoistTask[];
  dueTodayTasks: TodoistTask[];
  events: CalendarEvent[];
  freeTimeSlots: TimeSlot[];
  totalFreeHours: number;
  taskSuggestions: Record<string, TaskSuggestion>;
  loadedTasksCount: number;
}

export interface TaskSuggestion {
  suggestions: Array<{
    newTitle: string;
    reason: string;
    estimatedDuration: number;
  }>;
} 