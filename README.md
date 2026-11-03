# 🪲 He-Kim-Koo (Firefly) - Garmin GPS Breadcrumb Art Navigation Data Field

A high-performance offline custom Data Field for **Garmin Venu 2 Plus** (416 x 416 round AMOLED), designed for the native "Run" activity profile.

Inspired by the bioluminescence of fireflies (*he-kim-koo* in Taiwanese), this project delivers zero-network, zero-server offline navigation. Routes are compressed into ultra-compact **Google Encoded Polyline** strings pasted directly into App Settings. The watch decodes the track into a flat integer microdegree array ($< 1\text{KB}$ memory), featuring **angular exponential smoothing**, **heading-up projection with electronic compass fusion**, **progress-based geometry coloring**, **20m milestone firefly sparks**, **viewport culling**, and **real-time off-course alerts (Cross-Track Distance > 35m)**.

---

## Project Structure

```
.
├── manifest.xml                        # Connect IQ manifest (venu2plus, minApi 3.2.0, offline)
├── monkey.jungle                        # Monkey C jungle build configuration
├── resources/
│   ├── drawables/
│   │   ├── drawables.xml               # Bitmap drawable resource declaration
│   │   └── launcher_icon.png           # 70x70 native AMOLED launcher icon
│   ├── settings/
│   │   ├── properties.xml              # routeString property declaration
│   │   └── settings.xml                # App Settings schema (supports up to 2048 chars)
│   └── strings/
│       └── strings.xml                 # Localized string resources
├── source/
│   ├── RouteApp.mc                     # App lifecycle & settings change listener
│   ├── RouteDataField.mc               # Core compute, heading-up projection, culling & vector drawing
│   └── PolylineDecoder.mc              # Zero-GC Google Polyline microdegree decoder
├── index.html                          # Offline GPX converter & 1:1 Venu 2 Plus simulator
├── docs/
│   └── architecture-plan.md            # Comprehensive architecture and technical specifications
└── README.md                           # Project documentation
```

---

## Quick Start Guide

### Step 1: Generate Route String (`index.html`)

1. Open [`index.html`](./index.html) in your desktop or mobile browser.
2. Drag and drop your GPS art `.gpx` file into the page, or enter a public GPX URL.
3. The offline web tool automatically performs:
   - **Corner Preservation ($> 45^\circ$)**: Locks sharp turning angles to protect cartoon features and text strokes.
   - **Dynamic Binary-Search RDP Simplification**: Automatically adjusts tolerances to converge accurately to **100 ~ 130 points**.
   - **Google Polyline Encoding**: Generates an ultra-compressed string of ~300-500 characters.
4. Click **"📋 Copy Route String"**.

---

### Step 2: Build Project in VS Code

#### Prerequisites:

- Install [Visual Studio Code](https://code.visualstudio.com/).
- Install the **Monkey C** extension from the VS Code Marketplace.
- Press `Cmd + Shift + P` (macOS) or `Ctrl + Shift + P` (Windows), then run `Monkey C: Verify Installation` and `Monkey C: Download Connect IQ SDK` (SDK 4.2.0+ recommended).
- Generate a developer key via `Monkey C: Generate a Developer Key` (saved as `developer_key`).
- Install Java Runtime Environment (e.g. `brew install --cask temurin` on macOS).

#### Compile `.prg` for Device:

1. Open this repository folder in VS Code.
2. Press `Cmd + Shift + P` and execute:
   ```
   Monkey C: Build for Device
   ```
3. Select **Venu 2 Plus** (`venu2plus`).
4. Upon completion, `hekimkoo.prg` is generated in the project root (or `bin/` directory).

---

### Step 3: Install onto Venu 2 Plus

#### Option A: USB Sideload (Fastest for local testing)

1. **Connect Watch**:
   - **macOS**: Since Garmin watches use MTP mode, install and open [OpenMTP](https://openmtp.ganeshrp.com/) or Android File Transfer.
   - **Windows**: The watch appears directly in File Explorer as a storage device.
2. **Transfer Binary**:
   - Copy `hekimkoo.prg` into the watch's **`/GARMIN/APPS/`** folder.
3. **Eject & Disconnect** the USB cable.

#### Option B: Wireless Install via Garmin Connect IQ Store (Beta Release)

1. In VS Code, press `Cmd + Shift + P` ➔ **`Monkey C: Export Project`** to generate `hekimkoo.iq`.
2. Visit the [Garmin Connect IQ Developer Dashboard](https://apps.garmin.com/developer/dashboard) and sign in.
3. Click **"Upload an App"**, select `hekimkoo.iq`, and check **"This is a Beta app"** (private to your account, no public review required).
4. Open the **Connect IQ Store** app on your phone, navigate to your device, and tap **"Install"** to transfer wirelessly over Bluetooth!

---

### Step 4: Configure Data Field & Paste Route

1. **Enable on Watch**:
   - Press the top-right button on the watch ➔ Select **Run**.
   - Long-press the bottom-right back button ➔ **Run Settings** ➔ **Data Screens**.
   - Choose or add a full-screen (1-field) layout.
   - Set the field to **Custom Data Fields** ➔ **He-Kim-Koo (Route Field)**.
2. **Paste Route in Mobile App**:
   - Ensure the watch is paired and connected via Bluetooth.
   - Open the **Garmin Connect** mobile app ➔ Tap the watch icon (**Venu 2 Plus**).
   - Tap **Activities, Apps & More** ➔ **Data Fields**.
   - Tap **He-Kim-Koo (Route Field)** ➔ **Settings**.
   - Paste the copied Polyline string into the **Route String** field and tap Save.
   - The watch immediately loads and displays your GPS art with live navigation!

---

## Core Technical Features

| Feature | Description |
| :--- | :--- |
| **Bioluminescent Night Theme (Plan A)** | AMOLED deep black background, Electric Cyan (4px) upcoming route, Warm Golden Amber (4px) completed route, and a cold lime-green GPS chevron cursor with crisp white border. |
| **Geometry Artwork Completion** | As the runner progresses, completed segments dynamically shift from cyan to warm golden amber with node dots, visualizing the completed art without confusing overlaps. |
| **Comet Stream & 20m Milestone Sparks** | 80-point silky comet trail paired with **20-meter ground-locked milestone sparks (10 dots covering 200m)**. Sparks remain stationary in world coordinates and fade in place, providing an instant distance gauge. |
| **Angular Exponential Smoothing** | Slerp-like angular smoothing filter with $[-\pi, +\pi]$ circular wrapping eliminates sudden perspective snapping during sharp turns or screen toggles. |
| **Flat Microdegree Integer Array** | Replaces multi-dimensional object arrays with a flat `Array<Number>` ($10^{-5}$ deg, 32-bit integers). A 120-point route consumes $< 1\text{KB}$ heap space, preventing OOM. |
| **Heading-Up with Compass Fusion** | Combines `info.currentHeading` with the physical 3-axis electronic compass: rotates with motion while running, and aligns with wrist orientation when stationary. |
| **Viewport Culling** | Automatically skips 2D matrix calculation and drawing for segments outside the 220m viewport radius, conserving CPU cycles and AMOLED battery life. |
| **Progress-Aware Search Window** | Constrains local nearest-point search to `[mProgressIdx - 2, mProgressIdx + 5]`, solving false snapping on intersecting loops and out-and-back tracks. |
| **Real-Time Off-Course Alert** | Displays a high-contrast red alert banner `OFF COURSE (+XXm)` at the top of the screen whenever Cross-Track Distance exceeds 35 meters. |

---

## Offline Simulator Testing

To test in the Connect IQ Simulator in VS Code:

1. Press `F5` to start the Connect IQ simulator.
2. In the simulator menu: **Simulation** ➔ **FIT Data** ➔ **Simulate Data**, or load a recorded GPX track.
3. In **File** ➔ **Edit Persistent Storage** ➔ **Edit Properties**, paste the Polyline string to verify decoding, rendering, and off-course behavior.
