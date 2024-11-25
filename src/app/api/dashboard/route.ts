import { CalendarPlanner } from '@/lib/services/calendar-planner'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const planner = new CalendarPlanner()
    await planner.initialize()
    
    console.log('Todoist Token:', process.env.TODOIST_API_TOKEN?.slice(0, 5) + '...');
    console.log('Project ID:', process.env.PRIVATE_TODOIST_PROJECT);
    
    const dashboardData = await planner.getDashboardData()
    console.log('Dashboard Data:', {
      taskCount: dashboardData.overdueTasks.length,
      eventCount: dashboardData.events.length
    });
    
    return NextResponse.json(dashboardData)
  } catch (error) {
    console.error('Dashboard API Error:', error)
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 