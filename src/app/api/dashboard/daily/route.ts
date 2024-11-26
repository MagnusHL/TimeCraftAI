import { NextResponse, NextRequest } from 'next/server'
import { CalendarPlanner } from '@/lib/services/calendar-planner'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const dateParam = searchParams.get('date')
  const date = dateParam ? new Date(dateParam) : new Date()
  
  try {
    const planner = new CalendarPlanner();
    
    // Parallele Ausführung der Datenabfragen
    const [events, tasks, freeTimeSlots] = await Promise.all([
      planner.getEventsForDate(date),
      planner.getTasksForDate(date),
      planner.getFreeTimeSlotsForDate(date)
    ]);

    const totalFreeHours = freeTimeSlots.reduce(
      (acc, slot) => acc + slot.duration / 60, 
      0
    );

    // Einzelne Response mit Timestamp
    return NextResponse.json({
      events,
      freeTimeSlots,
      totalFreeHours,
      ...tasks,
      timestamp: Date.now(), // Für Optimierung der Re-Renders
    });
  } catch (error) {
    console.error('Daily API Error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 