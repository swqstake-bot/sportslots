# AutoBet Fill-Up – Warum könnte der Bot über Nacht stoppen?

## Zusammenfassung (ohne Logs)

Ohne Logs lassen sich mehrere Ursachen nicht ausschließen. Die wahrscheinlichsten Szenarien:

---

## 1. **PC/Energieverwaltung (sehr wahrscheinlich)**

- Wenn der PC in den **Standby/Sleep** geht, werden **`setTimeout`-Timer** nicht zuverlässig ausgeführt.
- Der Bot plant typischerweise:
  - 30 s bei „Keine Kandidaten“
  - 1–3 min bei 150-Limit (Fill-Up)
- Diese Timer laufen nicht weiter, solange der PC schläft.
- Nach dem Aufwachen kann der Timer verfallen sein oder nicht mehr feuern.

**Empfehlung:** Energieverwaltung anpassen, z.B.:

- „Computer nicht in den Ruhezustand wechseln lassen“
- Oder einen Wake-Timer für die Nacht setzen.

---

## 2. **Währungskurse / API**

```typescript
// useAutoBetEngine.ts ~Zeile 67-72
const rates = await fetchCurrencyRates('');
if (settings.currency.toLowerCase() !== 'usd') {
  addLog(`CRITICAL: Failed to fetch currency rates. Stopping for safety.`, 'error');
  stop();  // HART-STOP
  return;
}
```

- Wenn `fetchCurrencyRates` z.B. wegen Netzwerk-/API-Fehler schlägt und die Währung nicht USD ist: **Stopp für Sicherheit**.
- Kurzfristige API-Ausfälle oder Timeouts könnten so einen Abbruch verursachen.

---

## 3. **Session / Stake-Anmeldung**

- Stake-Sessions können ablaufen.
- Bei abgelaufener Session schlagen API-Aufrufe fehl.
- Fehlerbehandlung ist vorhanden, aber:
  - Nach 10 aufeinanderfolgenden Fehlern wird der Scan neu gestartet.
  - Dauerhafte Auth-Fehler führen trotzdem nur zu Retries, nicht direkt zu `stop()`.

---

## 4. **Balance aufgebraucht**

```typescript
// ~Zeile 134-137, 368-371, 469-472
if (currentBalance < initialCryptoAmount) {
  addLog(`Insufficient balance...`, 'error');
  stop();  // HART-STOP
  return;
}
```

- Wenn das Guthaben unter den minimalen Einsatz fällt: **sofortiger Stopp**.

---

## 5. **150-Limit ohne Fill-Up**

- Wenn `fillUp` nicht aktiv ist und das 150-Wetten-Limit erreicht wird: **Stopp**.
- Bei aktivem Fill-Up: Pause 1–3 min, dann erneuter Scan.
- Unklar, ob dein Kollege Fill-Up tatsächlich aktiviert hatte.

---

## 6. **Zu viele aufeinanderfolgende Fehler**

```typescript
// ~Zeile 454-458
if (consecutiveFailures >= 10) {
  addLog(`Too many consecutive failures...`);
  break;  // Verlässt while-Loop, aber ...
}
// ... im finally: setTimeout(processAutoBet, 30000) → Retry in 30s
```

- Hier wird nur eine Schleife abgebrochen, danach gibt es einen Retry nach 30 s.
- Das allein führt nicht zu einem dauerhaften Stopp.

---

## 7. **Bug: `processingRef` wird nicht zurückgesetzt**

Bei einigen frühen Returns (z.B. Currency-Rates-Fehler) wird `processingRef.current` nicht explizit auf `false` gesetzt. Die eigentliche Stopp-Logik greift, aber der Zustand könnte inkonsistent sein.

---

## Empfehlungen

1. **Logging dauerhaft speichern**  
   Logs z.B. in `localStorage` oder Datei schreiben, damit nach Stopps analysiert werden kann.

2. **Energieverwaltung prüfen**  
   Standby/Sleep in den Nachtstunden vermeiden oder Wake-Timer nutzen.

3. **Währung**  
   Bei USD fällt der Currency-Rates-Stopp weg; bei Crypto-Währungen ist das Risiko höher.

4. **Visibility-API**  
   Wenn die App wieder in den Vordergrund kommt, einen Scan auslösen, um nach Sleep/Wake wieder anzulaufen.

5. **Heartbeat / Statusanzeige**  
   Optional: regelmäßigen „Läuft noch“-Indikator mit Zeitstempel, um zu sehen, ob der Bot tatsächlich durchläuft oder hängt.
