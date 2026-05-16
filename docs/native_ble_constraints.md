# Native BLE Constraints for Capacitor Packaging

## Summary

RideOS uses BLE (via the Python bleak engine) to communicate with the KICKR Core trainer and Zwift Click remote. Before packaging for iOS/Android with Capacitor, the following constraints must be understood and addressed.

## Architecture Context

The current BLE stack runs entirely in the Python engine on macOS:
- **Layer 1**: Python asyncio + bleak → handles all BLE scanning, connection, FTMS writes, and Click sniffing
- **Layer 2**: React UI ↔ Python via WebSocket (localhost)
- **Capacitor**: would wrap the React UI as a native web view — the BLE engine cannot move into Capacitor's web layer

## Native Packaging Approaches

### Option A: Python engine on device (not feasible)
Running the Python bleak engine inside a mobile app is not practical — Python runtime packaging for iOS/Android is complex, and App Store policies restrict background execution.

### Option B: Capacitor + separate BLE bridge (recommended path)
Keep the Python engine on a macOS/Windows host machine. The Capacitor app connects to the engine via WebSocket over the local network (same Wi-Fi).

- **Pros**: No changes to BLE logic; existing engine ships as-is
- **Cons**: Requires host machine running during rides; adds local network dependency
- **UX**: App shows connection setup screen with host IP or mDNS autodiscovery

### Option C: Rewrite BLE in Capacitor native plugin
Replace bleak with a Capacitor plugin using `@capacitor-community/bluetooth-le` or platform-native BLE APIs.

- **Pros**: True standalone mobile app; no host machine needed
- **Cons**: Full rewrite of BLE, FTMS control loop, and gear engine; significant effort

## iOS BLE Constraints

- BLE requires `NSBluetoothAlwaysUsageDescription` in `Info.plist`
- Background BLE requires `bluetooth-central` background mode — required to maintain KICKR connection when app is backgrounded
- App backgrounding without background mode: connection drops after ~10s
- Central role (scanning + connecting) is well-supported; peripheral role not needed

## Android BLE Constraints

- Requires `BLUETOOTH_CONNECT` and `BLUETOOTH_SCAN` permissions (Android 12+)
- `BLUETOOTH_SCAN` with `neverForLocation: true` if not using BLE for location
- Background BLE: foreground service required to maintain connection
- Capacitor BLE plugins handle permission declarations automatically

## Zwift Click Constraint

The Zwift Click uses an undocumented BLE protocol (reverse-engineered). See `engine/engine/click/` for the implementation. For native, the same sniffing/activation sequence would need to be replicated in a native BLE plugin or kept on the host engine.

## Current Web UI Safe-Area Readiness

The web UI is ready for native wrapping:
- `viewport-fit=cover` in `index.html` enables safe area env() variables
- Bottom nav uses `env(safe-area-inset-bottom, 0px)` padding
- Ride controls use safe-area-aware bottom positioning
- `manifest.webmanifest` and `capacitor.config.json` are present at `ui/`

## Pre-Packaging Checklist

- [ ] Decide between Option B (remote engine) or Option C (native BLE rewrite)
- [ ] If Option B: implement mDNS/Bonjour service discovery for engine IP
- [ ] If Option B: add network permission request in Capacitor app
- [ ] Generate PNG app icons from `public/icon-maskable.svg` (192×192, 512×512, 1024×1024)
- [ ] Test all screens at iOS safe-area heights (iPhone with notch / Dynamic Island)
- [ ] Validate `prefers-reduced-motion` on iOS (Reduce Motion in Accessibility settings)
- [ ] Test PWA manifest install prompt on Android Chrome
- [ ] Review App Store / Play Store privacy requirements for health/fitness apps
