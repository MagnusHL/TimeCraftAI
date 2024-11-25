This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Aufgaben

- [x] Grundlegende Next.js Projektstruktur aufsetzen
- [x] Integration von Todoist API
- [x] Integration von Microsoft Calendar API
- [x] Implementierung des Calendar-Planners
- [x] OpenAI Integration für Aufgabenoptimierung
- [ ] UI/UX Verbesserungen
  - [ ] Responsives Design optimieren
  - [ ] Dark Mode implementieren
  - [ ] Bessere Visualisierung der Zeitslots
- [ ] Fehlerbehandlung verbessern
- [ ] Tests schreiben
- [ ] Performance Optimierung
- [ ] Dokumentation vervollständigen
- [ ] Deployment Pipeline aufsetzen
- [ ] Tages Auswahl
- [X] 5 Vorschläge für neue Aufgaben Titel
- [ ] Intelligente Neuverteilung von Aufgaben bei Zeitknappheit - in einem neuen Tab
  - Analyse der verfügbaren Zeit und fälligen Aufgaben
  - Automatische Vorschläge für neue Fälligkeitstermine basierend auf:
    - Verfügbarer Zeit pro Tag
    - Bereits geplanten Aufgaben
    - Auslastung der Folgetage
  - Bei Tagesauswahl: Berücksichtigung nur der am gewählten Tag fälligen Aufgaben (ohne Überfällige)
- [X] oben rechts einen Knopf einbauen in dem dann in einem popup ähnlichen Fenster der Kontext der openai mitgegeben wird zur kontrolle angezeigt wird
- [o] kein regelmäßiger Refresh der Änderungsvorschläge, nur bei Tageswechsel oder auf Knopfdruck oben rechts und beim starten der app
- [o] der Kontext für openai, also alle AUfgaben und Projekte werden im Hintergrund alle 5 Minuten aktualisiert und zwischen gespeichert. So dass die Oberfläche nicht so hängt. oben rechts in einer Leiste (npx shadcn@latest add menubar
) wird dann der Status angezeigt.
- [X] Ladevorgang optimieren, Anzahl geladene Aufgaben hochzählen und zwar oben rechts in einer Leiste in der Menüzeile. So dass die UI schon sichtbar ist
- [X] lade erst den Kalender und berechne die Zeit etc. bevor du Todoist Kontext und aufgaben lädst, so dass die UI schon sichtbar ist.
- [X] Scroll Area im npx shadcn@latest add drawer der logausgabe sollten immer unten sein, also mitlaufen.
- [ ] Vorschlag übernehmen und im Todoist aktualisieren und nicht wieder vorschlagen (cache marker), Außerdem die entsprechende Aufgabe in der Übersicht so markieren, dass sie bereits als optimiert gekennzeichnet ist. cache so pflegen, dass bereits geändert der Aufgabe oder optimierte Aufgaben nicht nochmal bearbeitet werden. also die, die wir optimiert haben und nach todoist zurück geschrieben haben.
- [X] letztes Kontext-Update zeigen
- [o] Kalender-Events der nächsten X Tage (.env Einstellung) in den Kontext mitaufnehmen
- [ ] Navigation auf eine Sidebar umbauen. Dort sind alle Knöpfe, die jetzt am oberen Rand sind, untergebracht und auch die Tabs, also Tabs fallen weg und diese Menübar fällt weg. Alle diese Sachen kommen in eine Sidebar. npx shadcn@latest add sidebar
