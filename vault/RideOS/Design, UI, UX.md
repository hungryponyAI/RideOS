
Sehr gute Frage – hier entscheidet sich, ob dein Projekt sich wie ein **Hack** oder wie ein **echtes Produkt** anfühlt.

Du baust im Kern ein **Cycling Cockpit + virtuelle Schaltung**.  
Das UI muss daher vor allem eins sein: **extrem klar, schnell erfassbar und nicht überladen**.

---

# 🧠 Grundprinzip (wichtigster Leitgedanke)

👉 Während du fährst, bist du:

- körperlich belastet
    
- kognitiv eingeschränkt
    

➡️ UI muss sein:

- **glanceable (in <1 Sekunde erfassbar)**
    
- **minimal**
    
- **kontextabhängig**
    

---

# 🎯 Zielbild

Deine App ist kein klassisches Dashboard.

👉 Sie ist:  
**ein „Fahr-Cockpit“ – wie im Auto**

---

# 🧩 UI Struktur (empfohlen)

## 🟢 1. Hauptscreen (während der Fahrt)

Das ist **90% deiner UX**

### Layout:

```
---------------------------------
|        Geschwindigkeit        |
|           (groß)              |
|                               |
|   Gang     Watt     Kadenz    |
|                               |
|      Steigung / Widerstand    |
|                               |
|-------- Progress Bar ---------|
```

---

## 🔑 Wichtigste Elemente

### 1. Geschwindigkeit (zentral, groß)

→ primärer Fokus  
→ z. B. 48–72 pt Font

---

### 2. Gang (DEIN USP!)

→ sehr prominent darstellen

Beispiel:

```
GEAR 5
```

oder visuell:

```
[ 1 2 3 4 (5) 6 7 8 ]
```

👉 Das ist dein Differenzierungsmerkmal!

---

### 3. Watt & Kadenz

→ kleiner, aber sichtbar  
→ sekundäre Infos

---

### 4. Steigung / Widerstand

→ visuell statt nur Zahl

Beispiel:

- Balken (bergauf = rot, bergab = blau)
    
- oder Pfeil ↑ ↓
    

---

### 5. Fortschritt (sehr wichtig!)

→ gibt Orientierung

- Strecke (%)
    
- Zeit
    
- Distanz
    

---

# 🎨 Design-Stil

## 🟣 Look & Feel

👉 Mischung aus:

- Zwift (klar, sportlich)
    
- Automotive UI (reduziert, funktional)
    

---

## 🎯 Farben

Minimalistisch:

- Hintergrund: **dunkel (fast schwarz)**
    
- Primär: **weiß / grau**
    
- Akzent: **eine Farbe (z. B. neon grün oder blau)**
    

Beispiel:

- Gang = Akzentfarbe
    
- Steigung = rot/blau
    

---

## 🔤 Typografie

- große, klare Zahlen
    
- keine verspielten Fonts
    

Empfehlung:

- Inter
    
- Roboto
    

---

# 🧭 UX Flow

## 🚀 Start

1. App öffnen
    
2. „Ride starten“
    
3. (optional) Strecke wählen
    

👉 max. 2–3 Klicks!

---

## 🚴 Während der Fahrt

👉 KEINE Menüs  
👉 KEINE komplexe Interaktion

Nur:

- schauen
    
- fahren
    
- schalten
    

---

## ⏸️ Pause Screen

- große Pause Anzeige
    
- Stats sichtbar
    

---

## 🏁 Ende

- einfache Summary:
    
    - Zeit
        
    - Watt avg
        
    - Strecke
        

---

# ⚙️ Interaction Design (sehr wichtig!)

## 🎮 Steuerung

Primär:

- Zwift Click
    

Sekundär:

- Keyboard (für Dev)
    

👉 UI sollte kaum Touch brauchen

---

# 💡 Killer-Feature für UX

## 👉 „Adaptive UI“

UI passt sich an:

### Berg:

- Gang + Steigung größer
    
- weniger andere Infos
    

### Flach:

- mehr Übersicht
    

---

# 🧠 Was du NICHT tun solltest

❌ Zu viele Daten anzeigen  
❌ Kleine Schrift  
❌ Komplexe Navigation während Fahrt  
❌ „App-UI“ statt „Cockpit-UI“

---

# 🏗️ Technische UI Umsetzung

## Frontend

- React + Tailwind
    

## Realtime

- WebSockets / Local State
    

## Performance

- 60fps Updates
    
- minimal re-rendering
    

---

# 🧪 MVP UI (realistisch)

Für Version 1:

👉 Nur:

- Speed
    
- Gear
    
- Watt
    
- einfache Steigung
    

→ reicht völlig!

---

# 🧠 Mein klares Design-Fazit

👉 Dein Produkt lebt von:

**„Weniger UI – mehr Gefühl“**

Wenn du es richtig machst, fühlt es sich an wie:

- ein **Fahrsystem**
    
- nicht wie eine App
    

---

# 🚀 Wenn du willst

Ich kann dir als nächsten Schritt:

👉 ein **konkretes UI Mockup (visuell beschrieben oder als React Code)** bauen  
👉 oder ein **Design System (Farben, Komponenten, Layouts)** definieren

Sag einfach:  
👉 _„Zeig mir ein konkretes Mockup“_


Perfekt – das ist ein richtig starker Move 👍  
Du gehst damit in Richtung **„Broadcast UI“ wie bei Radrennen im TV** – und das passt extrem gut zu deinem System.

Ich zeige dir, wie du das **sauber integrierst**, ohne dein Cockpit zu überladen.

---

# 🧠 Grundidee: Hybrid aus Cockpit + Broadcast Overlay

👉 Du kombinierst zwei Ebenen:

### 1. 🚴‍♂️ Fahr-Cockpit (primär)

- Speed
    
- Gear
    
- Watt
    

### 2. 🗺️ Broadcast Layer (sekundär, aber sichtbar)

- Karte
    
- Strecke
    
- Höhenprofil
    
- aktuelle Position
    

---

# 🧩 Layout (entscheidend!)

## 🥇 Empfohlenes Layout (bewährt & realistisch)

```id="l7rj4z"
-----------------------------------------
| Speed (groß)         Karte (oben rechts)
|                                         
| Gear     Watt      Kadenz               
|                                         
| Steigung / Widerstand                  
|                                         
| Höhenprofil (unten über gesamte Breite)
-----------------------------------------
```

---

# 🗺️ 1. Mini-Karte (oben rechts)

👉 Inspiration: TV-Radübertragungen

## Inhalt:

- gesamte Route (dünne Linie)
    
- gefahrene Strecke (hervorgehoben)
    
- aktuelle Position (Punkt)
    

---

## 🎨 Design

- sehr reduziert (keine Labels!)
    
- dunkler Stil
    
- Strecke:
    
    - grau (gesamt)
        
    - weiß / farbig (aktuell)
        

---

## 💡 Extra (richtig gut!)

- kleine Pfeilrichtung
    
- Zoom dynamisch (je nach Fortschritt)
    

---

# 📈 2. Höhenprofil (unten – dein Highlight)

👉 DAS ist das wichtigste visuelle Element neben Gear

## Darstellung:

```id="6kmnq3"
     /\     
    /  \__        ← Strecke
___/      \___    

      ●              ← aktuelle Position
```

---

## Anzeige:

- X-Achse: Strecke
    
- Y-Achse: Höhe
    
- Marker = deine Position
    

---

## 🎨 Erweiterung (sehr stark!)

Färbung nach Steigung:

- flach → grau
    
- bergauf → rot
    
- bergab → blau
    

👉 sofort verständlich

---

# ⚙️ 3. Steigung + Widerstand (verknüpfen!)

Du hast:

- reale Steigung
    
- virtuelle Schaltung
    

👉 zeig BEIDES:

Beispiel:

```id="mtbf85"
Steigung: +8%
Effektiv: +5%   (wegen Gang)
```

👉 das ist ein **Mega-Feature** deines Systems

---

# 🧭 4. Fortschritt & Position

Kombiniere:

- % der Strecke
    
- verbleibende Distanz
    
- aktueller Abschnitt
    

---

# 🎮 Dynamisches Verhalten (sehr wichtig!)

## 🧠 UI passt sich an

### Berg:

- Höhenprofil größer
    
- Gear hervorgehoben
    

---

### Flach:

- Karte wichtiger
    
- mehr Überblick
    

---

# 🎨 Designstil (Broadcast Look)

Inspiriert von:

- Tour de France Overlays
    
- Zwift HUD
    

---

## Farben:

- Hintergrund: schwarz
    
- Linien: weiß / grau
    
- Steigung:
    
    - rot (bergauf)
        
    - blau (bergab)
        

👉 minimal + funktional

---

# ⚙️ Technische Umsetzung

## 🗺️ Karte

Empfehlung:

- Mapbox GL
    
- oder Leaflet
    

---

## 📈 Höhenprofil

- D3.js oder Recharts
    
- GPX → Höhenpunkte extrahieren
    

---

## 🔄 Live Update

- Position = Funktion von:
    
    - Geschwindigkeit
        
    - Zeit
        

→ Marker + Progress synchron bewegen

---

# 💡 Killer Feature (macht es „Pro-Level“)

## 👉 „Lookahead“

Zeige:

- nächste 200–500 m
    
- kommende Steigung
    

👉 wie im echten Rennen

---

# 🧠 UX-Regel (wichtig!)

👉 Karte + Höhenprofil dürfen NIE dominieren

Priorität bleibt:

1. Speed
    
2. Gear
    
3. Widerstand
    

---

# 🏁 Fazit

👉 Dein UI wird:

- **oben: Aktion (fahren)**
    
- **rechts: Orientierung (Karte)**
    
- **unten: Strategie (Höhenprofil)**
    

👉 Das ist exakt:  
**„Cycling Broadcast Cockpit“**

---

# 🚀 Wenn du willst

Ich kann dir als nächsten Schritt:

👉 ein **konkretes React UI Mockup (inkl. Layout + Komponenten)** bauen  
👉 oder ein **Design-System + Component-Struktur definieren**

Sag einfach:  
👉 _„Baue mir das UI als React Code“_