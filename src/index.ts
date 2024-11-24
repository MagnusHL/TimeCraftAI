import { CalendarTodoPlanner } from './calendar-planner'
import { DashboardServer } from './server'

async function main() {
    const planner = new CalendarTodoPlanner()
    const server = new DashboardServer()
    
    // Starte den Dashboard-Server
    server.start()
    
    // Starte den TimeCraft Service
    await planner.startService(5)
}

main().catch(console.error) 