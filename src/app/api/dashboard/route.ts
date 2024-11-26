import { CalendarPlanner } from '@/lib/services/calendar-planner'
import { NextResponse, NextRequest } from 'next/server'
import { emitProgress } from './progress/route'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const dateParam = searchParams.get('date')
  const date = dateParam ? new Date(dateParam) : new Date()
  
  console.log('=== Dashboard API Start ===');
  try {
    console.log('🚀 Dashboard API aufgerufen');
    const url = new URL(req.url);
    console.log('URL:', url.toString());
    console.log('SearchParams:', Object.fromEntries(url.searchParams));

    emitProgress({ stage: 'init' });
    
    const planner = new CalendarPlanner();
    console.log('📅 CalendarPlanner initialisiert');
    
    await planner.initialize();
    console.log('🔑 MS Graph initialisiert');
    
    const forceUpdate = searchParams.get('force') === 'true';
    console.log(`🔄 Force Update: ${forceUpdate}`);
    
    console.log('📊 Lade Dashboard Daten...');
    const dashboardData = await planner.getDashboardData(forceUpdate, date);
    console.log('✅ Dashboard Daten geladen:', {
      events: dashboardData.events.length,
      overdueTasks: dashboardData.overdueTasks.length,
      dueTodayTasks: dashboardData.dueTodayTasks.length,
      suggestions: Object.keys(dashboardData.taskSuggestions).length
    });
    
    emitProgress({ stage: 'complete' });
    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('❌ Dashboard API Error:', error);
    emitProgress({ 
      stage: 'error', 
      currentTask: error instanceof Error ? error.message : 'Unknown error' 
    });
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 