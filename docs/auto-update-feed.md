# Auto-Update Feed (electron-updater)

## Architektur

| Repo | Sichtbarkeit | Inhalt |
|------|--------------|--------|
| `swqstake-bot/sportslots` | Source (kann privat werden) | App-Quellcode + CI |
| `swqstake-bot/sportslots-releases` | **öffentlich** | Nur Release-Artifacts (`latest.yml`, Installer, Blockmap) |

- **Updater-Feed** (Clients ab 1.0.260): `sportslots-releases`
- **Publish** (Übergangsphase): dual → beide Repos (gleiche Version/Assets)
- **`build.publish[0]`** = `sportslots-releases` (primär für generierte `app-update.yml`); zweites Ziel = `sportslots`

`repository` in `package.json` zeigt weiter auf den Source-Repo (`sportslots`).

### HTTP/2 / CDN Hinweise

Electron `net` + GitHub Releases CDN kann `net::ERR_HTTP2_SERVER_REFUSED_STREAM` werfen.
Die App forciert HTTP/1.1 (`--disable-http2`), retried transient Network-Fehler und zeigt einen Retry-Button.
Workaround ohne neuen Build: Update später erneut prüfen oder Installer von
https://github.com/swqstake-bot/sportslots-releases/releases neu installieren.

## Secret / Permissions

CI braucht einen Token mit Schreibrechten auf **beide** Publish-Ziele:

1. GitHub → Settings → Developer settings → Personal access tokens (classic)
2. Scope: `repo` (und ggf. `workflow`)
3. Als Repo-Secret in **sportslots** anlegen: Name `RELEASES_GITHUB_TOKEN`

Die Workflows nutzen:

`GH_TOKEN` / `GITHUB_TOKEN` = `secrets.RELEASES_GITHUB_TOKEN` falls gesetzt, sonst `secrets.GITHUB_TOKEN`.

Ohne `RELEASES_GITHUB_TOKEN` schlägt Publish nach `sportslots-releases` fehl (Default-Token gilt nur für das aktuelle Repo).

## Migration (Chicken-Egg)

Bestehende Installationen (< 1.0.260) prüfen weiter **`sportslots`**.

1. **Secret setzen** (`RELEASES_GITHUB_TOKEN`) — siehe oben.
2. **Migrations-Release 1.0.260** bauen (Actions → Update / Release).  
   Dual-Publish legt Assets auf `sportslots` **und** `sportslots-releases` ab.  
   Alte Clients holen 1.0.260 von `sportslots` und wechseln danach den Feed.
3. **Weitere Releases** weiter dual publishen, bis genug Clients auf ≥ 1.0.260 sind.
4. **Danach dual entfernen:** in `package.json` → `build.publish` nur noch `sportslots-releases` lassen.
5. **Erst dann** `sportslots` auf **Private** stellen.  
   `sportslots-releases` bleibt öffentlich.

**Nicht** früher privat machen — sonst bleiben alte Clients ohne Update-Pfad stecken.

## Nach der Migration (nur Releases-Repo)

```json
"publish": [
  {
    "provider": "github",
    "owner": "swqstake-bot",
    "repo": "sportslots-releases",
    "releaseType": "release"
  }
]
```

`RELEASES_GITHUB_TOKEN` bleibt nötig, solange CI im privaten Source-Repo läuft und nach außen published.
