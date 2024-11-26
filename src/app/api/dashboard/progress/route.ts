import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

const encoder = new TextEncoder()

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"ping"}\n\n'))
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}

export function emitProgress(data: any) {
  const clients = new Set<ReadableStreamDefaultController>()
  
  try {
    const message = `data: ${JSON.stringify(data)}\n\n`
    clients.forEach(client => {
      try {
        client.enqueue(encoder.encode(message))
      } catch (err) {
        console.error('Error sending to client:', err)
        clients.delete(client)
      }
    })
  } catch (err) {
    console.error('Error emitting progress:', err)
  }
} 