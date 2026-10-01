# 🔍 PHASE 0 AUDIT: Farmart Architecture & Codebase Assessment

Date: September 16, 2026  
Status: Complete  
Target: Production-Grade Swiggy/Zomato/Blinkit-style Hyperlocal Platform

---

## 1. Executive Summary

This audit evaluates the existing `server/`, `userApp/`, and `partnerApp/` codebases to establish the baseline before executing the 7-phase production build. 

### ✅ Verified Working Baseline:
* MongoDB Atlas cluster is live and operational (`ac-odvlysp-shard-00-02.5rixopr.mongodb.net`).
* Health Check Endpoint responds: `GET /api/health` ➔ `200 OK` (`status: "OK"`).
* Basic Express server is mounted on port `5000`.
* Expo Web bundles are active for `userApp` (port `8081`) and `partnerApp` (port `8082`).

---

## 2. Current Architecture & Gaps Analysis

### 2.1 Data Models (`server/models/`)
| Model | Current State | Production Gaps |
| :--- | :--- | :--- |
| **Category** | ❌ **Does not exist** | Needs `name`, `slug`, `icon`, `image`, `type` (`GROCERY`/`FOOD`), `subCategories`, `sortOrder`, `isActive`. |
| **Vendor** | ❌ **Does not exist** | Needs `storeName`, `ownerName`, `phone`, `passwordHash`, `storeType`, `categories`, `isOpen`, `address`, `location` (GeoJSON 2dsphere), `rating`, `expoPushTokens`, `bank`. |
| **Product** | ⚠️ Flat fields, string category | Needs `vendor` ObjectId ref (remove string `partnerId`), `category` ObjectId ref, `mrp`, `stockQty`, `isVeg`, text search index on name and tags. |
| **Order** | ⚠️ Basic flat schema | Missing `orderNumber` ("FM-2609-0042"), `clientOrderId` (idempotency), `vendor` ObjectId ref (single vendor enforcement), `statusHistory` timeline, `rejectionReason`, atomic stock decrement. |
| **User** | ⚠️ Minimal fields, memory fallback | Missing `addresses[]`, `defaultAddressIndex`, `walletBalance`, `expoPushTokens[]`, `role: "CUSTOMER"`. |

---

### 2.2 Hardcoding & "default_vendor" References
1. **`server/controllers/orderController.js`**:
   * Lines 20, 35: hardcodes or defaults `vendorId: 'default_vendor'`.
2. **`server/models/Order.js`**:
   * Line 63: `default: 'default_vendor'`.
3. **`partnerApp/src/context/PartnerContext.js`**:
   * Queries `${API_BASE_URL}/orders/vendor/default_vendor`.
   * Inserts items with `partnerId: 'default_vendor'`.
4. **`userApp/src/context/AppContext.js`**:
   * Line 93: `vendorId: "default_vendor"`.
5. **`userApp/src/data/mockData.js` & `partnerApp/src/data/mockPartnerData.js`**:
   * Static mock arrays for products, chefs, and orders.

---

### 2.3 Cart & Multi-Vendor Enforcement Gap
* 🔴 **Critical Missing Rule:** In `userApp`, `addToCart()` simply pushes any product to the array without checking if the new product belongs to the same vendor as existing cart items.
* Server-side `POST /api/orders` does not validate if items come from multiple vendors; it currently accepts any payload.
* **Production Requirement:** Single-vendor cart must be strictly enforced on the client (with `ClearCartModal`) and rejected on the server with HTTP 400 `MULTI_VENDOR_CART`.

---

### 2.4 Real-Time Notifications & Sockets Gap
* Currently, `socket.io` is **not installed** in `server` or the client apps.
* `partnerApp` relies on a 10-second polling loop (`setInterval`).
* Order placement does not trigger instant (< 2s) push, sound loop, or full-screen modal alert.
* Customer has no live WebSocket stepper updates when an order transitions to `ACCEPTED` or `OUT_FOR_DELIVERY`.

---

### 2.5 API & Security Gaps
* Standard response format is inconsistent (some routes return `{ success, user }`, others return `{ success, message }`, errors lack error codes like `MULTI_VENDOR_CART` or `OUT_OF_STOCK`).
* JWT token authentication middleware is not enforced across vendor endpoints; vendor A could theoretically mutate vendor B's orders.
* No atomic stock locking (`$inc: -qty` with `$gte` check).
* Server-side recalculation of pricing is missing; client-sent total is trusted.

---

## 3. Assumptions & Decisions
1. **Multi-Vendor Policy:** Strictly 1 vendor per cart. If a customer wants items from both "Sunita Home Restro" and "Gurpreet Orchards", they must place two separate orders.
2. **Delivery App Scope:** As per spec, `deliveryApp/` UI is strictly untouched. The backend order schema will store `riderId` and status `READY_FOR_RIDER`.
3. **Root Vite Landing Page:** Left completely intact.
4. **Demo Accounts:** Pre-seeded demo credentials for instant 1-tap testing:
   * Customer: `9876543210` / `demo123`
   * Vendor (Sunita Home Restro): `9876543211` / `demo123`
   * Vendor (Sukhwinder Farms): `9876543212` / `demo123`
   * Vendor (Gurpreet Orchards): `9876543213` / `demo123`

---

## 4. Phase Implementation Roadmap
* **Phase 1:** Data Models (`Category.js`, `Vendor.js`, update `Product.js`, `Order.js`, `User.js`, migration script).
* **Phase 2:** Backend API (Auth, Catalog, Vendor Panel, Orders, Stock Concurrency, State Machine).
* **Phase 3:** Real-Time Notification System (Socket.IO, `notify.js`, Expo push, Partner sound & global modal, Customer live stepper).
* **Phase 4:** `userApp` (Category-first layout, vendor rails, `VendorStoreScreen`, Single-Vendor Cart guard & `ClearCartModal`, live tracking).
* **Phase 5:** `partnerApp` (Store status toggle, global `NewOrderModal`, category-wise `ProductsScreen`, Add/Edit product).
* **Phase 6:** Production Hardening (Security, rate-limits, central error handler, seed script with 3 vendors & 8 categories).
* **Phase 7:** Acceptance Testing & `TEST_REPORT.md` (Running all 22 checklist items).
