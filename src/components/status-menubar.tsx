'use client'

import { MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger, Menubar } from "@/components/ui/menubar"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Loader2, RefreshCw, Terminal, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useState, useEffect, useRef } from "react"

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
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false);
  const [context, setContext] = useState<string>('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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

  const fetchContext = async () => {
    try {
      const response = await fetch('/api/dashboard/context');
      const data = await response.json();
      setContext(data.context);
    } catch (error) {
      console.error('Fehler beim Laden des Kontexts:', error);
      setContext('Fehler beim Laden des Kontexts');
    }
  };

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
            <ScrollArea 
              className="h-[500px] rounded-md border p-4"
              ref={scrollAreaRef}
            >
              <div className="space-y-1">
                {[...logs].reverse().map((log, index) => (
                  <div key={index} className="flex items-start gap-2 py-1 text-sm border-b last:border-0">
                    <span className="text-gray-500 min-w-[100px]">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="w-6">{log.emoji}</span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={isContextDrawerOpen} onOpenChange={setIsContextDrawerOpen}>
        <DrawerTrigger asChild>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => {
              fetchContext();
              setIsContextDrawerOpen(true);
            }}
          >
            <FileText className="h-4 w-4" />
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Aktueller Kontext</DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <ScrollArea className="h-[500px] rounded-md border p-4">
              <pre className="whitespace-pre-wrap text-sm font-mono">
                {context}
              </pre>
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