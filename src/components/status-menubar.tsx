'use client'

import { MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger, Menubar } from "@/components/ui/menubar"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Loader2, RefreshCw, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useState, useEffect } from "react"

interface LogEntry {
  timestamp: Date;
  message: string;
  emoji?: string;
}

interface StatusMenubarProps {
  loadedTasks: number;
  lastContextUpdate: Date | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function StatusMenubar({ loadedTasks, lastContextUpdate, isLoading, onRefresh }: StatusMenubarProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/api/logs');
    
    eventSource.onmessage = (event) => {
      const logEntry = JSON.parse(event.data);
      setLogs(prev => [...prev, {
        timestamp: new Date(),
        ...logEntry
      }].slice(-100)); // Behalte die letzten 100 Logs
    };

    return () => eventSource.close();
  }, []);

  const lastThreeLogs = logs.slice(-3);

  return (
    <div className="fixed top-0 right-0 p-2 flex items-center gap-2">
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerTrigger asChild>
          <Button variant="outline" size="icon">
            <Terminal className="h-4 w-4" />
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>System Logs</DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <ScrollArea className="h-[500px] rounded-md border p-4">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2 py-1 text-sm">
                  <span className="text-gray-500 min-w-[100px]">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="w-6">{log.emoji}</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>

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