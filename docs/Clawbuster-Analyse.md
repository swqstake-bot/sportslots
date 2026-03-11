# Claw Buster (3 Claws of Leprechaun) – Analyse

## Ablauf

### 1. startThirdPartySession (Stake GraphQL)
- **Response:** `config` = URL zu gsplauncher.de
- **Beispiel:** `https://launcher-eu1.gsplauncher.de/games/encrypted/launcher?payload=QTEyOEdDTQ...` (AES-128-GCM verschlüsselt)

### 2. Launcher-Redirect
- Beim Öffnen der URL erfolgt Redirect zu:
- **Ziel:** `https://leprechaun-gold-iframe.clawbuster-cdn.com/index.html?secret=968606f5-98c9-4519-a21d-830920136e52&d=1773256797524&locale=en-EN&social=false`
- **secret** = Token für Init

### 3. Gameflow Init
- **URL:** `https://api.clawbuster.com/v1/gameflow/init`
- **Method:** POST
- **Body:** `{"user_track_id":"...","token":"968606f5-98c9-4519-a21d-830920136e52"}`
- **Header:** `token: 968606f5-98c9-4519-a21d-830920136e52`
- **Response:** Liefert Session-Token für Play (z.B. `51b7c2f4-...`)

### 4. Play/Bet
- **Request:** `{"req":{"bet":10000,"bet_type":"bet","extra_bets":["NONE"],"action":"FINISH_ROUND"},"token":"51b7c2f4-81fe-4025-9980-82e488802575"}`
- **Response:** `{"round":"...","step":"...","balance":418459,"resp":{"win_amount":5000},"final":true}`
- **Play-URL:** `https://api.clawbuster.com/v1/gameflow/play`

## Problem

Die Config von Stake ist eine verschlüsselte gsplauncher-URL. Der `secret`-Parameter kommt erst nach dem Launcher-Redirect. Ohne das Laden der URL (Browser/WebView) können wir den secret nicht extrahieren.

## Lösung (implementiert)

**Electron** (`main.ts`): IPC-Handler `clawbuster-extract-secret` lädt die Config-URL in einem versteckten BrowserWindow. `did-navigate` auf `clawbuster-cdn.com` → `secret` aus URL-Parameter extrahieren.

**clawbuster.js**: Bei gsplauncher-URL als Config:
1. `extractClawbusterSecret(configUrl)` aufrufen
2. Init: `POST api.clawbuster.com/v1/gameflow/init` mit `{user_track_id, token: secret}`, Header `token: secret`
3. Init-Response → Play-Token (`token` oder `session_token`)
4. Play: `POST api.clawbuster.com/v1/gameflow/play` mit `{req, token}`
