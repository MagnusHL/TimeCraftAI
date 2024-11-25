'use client'

import { MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger, Menubar } from "@/components/ui/menubar"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import type { LogEntry } from '@/types/logs'

interface StatusMenubarProps {
  loadedTasks: number;
  lastContextUpdate: Date | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function StatusMenubar({ loadedTasks, lastContextUpdate, isLoading, onRefresh }: StatusMenubarProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/logs');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Ignoriere Ping-Nachrichten
      if (data.type === 'ping') return;
      
      setLogs(prev => [...prev, {
        timestamp: new Date(),
        ...data
      }].slice(-100)); // Behalte die letzten 100 Logs
    };

    return () => eventSource.close();
  }, []);

  const lastThreeLogs = logs.slice(-3);

  return (
    <div className="fixed top-0 right-0 p-2 flex items-center gap-2">
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger className="cursor-pointer">
            Status {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin inline" />}
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              Geladene Aufgaben: {loadedTasks}
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              Letztes Update: {lastContextUpdate?.toLocaleTimeString() || 'Nie'}
              <MenubarShortcut>Auto-Update alle 5min</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <div className="px-2 py-1.5 text-sm">
              Letzte Aktivitäten:
              {lastThreeLogs.map((log, index) => (
                <div key={index} className="flex items-center gap-1 text-muted-foreground">
                  <span>{log.emoji}</span>
                  <span className="truncate">{log.message}</span>
                </div>
              ))}
            </div>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <Button 
        variant="outline" 
        size="icon"
        onClick={onRefresh}
        disabled={isLoading}
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  )
} 