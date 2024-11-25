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




## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
