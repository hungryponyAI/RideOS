Kurz gesagt: **Ja, du kannst dir so eine Web-App bauen** – aber nicht „mal eben“.  
Der Knackpunkt ist **nicht die UI**, sondern die **Echtzeit-Steuerung deines Trainers**.

Ich erkläre dir das realistisch und mit einem **machbaren Architektur-Ansatz** 👇

---

# 🧠 Was du bauen willst (in Systemlogik übersetzt)

Du möchtest:

1. GPX (z. B. aus Komoot) laden
    
2. Position entlang der Strecke berechnen
    
3. Steigung bestimmen
    
4. Widerstand an deinen Wahoo KICKR Core schicken
    
5. optional: virtuelle Schaltung einbauen
    

👉 Das ist im Grunde eine **Mini-Version von Rouvy / Zwift**

---

# ⚠️ Der wichtigste Stolperstein

👉 **Browser allein reicht NICHT**

Warum:

- Trainer kommuniziert über:
    
    - Bluetooth (FTMS)
        
    - ANT+
        
- Browser kann das nur sehr eingeschränkt
    

👉 Lösung:

- **Web-App + Native Bridge (oder Desktop App)**
    

---

# 🏗️ Empfohlene Architektur (realistisch machbar)

## 🔹 Frontend (Web)

- React / Next.js
    
- Features:
    
    - GPX Upload
        
    - Kartenansicht (Mapbox / Leaflet)
        
    - Höhenprofil
        
    - Live Position
        

---

## 🔹 Backend / Local Service (wichtig!)

Hier passiert die Magie:

- Node.js / Python Service lokal laufend
    
- verbindet sich mit dem Trainer
    

👉 Libraries:

- JS: `@garmin/fit-sdk`, `bleat`, `noble`
    
- Python: `bleak`
    

---

## 🔹 Trainer-Kommunikation (Core)

Standard: **FTMS (Fitness Machine Service)**

Damit kannst du:

- Resistance setzen
    
- Simulation Mode aktivieren
    
- Steigung simulieren (!!)
    

---

# 🔁 Datenfluss

1. GPX → Strecke wird in Punkte zerlegt
    
2. Während du trittst:
    
    - Geschwindigkeit vom Trainer lesen
        
    - Position berechnen
        
3. Steigung an aktuellem Punkt berechnen
    
4. → FTMS Befehl an Trainer:
    
    - grade (%)
        
    - rolling resistance
        
    - wind resistance
        

---

# ⚙️ Virtuelle Schaltung (dein spezielles Interesse)

Das kannst du sogar **besser als Rouvy bauen** 👇

## Idee:

- Button / Controller Input
    
- verändert **virtuelle Übersetzung**
    

### Formel:

```
effektive Steigung = reale Steigung / Gangfaktor
```

Beispiel:

- 10 % Steigung
    
- leichter Gang → fühlt sich wie 6 % an
    

👉 Das ist genau das, was Zwift macht

---

# 🔥 MVP (Minimum Viable Product)

So würde ich starten:

## Version 1 (1–2 Wochen)

- GPX Upload
    
- einfache Karte
    
- fixe Geschwindigkeit simulieren
    
- Trainer reagiert auf Steigung
    

---

## Version 2

- echte Daten vom KICKR lesen
    
- Live Position
    

---

## Version 3

- virtuelle Schaltung
    
- UI dafür
    

---

## Version 4 (Premium 😄)

- Video Overlay
    
- Multiplayer
    
- Training Modes
    

---

# 💻 Tech Stack Empfehlung

## Frontend

- React + Mapbox GL
    

## Backend lokal

- Node.js + `noble` (BLE)
    

ODER einfacher:

- Python + `bleak` (sehr stabil für BLE)
    

---

# ⚠️ Herausforderungen (ehrlich)

1. **Bluetooth Stabilität**
    
2. **Latenz (Echtzeit!)**
    
3. **FTMS ist schlecht dokumentiert**
    
4. **Wahoo Eigenheiten**
    

👉 aber: absolut machbar für dich

---

# 🧠 Strategischer Gedanke (wichtig für dich!)

Das ist nicht nur ein Bastelprojekt.

👉 Das ist:

- ein perfektes **LLM + Software + Hardware Projekt**
    
- extrem relevant für deinen Weg Richtung:
    
    - AI / Automotive / Systems Engineering
        

---

# 🏁 Fazit

👉 Ja, du kannst das bauen  
👉 Der Schlüssel ist:  
**nicht Web-App, sondern Trainer-Anbindung**

---

# 🚀 Wenn du willst, gehen wir next level

Ich kann dir:

- eine **konkrete Architektur inkl. Code-Skeleton** bauen
    
- oder direkt:  
    👉 **„Coding-Agent-ready Prompt + Repo Struktur“**
    

Sag einfach:  
👉 _„Baue mir das MVP konkret“_