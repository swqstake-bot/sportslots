# StakeSports Electron Migration

Dieses Projekt ist die Electron-basierte Version des StakeSportsTools.
Ziel ist es, Session-Probleme und Cloudflare-Blocks durch die Nutzung einer echten Browser-Umgebung zu eliminieren.

## Projektstatus

**Phase 1: Setup & Authentifizierung (In Arbeit)**
- [x] Projekt-Initialisierung (Vite, React, TypeScript, Electron)
- [x] Basis-Konfiguration (TailwindCSS, Electron Builder)
- [ ] Login-Fenster & Session-Handling
- [ ] API-Request Interception

**Phase 2: API & Daten**
- [ ] GraphQL Integration
- [ ] WebSocket Client

**Phase 3: Core Features**
- [ ] Dashboard UI
- [ ] Wett-Platzierung

## Entwicklung starten

1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```

2. Entwicklungsserver starten:
   ```bash
   npm run dev
   ```
   Dies startet Vite (Port 5175) und die Electron-App parallel.

## Build

Erstellen der ausführbaren Datei:
```bash
npm run build
```
Die Artefakte landen im `release/` Ordner.

## Struktur

- `electron/`: Main-Process Code (Backend der App)
- `src/`: Renderer-Process Code (React Frontend)
- `dist/`: Build-Output für Frontend
- `dist-electron/`: Build-Output für Main-Process
