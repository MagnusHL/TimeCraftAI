import { NextResponse } from 'next/server'
import { EventEmitter } from 'events'
import type { TaskSuggestion } from '@/lib/services/calendar-planner';

const progressEmitter = new EventEmitter()
const encoder = new TextEncoder()
const controllers = new Map<string, ReadableStreamDefaultController>()

progressEmitter.setMaxListeners(100)

export interface ProgressUpdate {
  stage: string;
  taskCount?: number;
  processedTasks?: number;
  currentTask?: string;
  data?: any;
  optimizedTask?: {
    id: string;
    suggestions: TaskSuggestion;
  };
}

export function emitProgress(progress: ProgressUpdate) {
  try {
    for (const [id, controller] of controllers.entries()) {
      try {
        if (controller.desiredSize !== null) {
          const message = `data: ${JSON.stringify(progress)}\n\n`
          controller.enqueue(encoder.encode(message))
        } else {
          controllers.delete(id)
        }
      } catch (error) {
        console.error('Failed to send progress:', error)
        controllers.delete(id)
      }
    }
  } catch (error) {
    console.error('Progress emit error:', error)
  }
}

export async function GET() {
  const streamId = Math.random().toString(36).substring(7)
  
  const stream = new ReadableStream({
    start(controller) {
      controllers.set(streamId, controller)
      
      try {
        controller.enqueue(encoder.encode('data: {"type":"ping"}\n\n'))
      } catch (error) {
        console.error('Initial ping failed:', error)
        controllers.delete(streamId)
      }
    },
    cancel() {
      controllers.delete(streamId)
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