# 🌾 Farmart (S-farmart) — Production Hyperlocal Food & Agri Commerce Platform

**Farmart** is an enterprise-grade, hyper-local digital commerce ecosystem (engineered on the Swiggy / Zomato / Blinkit model) connecting verified local farmers, home chefs (Nari Shakti), and community producers directly with consumers for ultra-fast 20–35 minute deliveries powered by an autonomous rider partner fleet.

---

## 📑 Master Table of Contents
1. [Ecosystem Architecture & System Flow](#-ecosystem-architecture--system-flow)
2. [Tri-App Design Philosophy & UI/UX Systems](#-tri-app-design-philosophy--uiux-systems)
3. [Customer App (`userApp`) — UI Design & Functionality](#-customer-app-userapp--ui-design--functionality)
4. [Partner App (`partnerApp`) — UI Design & Functionality](#-partner-app-partnerapp--ui-design--functionality)
5. [Rider App (`deliveryApp`) — UI Design & Functionality](#-rider-app-deliveryapp--ui-design--functionality)
6. [Real GPS Detection & Google Maps Navigation](#-real-gps-detection--google-maps-navigation)
7. [Live Radar Map & Rider Motion Telemetry](#-live-radar-map--rider-motion-telemetry)
8. [Dual-OTP Security Handshake Protocol](#-dual-otp-security-handshake-protocol)
9. [60-Second Auto-Accept & Order Lifecycle](#-60-second-auto-accept--order-lifecycle)
10. [Backend Transactional Engine & ACID Concurrency](#-backend-transactional-engine--acid-concurrency)
11. [Mobile Zero-Crash Architecture (Hermes & Native Safety)](#-mobile-zero-crash-architecture-hermes--native-safety)
12. [Master Test Suite (27/27 Tests Passing) & Full Cycle Script](#-master-test-suite-2727-tests-passing)
13. [Demo Accounts & Test Credentials](#-demo-accounts--test-credentials)
14. [Quick Start & Running Locally](#-quick-start--running-locally)

---

## 📲 Direct Standalone APK Downloads (Install Directly on Android)

You can download and install the production-ready standalone APKs directly onto any Android phone:

| Application | Direct APK Download Link | EAS Build Dashboard | Status |
| :--- | :--- | :--- | :--- |
| **🏪 Partner Portal (`partnerApp`)** | [⬇️ **Download Partner APK (v1.0.0)**](https://expo.dev/artifacts/eas/308ruSGs-6RbNi2kbOgWj_1pyy8wY4J17Nw1T2pmNDg.apk)<br>[📦 **Download Play Store AAB (v1.0.0-b4)**](https://expo.dev/artifacts/eas/1lGCPbUOnNSzOw_PpfMzBuzP55iSALenufyw5kUrEY8.aab) | [EAS Partner Dashboard (Build 4)](https://expo.dev/accounts/sfarmart/projects/sfarmart-partner/builds/02e5ddd1-3084-43ee-92ed-a67f3f61401e) | `FINISHED (Verified .aab)` |
| **🛒 Consumer App (`userApp`)** | [⬇️ **Download User APK (v1.0.0)**](https://expo.dev/artifacts/eas/vmnDnyLaiaguyEPAwb5YzZehXOMkgrXGxx_sfO948oo.apk)<br>[📦 **Download Play Store AAB (v1.0.0-b4)**](https://expo.dev/artifacts/eas/paO6d3GS1tUUXcnkxTCWKaHbzcnNphTsUnPMDpHE9mI.aab) | [EAS User Dashboard (Build 4)](https://expo.dev/accounts/sfarmart/projects/userApp/builds/9dbb8f7a-6257-4a5a-bd33-e17fb98b68d8) | `FINISHED (Verified .aab)` |
| **🛵 Rider App (`deliveryApp`)** | Production Web Portal on Port `8083` | [Expo Metro Bundler](http://localhost:8083) | `ACTIVE (Web & Android)` |

---

## 🏛️ Ecosystem Architecture & System Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       FARMART TRI-APP ECOSYSTEM                                        │
├───────────────────────────────────┬──────────────────────────────────┬─────────────────────────────────┤
│ 🛒 Customer App (`userApp`)       │ 🏪 Merchant App (`partnerApp`)   │ 🛵 Rider App (`deliveryApp`)    │
│ Port 8081 • React Native Web/App  │ Port 8082 • React Native Web/App │ Port 8083 • React Native Web/App│
│ • Category-First Discovery        │ • Looped Audio Chime & Vibrate   │ • Geospatial Dispatch Modal     │
│ • Real GPS & Google Maps Pin      │ • 60s Auto-Accept Kitchen Queue  │ • Turn-by-Turn Google Maps Nav  │
│ • Live Radar Map (Speed & Stops)  │ • Store Duty Toggle (Glow Ring)  │ • Dual-OTP Handshake Inputs     │
│ • Dual-OTP (Store & Doorstep)     │ • Store Pickup OTP Verification  │ • Real-time Location Beacons    │
│ • Instant Razorpay / UPI / COD    │ • Inventory & Payout Ledger      │ • Live Earnings & Trip Ledger   │
└─────────────────┬─────────────────┴────────────────┬─────────────────┴────────────────┬────────────────┘
                  │                                  │                                  │
                  │ REST + WebSockets (Socket.IO)    │ REST + WebSockets (Socket.IO)    │ REST + WebSockets (Socket.IO)
                  ▼                                  ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              ⚙️ Central Transactional Server (Port 5000)                               │
│                         Node.js • Express 5 • Socket.IO • Mongoose ODM Engine                          │
│                Rooms: vendor:{vendorId} • customer:{userId} • rider:{riderId} • order:{orderId}        │
│        Features: ACID Transactions • 2dsphere Geospatial Dispatch • Dynamic Haversine • Auto-Recovery │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              🍃 MongoDB Atlas 3-Node Replica Set (Cloud DB)                            │
│                         Multi-Document ACID Transactions (session.withTransaction)                     │
│               Collections: categories • vendors • products • orders • users • riders • refreshtokens   │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Tri-App Design Philosophy & UI/UX Systems

All three applications in the ecosystem are crafted with modern, mobile-first design aesthetics and rich visual feedback tailored to their specific operational roles:

| Design Dimension | Customer App (`userApp`) | Partner App (`partnerApp`) | Rider App (`deliveryApp`) |
| :--- | :--- | :--- | :--- |
| **Primary Theme** | Emerald Fresh Green (`#16a34a`, `#15803d`) | Merchant Crimson & Amber (`#ea580c`, `#dc2626`, `#0f172a`) | Cyber Dark Neon HUD (`#0284c7`, `#10b981`, `#0f172a`) |
| **Background & Surfaces**| Slate Clean White & Gray (`#f8fafc`, `#ffffff`) | Merchant Console Dark Header (`#0f172a`, `#1e293b`) | AMOLED Deep Slate (`#0b132b`, `#1c2541`, `#3a506b`) |
| **Typography** | Inter / System Sans-Serif, high-contrast weights | Heavy numerical typography for quick glance in noisy kitchens | High-visibility bold HUD numerals for outdoor sunlight riding |
| **Micro-Animations** | Category chip tap bounce, cart badge pulse | Zomato-style breathing glow ring for Store Online/Offline status | Pulsing 20s dispatch ring & radar sweep ripple on live map |
| **Audio & Haptics** | Soft confirmation feedback | Dual-tone looping audio chime + native pulse vibration on new order | High-urgency alert chime & dual-vibration pulse on incoming trip offer |
| **Alert System** | Universal `showAlert` (Hermes crash-proof) | Universal `showAlert` + structured rejection selector modal | Universal `showAlert` + modal confirmation & OTP sheets |
| **Viewport Support** | Responsive mobile-first (`412x924`) to Desktop | Responsive mobile-first (`412x924`) to Kitchen Tablet view | Responsive mobile-first (`412x924`) optimized for bike handlebar mount |
| **Navigation & Maps** | Live Canvas Radar Map + Speed & Stops status | Store pickup directions & partner handoff notes | Direct 1-tap Google Maps turn-by-turn navigation to user GPS pin |

---

## 🛒 Customer App (`userApp`) — UI Design & Functionality

The Customer App delivers an ultra-fast, frictionless shopping experience for groceries, organic fruits, and home-cooked meals:

### 1. Guest Browsing & Marketplace Discovery
* **Unrestricted Browsing:** Consumers can immediately browse the marketplace, category grids, store pages, and product details without being forced into a login wall.
* **8 Seeded Categories:**
  1. *Fresh Fruits & Vegetables*
  2. *Dairy, Bread & Eggs*
  3. *Atta, Rice & Dal*
  4. *Oil, Ghee & Masala*
  5. *Ghar Ka Khana / Home Thali*
  6. *Mithai & Bakery*
  7. *Snacks & Munchies*
  8. *Cold Drinks & Juices*
* **Store Rails:** Featured local merchants, verified farm hubs, and Home Chef spotlights with live operating status (`🟢 Open Now` vs `🔴 Closed`).
* **Search & Filters:** Search by product name or ingredient, with instant Vegetarian / Non-Vegetarian toggle pills.

### 2. Single-Store Cart Architecture
* **Single-Vendor Enforcement:** In accordance with hyper-local delivery logistics, a customer cart is strictly locked to **one store at a time**.
* **Smart Conflict Interception (`ClearCartModal`):** If a customer attempts to add an item from *Vendor B* while having items from *Vendor A*, a modal cleanly explains the conflict with two choices:
  - *Keep Current Cart:* Discards new item, preserves existing cart.
  - *Replace Cart:* Atomically clears old items and starts fresh with the new store.
* **Server-Side Rejection:** If a crafted HTTP request attempts to submit items from multiple vendors to `POST /api/orders`, the server strictly rejects it with `HTTP 400 MULTI_VENDOR_CART`.

### 3. Contextual Auth Gate & Cart Merge
* **Deferred Login (`useAuthGate`):** The customer is only prompted to log in when attempting checkout or viewing order history.
* **Floating Bottom Sheet (`AuthModal`):** Smoothly mounts over the screen without reloading or resetting the cart state underneath.
* **1-Tap Demo Login:** Instant authentication with pre-seeded demo credentials (`9876543210` / `demo123`).
* **Cart Merge Resolution (`POST /api/cart/merge`):**
  - If server cart is empty: Guest cart items populate server cart.
  - If server cart belongs to the same vendor: Quantities are summed and validated against stock.
  - If server cart belongs to another vendor: Prompts user with `CartMergeModal` (`409 MERGE_VENDOR_CONFLICT`) to choose which store cart to retain.

### 4. Interactive Checkout & Multi-Gateway Simulation
* **Bill Breakdown:**
  - Item Total
  - Delivery Partner Fee (`FREE` above ₹200)
  - Govt. Restaurant GST (5% for Home Kitchens)
  - Store Minimum Order Verification (warns with shortfall amount if subtotal < minOrderValue)
  - Grand Total
* **Interactive Payment Simulation:**
  - **Instant UPI Apps:** Google Pay, PhonePe, Paytm, CRED
  - **QR Code Scan:** Dynamic UPI QR code preview
  - **Credit / Debit Cards:** Card entry simulation with Luhn validation
  - **Cash on Delivery (COD):** Direct confirmation without pre-payment

### 5. Real GPS Location & Interactive Checkout (`CheckoutScreen.js`)
* **1-Tap Real GPS Auto-Detection:**
  - Customer can tap **"📍 Use Real GPS Location (Google Maps)"** to trigger browser/device geolocation (`navigator.geolocation` / `expo-location`).
  - Automatically reverse-geocodes coordinates into road, area, and city, while strictly preserving latitude & longitude (`order.address.lat`, `order.address.lng`).
  - **Google Maps Preview:** Instant 1-tap link (`🗺️ Preview on Map`) opens the exact coordinates pin on Google Maps (`https://www.google.com/maps?q=lat,lng`) for customer peace of mind.
* **Dual-OTP Handshake Generation:**
  - Checkout generates a random 4-digit **Customer Delivery OTP** (`order.deliveryOtp`, e.g., `4829`) and a **Store Pickup OTP** (`order.pickupOtp`, e.g., `1234`).
  - Doorstep OTP is prominently displayed in a golden security badge on the customer's live tracking screen to hand over to the delivery partner upon arrival.

### 6. Live Radar GPS Tracking (`OrderTrackingScreen.js` & `LiveOrderMap.js`)
* **Interactive Radar Canvas Map:**
  - High-contrast visual field displaying:
    - 🏬 **Store Pin** (Merchant Kitchen / Farm Hub)
    - 🏠 **Customer Pin** (Customer Doorstep)
    - 🏍️ **Animated Rider Marker** with pulsating radar rings and real-time positioning.
* **Live Rider Motion & Stop Detection:**
  - **🟢 Moving:** Speed > 2 km/h — *"Rider is Moving (24 km/h)"*.
  - **🟡 Stopped at Signal / Junction:** Speed ≤ 2 km/h and trip active — *"Rider Stopped (0 km/h) • At Traffic Signal / Junction"*.
  - **🏪 Stopped at Kitchen:** When rider arrives at the merchant location — *"Rider Stopped at Kitchen Counter"*.
* **Dynamic Telemetry & ETA:**
  - Mathematical Haversine distance remaining in kilometers (e.g. `2.4 km`).
  - Live dynamic ETA based on current speed (e.g. `8 mins`).
  - 1-tap **"Open in Google Maps"** navigation button launching driving directions between rider and customer.

## 🏪 Partner App (`partnerApp`) — UI Design & Functionality

The Partner App is designed as a mission-critical operating console for busy store owners, home chefs, and farmers:

### 1. Merchant Dashboard & Multi-Store Switcher
* **Store Switcher Bar:** 1-tap fast switching between verified merchant accounts:
  - **Shimla Fresh Orchards:** Manpreet Singh (`9876543214`)
  - **Sunita Home Restro & Sweets:** Sunita Sharma (`9876543211`)
  - **Sukhwinder Organic Farms:** Sukhwinder Singh (`9876543212`)
  - **Gurpreet Fresh Orchards:** Gurpreet Singh (`9876543213`)
* **Real-time Metrics:** Today's Sales with rolling counter (`AnimatedNumber`), Active In-Flight Orders count, and Store Rating.
* **Persistent Session Storage:** Uses `@react-native-async-storage/async-storage` to ensure partner logins survive app restarts and reboots.

### 2. Store Online / Offline Duty Switch
* **Breathing Glow Pulse:** Zomato-style animated pulsing glow ring (`1.0x` to `1.28x`) indicating live store status.
* **Instant Availability Broadcast:** Toggling store status immediately syncs across all customer devices.
* **Offline Protection:** Any order placed while store is offline is immediately blocked with `HTTP 400 VENDOR_CLOSED`.

### 3. Incoming Order Alert & Modal (`NewOrderModal`)
* **Instant WebSocket Event (`order:new`):** Delivered in `< 600 ms` to room `vendor:{vendorId}` with 5-second polling fallback.
* **Sensory Alerts:** Looping Web Audio API dual-tone chime (G5 & C6 sine wave) + native pulsed vibration pattern `[0, 500, 300, 500]`.
* **Zero-Crash Animation Drivers:** Synchronized JS-driven scale and border pulsing (`useNativeDriver: false`) eliminating Android `NativeAnimatedNodesManager` invariant crashes.
* **60-Second Auto-Accept:** Guarantees kitchen preparation starts even if the merchant is away from the device.

### 4. 1-Tap Quick Add Catalog & Inventory Management (`AddProductScreen.js`)
* **⚡ 1-Tap Quick Add Carousel:** 9 high-resolution pre-configured merchant presets with direct 1-tap instant add:
  - 🍛 **Veg Thali** (Punjabi Royal Thali - ₹120)
  - 🥦 **Green Veggies** (Broccoli, Spinach, Greens - ₹60)
  - 🥔 **Potatoes** (Mountain Crisp Aloo - ₹30)
  - 🍎 **Kashmiri Apples** (Sweet Red Apples - ₹140)
  - 🫓 **Hot Parathas** (Desi Ghee Paratha 2 pcs - ₹50)
  - 🥛 **Pure Milk** (A2 Raw Cow Milk - ₹65/L)
  - 🍯 **Desi Sweets** (Desi Ghee Gulab Jamun - ₹180)
  - 🍅 **Tomatoes** (Farm Fresh Red Tomatoes - ₹35)
  - 🧅 **Fresh Onions** (Firm Red Pyaz - ₹35)
* **Jitter-Free Keyboard Layout:** Configured with `"softwareKeyboardLayoutMode": "pan"` in `app.json` to prevent input shaking or focus loss on mobile devices.
* **Catalog Management:** Real-time stock toggle switches with instant customer sync (`product:stock`), quick +10/+25/+50 restock chips, and custom quantity modal.

### 5. Wednesday Automated Settlements & Banking Hub
* **Automated Weekly Payouts:** Every Wednesday, accumulated revenue is disbursed directly to the merchant's registered bank account (State Bank of India `*4321`).
* **Live Projection Hero Card:** Real-time calculation of pending earnings ready for the next scheduled payout.
* **Historical Audit Ledger:** Detailed past payout records with banking reference IDs (`FARM-PAY-XXXXX`) and `PAID TO BANK` badges.

---

## 🛵 Rider App (`deliveryApp`) — UI Design & Functionality

The Rider Partner App is an industrial-grade mobile and web operating console (Port 8083) engineered for high-performance hyper-local dispatch, outdoor sunlight readability, and swift doorstep fulfillment:

### 1. Cyber Dark Neon HUD Design
* **AMOLED Deep Slate Palette:** Deep background surfaces (`#0b132b`, `#1c2541`) with high-contrast neon cyan (`#0284c7`) and emerald (`#10b981`) indicators, preventing battery drain and eliminating glare on motorcycle handlebar mounts.
* **Large Touch Targets:** Minimum 48px touch controls designed for one-handed operation and easy tapping while wearing riding gloves.
* **Audio-Tactile Chime Modal:** Incoming trip offers trigger an urgent 20-second countdown chime with looping Web Audio synthesis and native pulse vibration.

### 2. Tab Navigation & Screen Breakdown
* ⚡ **Duty Console (`DutyScreen.js`):**
  - Instant **Online / Offline** duty toggle switch (`status: 'ONLINE_IDLE'`).
  - Active Orders Queue: Displays all unassigned `READY_FOR_RIDER` orders within the rider's zone with 1-tap **"Accept Delivery"** action.
  - Today's earnings ticker and completed trips counter.
* 🧭 **Active Trip Navigation (`ActiveNavigationScreen.js`):**
  - **3-Stage Step Navigation:**
    1. *Navigate to Store:* Store address, merchant contact dialer, and **"Arrived at Store"** button.
    2. *Collect Parcel:* 4-digit Store Pickup OTP verification modal to unlock parcel handover.
    3. *Doorstep Delivery:* Customer address with exact GPS coordinates badge, 1-tap Google Maps turn-by-turn navigation, COD Cash Collection alert (`Collect ₹X` / `Prepaid ₹0`), and 4-digit Customer Delivery OTP verification.
* 💰 **Earnings & Payout Ledger (`EarningsScreen.js`):**
  - Real-time earnings breakdown (`todayEarningsPaise`, `totalEarningsPaise`).
  - Milestone incentive progress tracker (e.g. *Deliver 10 orders today for a +₹150 cash bonus*).
  - Weekly Wednesday direct bank transfer schedule.
* 👤 **Profile & Vehicle Details (`ProfileScreen.js`):**
  - Verified KYC status (`VERIFIED_RIDER`).
  - Vehicle specifications: Model, type (Bike / Scooter / E-Cycle), and registration number (e.g. `PB-10-AB-1234`).
  - Emergency contact and banking disbursement details.

---

## 📍 Real GPS Detection & Google Maps Navigation

Farmart bridges digital ordering with physical doorstep delivery through exact GPS coordinate synchronization:

```
[Customer Checkout] ──▶ Real GPS Fixed: 30.9010° N, 75.8573° E ──▶ Stored in MongoDB order.address
                                                                            │
                                                                            ▼
[Rider Active Trip] ◀── 1-Tap "Google Maps" Direct Driving Link ◀── Coordinates Passed to Rider
```

1. **Customer GPS Pin Selection (`userApp/CheckoutScreen.js`):**
   - The user taps **"📍 Use Real GPS Location (Google Maps)"** at checkout.
   - Uses `navigator.geolocation` / device GPS with OpenStreetMap reverse geocoding fallback.
   - Coordinates (`lat`, `lng`) are preserved and transmitted inside the order payload.
   - Customer can preview the pin immediately via the embedded Google Maps link (`https://www.google.com/maps?q=lat,lng`).
2. **Server-Side Coordinate Persistence (`server/controllers/orderController.js`):**
   - `createOrder` extracts `address.lat` and `address.lng` and stores them directly on `order.address`.
3. **Rider Turn-by-Turn Driving (`deliveryApp/ActiveNavigationScreen.js`):**
   - Customer destination shows an exact coordinates badge: `GPS: lat°N, lng°E (Exact Google Maps Pin)`.
   - Tapping **"Google Maps"** opens direct driving route navigation in Google Maps app / web:
     ```
     https://www.google.com/maps/dir/?api=1&destination=lat,lng
     ```
   - Rider arrives directly at the customer's doorstep without calling for directions.

---

## 🛰️ Live Radar Map & Rider Motion Telemetry

Customers enjoy complete visual transparency of their delivery via the interactive radar component ([`userApp/src/components/LiveOrderMap.js`](./userApp/src/components/LiveOrderMap.js)):

1. **Interactive Radar Canvas:**
   - Visualizes the 🏬 **Store**, 🏠 **Customer Doorstep**, and 🏍️ **Moving Rider Marker** on a dynamic radar grid with expanding pulse rings.
2. **Intelligent Rider Motion & Stop Detection:**
   - **🟢 Moving:** Speed > 2 km/h — displays banner: *"Rider is Moving (24 km/h)"*.
   - **🟡 Stopped at Signal / Junction:** Speed ≤ 2 km/h during transit — displays banner: *"Rider Stopped (0 km/h) • At Traffic Signal / Junction"*.
   - **🏪 Stopped at Kitchen Counter:** Rider arrived at store — displays banner: *"Rider Stopped at Kitchen Counter"*.
3. **Dynamic Distance & ETA:**
   - Computes real-time remaining distance in kilometers using the mathematical Haversine formula.
   - Calculates dynamic ETA in minutes based on active rider speed.
4. **Google Maps Driving Route Overlay:**
   - 1-tap **"Open in Google Maps"** button creates a live route from the rider's current position directly to the customer:
     ```
     https://www.google.com/maps/dir/?api=1&origin=riderLat,riderLng&destination=custLat,custLng
     ```

---

## 🔐 Dual-OTP Security Handshake Protocol

To prevent fraudulent deliveries, misplaced parcels, and false handoffs, Farmart implements a **Two-Tier Dual-OTP Verification Protocol**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DUAL-OTP SECURITY PROTOCOL                                      │
├────────────────────────────────────────┬────────────────────────────────────────────────────────┤
│ 1️⃣ STORE PICKUP OTP (Pickup Handshake) │ 2️⃣ CUSTOMER DELIVERY OTP (Doorstep Handshake)          │
│ • Generated when order is accepted     │ • Generated upon order creation                        │
│ • Displayed on Merchant Console        │ • Displayed in Customer Tracking Screen (userApp)      │
│ • Rider enters OTP in deliveryApp      │ • Rider enters OTP in deliveryApp at doorstep          │
│ • Transitions: READY ➔ OUT_FOR_DELIVERY│ • Transitions: OUT_FOR_DELIVERY ➔ DELIVERED            │
│ • Prevents wrong order pickup at store │ • Guarantees genuine doorstep handover & payment cash  │
└────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## ⏱️ 60-Second Auto-Accept & Order Lifecycle

To prevent customer orders from being abandoned if a merchant is busy cooking or has stepped away, Farmart includes a **Dual-Layer 60-Second Auto-Accept Guarantee**:

```
[Customer Places Order] 
          │
          ├─────────────────────────────────────────┐
          ▼ (Real-time Socket < 1s)                 ▼ (Server 60s Timeout)
   [Partner App Alerts]                      [Background Daemon]
   • Looping Audio Chime                     • Starts 60-second safety clock
   • Full-Screen Modal Opens
   • Countdown: "Auto-accepts in: 60s"
          │
   ┌──────┴──────┐
   │             │
[Partner Taps]   [Timer Reaches 0s]
   │             │
   │             ▼
   │      [Auto-Accept Triggered]
   │      • Sound stops
   │      • Status becomes ACCEPTED
   │      • Modal closes
   │      • Moves to "Live Orders Queue"
   │             │
   └─────────────┼──────────────────────────┐
                 ▼                          ▼
       [Kitchen Preparation]       [Customer Notified]
       • Orange button appears:    • Live tracker updates:
         "Start Cooking & Packing"   "Order Accepted!"
```

### Complete State Machine Transitions
1. **`NEW_ORDER`**: Incoming order, awaiting merchant acceptance or 60s auto-acceptance.
2. **`ACCEPTED`**: Order accepted. Merchant sees the orange **"Start Cooking & Packing"** action button.
3. **`PREPARING`**: Food is being prepared or farm produce is being sorted and weighed.
4. **`READY_FOR_RIDER`**: Order is packed and bagged. Merchant taps **"Order is Packed"**.
5. **`OUT_FOR_DELIVERY`**: Delivery rider has picked up the package.
6. **`DELIVERED`**: Final terminal state upon customer Delivery OTP verification.
7. **`REJECTED` / `CANCELLED`**: Stock is immediately and atomically refunded back into MongoDB (`+$inc: qty`).

---

## 🍃 Backend Transactional Engine & ACID Concurrency

The backend server is built on **Node.js, Express 5, and Mongoose with MongoDB Atlas Replica Set**:

### 1. Atomicity (All-or-Nothing Guarantee)
* Order placement executes inside a native MongoDB multi-document session transaction (`session.withTransaction`).
* Stock deductions across all line items, order document creation, vendor order counter increments, and customer cart reset succeed together or roll back completely.

### 2. Consistency & Non-Negative Stock Invariant
* Stock deductions enforce the strict invariant:
  ```javascript
  { _id: item.productId, stockQty: { $gte: item.qty } }
  ```
* Inventory can never drop below zero.

### 3. Isolation & High-Concurrency Anti-Overselling
* Tested under extreme burst conditions: 4 concurrent customer orders arriving at the exact same millisecond demanding 8 units against a stock of only 5 units.
* **Outcome:** Exactly 2 orders succeed (4 units deducted), 2 orders cleanly fail with `INSUFFICIENT_STOCK`, and remaining stock in the database is exactly 1 unit. Zero overselling, zero partial transactions.

### 4. Durability
* All committed transactions are confirmed with `majority` write concern on MongoDB Atlas 3-node replica set with write-ahead journaling.

### 5. Robust Security & Error Guards
* **Malformed ObjectId Guard:** Inputs like `/api/vendors/invalid-slug/products` or `/api/products/not-an-id` return `HTTP 400 INVALID_ID` rather than crashing the server with 500 `CastError`.
* **Cross-User Data Isolation:** Customers cannot read foreign orders (`HTTP 403 / 404`).
* **Hard Auth Gate:** Unauthenticated checkout attempts are blocked with `HTTP 401 UNAUTHORIZED`.

---

## 🛡️ Mobile Zero-Crash Architecture (Hermes & Native Safety)

To guarantee the apps never crash on physical mobile devices (Android / iOS / Mobile web), defensive mechanisms are enforced across the codebase:

1. **Universal `showAlert` (Hermes Crash Hazard Eliminated):**
   - On native React Native (Hermes engine), calling global `alert()` throws `ReferenceError: alert is not defined`.
   - All bare `alert()` calls across both apps have been replaced with the cross-platform `showAlert` helper ([`userApp/src/utils/alert.js`](./userApp/src/utils/alert.js) and [`partnerApp/src/utils/alert.js`](./partnerApp/src/utils/alert.js)).
2. **Deep Null Safety & Fallbacks:**
   - Unpopulated product references guarded: `const p = it.product || {};`.
   - Quantity fallbacks: `item.qty ?? item.quantity ?? 1`.
   - Route params protected: `const { order = {} } = route?.params || {};`.
   - Dialer exception catch: `.catch()` attached to `Linking.openURL('tel:...')` preventing unhandled promise rejections on tablet or SIM-less devices.
3. **Global Process Traps:**
   - `ErrorUtils.setGlobalHandler` attached in both mobile roots ([`userApp/App.js`](./userApp/App.js) and [`partnerApp/App.js`](./partnerApp/App.js)) to suppress unexpected native runtime exceptions.
   - `unhandledrejection` event listeners suppress asynchronous promise errors.
4. **Viewport Fit & Sticky Footer Protection:**
   - Removed hardcoded `100vh` constraints that previously pushed the sticky checkout bar out of view on web containers.
   - Pinned bottom bar and checkout buttons are 100% visible across all device resolutions.

---

## 🧪 Master Test Suite (27/27 Tests Passing)

The repository features an automated production acceptance test suite: [`server/utils/runAcceptanceTests.js`](./server/utils/runAcceptanceTests.js).

### Run the Acceptance Suite
```bash
npm test
```
*(Or `node server/utils/runAcceptanceTests.js`)*

### Test Results Breakdown

```text
======================================================================
🌾 STARTING FARMART PRODUCTION MASTER TEST SUITE
======================================================================

--- SUITE 1: System & Server Health ---
  ✅ PASS | [Suite 1: Health] Backend API Health Endpoint (Status: OK)
  ✅ PASS | [Suite 1: Health] User App Metro Bundler Reachability (HTTP 200)
  ✅ PASS | [Suite 1: Health] Partner App Metro Bundler Reachability (HTTP 200)
  ✅ PASS | [Suite 1: Health] WebSocket Server Connection & Handshake (Connected on port 5000)

--- SUITE 2: Catalog Discovery & Store Isolation ---
  ✅ PASS | [Suite 2: Catalog] Category Listing API (>= 8 categories) (Found 8 categories)
  ✅ PASS | [Suite 2: Catalog] Active Vendors Listing API (>= 3 vendors) (Found 4 vendors)
  ✅ PASS | [Suite 2: Catalog] Store Isolation: Products correctly partitioned by Vendor ID (Sunita: 13 items, Sukhwinder: 12 items)
  ✅ PASS | [Suite 2: Catalog] ObjectId Guard: Malformed IDs return 400/404 without crashing server (Vendor: HTTP 400, Product: HTTP 400)

--- SUITE 3: Cart Business Logic & Minimum Order Constraints ---
  ✅ PASS | [Suite 3: Cart] Customer Login (Rajesh Kumar: 9876543210) (Customer ID: 6aaa44d4bba7479a91ad175d)
  ✅ PASS | [Suite 3: Cart] Vendor Login (Sunita Home Restro: 9876543211) (Vendor ID: 6aaa44d4bba7479a91ad175e)
  ✅ PASS | [Suite 3: Cart] Single-Vendor Cart Enforcement: Server rejects cross-vendor cart (HTTP 400) (Code: MULTI_VENDOR_CART)
  ✅ PASS | [Suite 3: Cart] Minimum Order Constraint: Server enforces vendor minimum threshold (HTTP 400) (Response: MIN_ORDER_NOT_MET)

--- SUITE 4: Guest Browsing & Hard Security Auth Gate ---
  ✅ PASS | [Suite 4: Security] Guest Browsing: Categories & menus accessible without token (HTTP 200) (Cat: 200, Vendors: 200, Menu: 200)
  ✅ PASS | [Suite 4: Security] Hard Auth Gate: Unauthenticated order placement strictly blocked (HTTP 401) (HTTP 401)
  ✅ PASS | [Suite 4: Security] Token Verification: Spoofed/Invalid JWT tokens rejected (HTTP 401) (HTTP 401)
  ✅ PASS | [Suite 4: Security] Cross-User Isolation: Cannot access non-existent or foreign customer orders (HTTP 404)

--- SUITE 5: High-Concurrency ACID Multi-Customer Stock Protection ---
  ✅ PASS | [Suite 5: ACID Concurrency] Created Dedicated Stress-Test Product with limited stock (5 units) (Stock: 5)
  ✅ PASS | [Suite 5: ACID Concurrency] Atomic Anti-Overselling: 4 concurrent orders for 8 units against stock of 5 (Success: 2, Blocked: 2, Remaining Stock: 1)

--- SUITE 6: Full Real-Time Order Lifecycle & Dual-WebSocket Verification ---
  ✅ PASS | [Suite 6: Lifecycle] Customer Order Creation (HTTP 201)
  ✅ PASS | [Suite 6: Lifecycle] Vendor Real-Time Socket Event (order:new) received in < 1s
  ✅ PASS | [Suite 6: Lifecycle] Partner State Machine Transitions (ACCEPTED -> PREP -> READY -> OUT -> DELIVERED)
  ✅ PASS | [Suite 6: Lifecycle] Stock Rollback on Rejection: Stock atomically refunded ($inc: +qty)

--- SUITE 7: Vendor Operational Controls & Dashboard Metrics ---
  ✅ PASS | [Suite 7: Vendor Controls] Closed Store Order Rejection (HTTP 400 VENDOR_CLOSED) (Code: VENDOR_CLOSED)
  ✅ PASS | [Suite 7: Vendor Controls] Vendor Dashboard Real-Time Metrics Computation

--- SUITE 8: Mobile Crash Resilience & Static Safety Verification ---
  ✅ PASS | [Suite 8: Mobile Safety] Zero Bare alert() Calls (Hermes Crash Hazard Eliminated)
  ✅ PASS | [Suite 8: Mobile Safety] Global Error & Unhandled Rejection Interceptors in Mobile Roots
  ✅ PASS | [Suite 8: Mobile Safety] Deep Null Safety & Fallback Guards in Checkout, Razorpay & Tracking

======================================================================
🌾 FARMART MASTER TEST SUITE - FINAL VERIFICATION REPORT
======================================================================
TOTAL CHECKS  : 27
PASSED        : 27
FAILED        : 0
SUCCESS RATE  : 100.0%
======================================================================

🎉 ALL SUITES PASSED WITH 100% SUCCESS! EVERY COMPONENT IS PRODUCTION-READY.
```

---

## 🔑 Demo Accounts & Test Credentials

### 🛒 Customer Account (`userApp`)
* **URL:** [http://localhost:8081](http://localhost:8081)
* **Phone:** `9876543210`
* **Password:** `demo123`
* **Customer Name:** `Rajesh Kumar (Verified)`
* **Address:** `Flat 302, Green Avenue, Model Town, Ludhiana`
* ⚡ **1-Tap Demo Login:** Available on the login bottom sheet.

### 🏪 Partner Accounts (`partnerApp`)
* **URL:** [http://localhost:8082](http://localhost:8082)
* **Default Password for All:** `demo123`

| Store Name | Owner Name | Phone | Categories | Min Order |
| :--- | :--- | :--- | :--- | :--- |
| **Shimla Fresh Orchards** | Manpreet Singh | `9876543214` | Organic Apples & Sweet Cherries | ₹99 |
| **Sunita Home Restro & Sweets** | Sunita Sharma | `9876543211` | Home Thalis, Mathri, Dal Makhani | ₹99 |
| **Sukhwinder Organic Farms** | Sukhwinder Singh | `9876543212` | Fresh Veggies, Moong Dal | ₹79 |
| **Gurpreet Fresh Orchards** | Gurpreet Singh | `9876543213` | Fresh Fruits & Juices | ₹99 |

### 🛵 Rider Partner Accounts (`deliveryApp`)
* **URL:** [http://localhost:8083](http://localhost:8083)
* **Default Password for All:** `demo123`

| Rider Partner | Phone | Vehicle Type | Plate Number | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Gurmukh Singh** | `9876543220` | 🏍️ Hero Splendor | `PB-10-AB-1234` | Active & Verified |
| **Harpreet Singh** | `9876543221` | 🛵 Honda Activa | `PB-10-CD-5678` | Active & Verified |
| **Manjinder Singh** | `9876543222` | 🚲 E-Cycle Express | `PB-10-EF-9012` | Active & Verified |

---

## 💻 Quick Start & Running Locally

### Prerequisites
* Node.js v18+ (tested on Node.js v25)
* npm v9+

### 1. Install Dependencies
```bash
npm install
cd userApp && npm install
cd ../partnerApp && npm install
cd ../deliveryApp && npm install
cd ..
```

### 2. Start Central Backend Server (Port 5000)
```bash
npm run server
```
*Health Check:* [http://localhost:5000/api/health](http://localhost:5000/api/health)

### 3. Start Customer App Web Preview (Port 8081)
```bash
cd userApp
npx expo start --web --port 8081
```
*Customer App:* [http://localhost:8081](http://localhost:8081)

### 4. Start Partner App Web Preview (Port 8082)
```bash
cd partnerApp
npx expo start --web --port 8082
```
*Partner App:* [http://localhost:8082](http://localhost:8082)

### 5. Start Rider App Web Preview (Port 8083)
```bash
cd deliveryApp
npx expo start --web --port 8083
```
*Rider App:* [http://localhost:8083](http://localhost:8083)

### 6. Run Verification Test Suite
```bash
# Unit & Integration Acceptance Suite (27/27 Passing)
npm test

# Full Multi-Actor Delivery Cycle (User Checkout -> Partner Prep -> Rider Assign -> Store Pickup OTP -> Doorstep Delivery OTP)
node server/scripts/executeFullDeliveryCycle.js
```

---

© 2026 Farmart. All rights reserved. Empowering Farmers • Supporting Local Home Chefs • Autonomous Rider Deliveries.
