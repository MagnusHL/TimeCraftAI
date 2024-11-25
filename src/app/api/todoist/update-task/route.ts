import { TodoistApi } from "@doist/todoist-api-typescript";
import { NextResponse } from 'next/server';
import { CalendarPlanner } from '@/lib/services/calendar-planner';

export async function POST(request: Request) {
  try {
    const { taskId, newTitle } = await request.json();
    
    const todoistApi = new TodoistApi(process.env.TODOIST_API_TOKEN || '');
    const planner = new CalendarPlanner();
    
    // Aktualisiere den Task in Todoist
    await todoistApi.updateTask(taskId, {
      content: newTitle
    });

    // Markiere den Task als optimiert
    await planner.markTaskAsOptimized(taskId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Todoist Update Error:', error);
    return NextResponse.json({ 
      error: 'Failed to update task',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 