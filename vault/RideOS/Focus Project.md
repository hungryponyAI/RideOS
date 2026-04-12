Gute Entscheidung – das macht dein Projekt **viel klarer und technisch sauberer**.  
Wenn du dich auf **KICKR Core + virtuelle Schaltung** fokussierst, baust du im Kern ein eigenes „Zwift-Light“, aber mit mehr Kontrolle.

---

# 🎯 Zielbild (klar definiert)

Du willst:

- Wahoo KICKR Core steuern
    
- mit Zwift Cog fahren
    
- über Zwift Click schalten
    
- eigene Logik für:
    
    - Widerstand
        
    - virtuelle Gänge
        
    - Strecke / Training
        

👉 **ohne Zwift – komplett eigene App**

---

# 🧠 Systemlogik (der Kern)

Du brauchst 3 Datenströme:

## 1. Input: Trainer (KICKR)

- Geschwindigkeit
    
- Leistung (Watt)
    
- Kadenz
    

## 2. Input: Controller (Click)

- Button „+“ → Gang hoch
    
- Button „–“ → Gang runter
    

## 3. Output: Trainer steuern

- Widerstand / Simulation setzen
    

---

# 🔧 Technischer Kern: FTMS

Der KICKR spricht über:  
👉 **FTMS (Fitness Machine Service via Bluetooth)**

Damit kannst du:

- Simulation Mode setzen
    
- Widerstand definieren
    
- virtuelle Steigung senden
    

---

# ⚠️ Der wichtigste Punkt (entscheidend!)

👉 Der Zwift Click ist **nicht offen standardisiert**

Das bedeutet:

- kein offizielles SDK
    
- kein dokumentierter Zugriff
    

👉 ABER:

- er sendet Bluetooth Signale
    
- die kann man **sniffen / reverse engineeren**
    

---

# 🚀 Realistische Lösung

## Option A (empfohlen für MVP)

👉 Ersetze den Click erstmal durch:

- Keyboard Input
    
- oder einfache BLE Remote
    

→ Fokus auf Logik, nicht Hardware-Hack

---

## Option B (fortgeschritten)

👉 Zwift Click integrieren:

- BLE Sniffing (z. B. mit nRF Connect)
    
- herausfinden:
    
    - welches Signal = hoch/runter
        
- in App interpretieren
    

---

# ⚙️ Virtuelle Schaltung – dein Kernfeature

Du baust im Prinzip:

## 🧮 Übersetzungsmodell

```text
effektive Steigung = reale Steigung / gear_ratio
```

Beispiel:

|Gang|Faktor|Gefühl|
|---|---|---|
|1 (leicht)|0.5|Berg wird halb so schwer|
|5|1.0|realistisch|
|10 (schwer)|1.8|sehr hart|

---

## 🔁 Ablauf in Echtzeit

1. aktuelle Steigung bestimmen
    
2. aktuellen Gang berücksichtigen
    
3. → effektive Steigung berechnen
    
4. → an KICKR senden
    

---

# 🏗️ Architektur (konkret)

## 🔹 Frontend (UI)

- React
    
- zeigt:
    
    - Watt
        
    - Speed
        
    - Gang
        
    - Strecke
        

---

## 🔹 Local Engine (wichtig!)

- Node.js oder Python
    
- Aufgaben:
    
    - BLE Verbindung
        
    - Logik
        
    - Steuerung
        

---

## 🔹 Module

### Trainer Interface

- verbindet mit KICKR
    
- liest Daten
    
- sendet Widerstand
    

---

### Gear Engine

- verwaltet Gang
    
- berechnet Übersetzung
    

---

### Simulation Engine

- kombiniert:
    
    - Strecke
        
    - Gang
        
    - Physik
        

---

# 💡 MVP Plan (konkret & realistisch)

## Phase 1 (2–3 Tage)

- KICKR verbinden
    
- Daten auslesen (Watt, Speed)
    

---

## Phase 2

- Widerstand setzen (manuell)
    

---

## Phase 3

- einfache virtuelle Gänge (Keyboard)
    

---

## Phase 4

- GPX Integration (optional später)
    

---

## Phase 5

- Zwift Click Integration (optional)
    

---

# ⚠️ Technische Herausforderungen

## 1. Bluetooth Stabilität

- oft der größte Pain
    

## 2. FTMS Verhalten (Wahoo quirks)

- nicht immer sauber dokumentiert
    

## 3. Click Reverse Engineering

- Trial & Error
    

---

# 🧠 Warum das ein starkes Projekt ist

Du baust:

- Hardware Integration
    
- Echtzeit-System
    
- eigenes Steuerungsmodell
    
- optional später:
    
    - AI Coach
        
    - Route Engine
        

👉 Das ist **echtes System Engineering**

---

# 🏁 Fazit

👉 Ja, dein Fokus ist genau richtig:

- ❌ kein Street View (erstmal)
    
- ✅ Fokus auf Trainer + virtuelle Schaltung
    

👉 Der kritische Punkt:

- **Control Loop sauber implementieren**
    

---

# 🚀 Nächster sinnvoller Schritt

Wenn du willst, kann ich dir:

👉 ein **konkretes Code-Skeleton (Node.js oder Python)** geben

- inkl. BLE Verbindung zum KICKR
    
- - einfache virtuelle Gang-Logik
        

oder:

👉 dir zeigen, wie du den **Zwift Click konkret sniffst und integrierst**

Sag einfach:  
**„Gib mir das MVP als Code“**