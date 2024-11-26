import { NextResponse } from 'next/server'
import { CalendarPlanner } from '@/lib/services/calendar-planner'

const planner = new CalendarPlanner()

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const date = dateParam ? new Date(dateParam) : new Date()

    // Stelle sicher, dass das Datum gültig ist
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Ungültiges Datum' }, { status: 400 })
    }

    const data = await planner.getDashboardData(false, date)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Fehler in /api/dashboard/daily:', error)
    return NextResponse.json(
      { error: 'Interner Server Fehler' },
      { status: 500 }
    )
  }
} 