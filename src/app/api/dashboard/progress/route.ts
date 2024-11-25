import { NextResponse } from 'next/server'

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Beispiel für Progress-Updates
      controller.enqueue('data: ' + JSON.stringify({
        stage: 'loading',
        totalTasks: 0,
        processedTasks: 0
      }) + '\n\n')
    }
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
} 