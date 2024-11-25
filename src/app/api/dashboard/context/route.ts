import { CalendarPlanner } from '@/lib/services/calendar-planner'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const planner = new CalendarPlanner();
    
    // Initialisiere nur wenn nötig
    try {
      await planner.initialize();
    } catch (error) {
      console.warn('MS Graph Initialisierung fehlgeschlagen:', error);
      // Fahre trotzdem fort, da wir zumindest Todoist-Daten haben könnten
    }
    
    const context = await planner.getCurrentContext();
    
    return NextResponse.json({ 
      context,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Context API Error:', error);
    return NextResponse.json({ 
      context: `Fehler beim Laden des Kontexts: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      error: true,
      timestamp: new Date().toISOString()
    });
  }
} 