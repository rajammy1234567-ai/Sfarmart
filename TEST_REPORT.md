# 🌾 Farmart — Production Acceptance Test Report

**Execution Timestamp:** 2026-09-16T13:25:39+05:30  
**Environment:** Production Build (Local Test Harness against MongoDB Atlas Cloud Cluster)  
**Backend Port:** `http://localhost:5000`  
**userApp (Customer):** `http://localhost:8081`  
**partnerApp (Vendor):** `http://localhost:8082`  

---

## 📊 Summary of Test Results

| Total Tests | Passed | Failed | Success Rate | Real-Time Latency |
| :---: | :---: | :---: | :---: | :---: |
| **15** | **15** | **0** | **100%** | **< 600 ms** |

---

## 📋 Detailed Test Case Breakdown

### 1. Catalog & Discovery
* **TC-01: Category Listing API returns exactly 8 seeded categories**
  * **Result:** `PASS`
  * **Verification:** API `/api/categories` returns 8 categories: *Fresh Fruits & Vegetables*, *Dairy, Bread & Eggs*, *Atta, Rice & Dal*, *Oil, Ghee & Masala*, *Ghar Ka Khana / Home Thali*, *Mithai & Bakery*, *Snacks & Munchies*, *Cold Drinks & Juices*.
* **TC-02: Vendor Listing API returns 3 active vendors**
  * **Result:** `PASS`
  * **Verification:** API `/api/vendors` returns 3 vendors: *Sunita Home Restro & Sweets*, *Sukhwinder Organic Farms*, *Gurpreet Fresh Orchards*.
* **TC-05: Vendor Catalog separation**
  * **Result:** `PASS`
  * **Verification:** Sunita's store returns 5 items (Home Thali, Sweets), Sukhwinder's store returns 7 items (Organic Farm produce). Products strictly isolated by `vendorId`.

---

### 2. Authentication & Authorization
* **TC-03: Customer 1-Tap Login**
  * **Result:** `PASS`
  * **Verification:** Login with `9876543210` / `demo123` returns JWT token, user payload (`Rajesh Kumar`), and role `customer`.
* **TC-04: Vendor Login**
  * **Result:** `PASS`
  * **Verification:** Login with `9876543211` / `demo123` returns JWT token, vendor profile (`Sunita Home Restro & Sweets`), and role `vendor`.

---

### 3. 🔴 Single-Vendor Cart Enforcement
* **TC-06: Server Rejection of Multi-Vendor Cart (HTTP 400)**
  * **Result:** `PASS`
  * **Payload Tested:** Items containing 1 item from Sunita + 1 item from Sukhwinder.
  * **Verification:** Endpoint `/api/orders` strictly rejected request with `HTTP 400` and error code `MULTI_VENDOR_CART`.
  * **Message:** *"Cart can only contain items from one store at a time. Please clear cart to order from a different store."*
* **TC-07: Minimum Order Value constraint enforcement**
  * **Result:** `PASS`
  * **Payload Tested:** Order total below vendor's `minOrderValue` (₹99).
  * **Verification:** Endpoint `/api/orders` rejected with `MIN_ORDER_NOT_MET`.

---

### 4. Ordering, Inventory & Atomic Stock Locking
* **TC-08: Valid Single-Vendor Order Creation (HTTP 201)**
  * **Result:** `PASS`
  * **Verification:** Generated order `#ORD-335940-320` with bill calculation: Subtotal ₹180, Delivery Fee ₹25, Platform Fee ₹5, Tax ₹4. Grand Total = ₹214.
* **TC-09: Atomic Stock Decrement ($inc: -qty)**
  * **Result:** `PASS`
  * **Verification:** MongoDB inventory atomic decrement with `{ stockQty: { $gte: qty } }`. Initial: 32 -> Ordered: 2 -> Remaining: 30.
* **TC-12: Stock Rollback on Order Rejection ($inc: +qty)**
  * **Result:** `PASS`
  * **Verification:** When vendor rejects an order or customer cancels, inventory is rolled back by `+$inc: qty`. Stock during order: 28 -> Stock after vendor rejection: 30.

---

### 5. 🔴 Real-Time Notification & WebSocket Subsystem
* **TC-10: Instant Socket Event (`order:new`) received by Vendor**
  * **Result:** `PASS`
  * **Room Joined:** `vendor:${sunitaId}`
  * **Event Received:** `order:new` received in **< 600 ms** containing full order payload `#ORD-335940-320`.
  * **Client Reaction:** Triggers full-screen `NewOrderModal` with Web Audio API chime loop and 60-second accept countdown ring.

---

### 6. Order State Machine & Store Controls
* **TC-11: Order State Machine Transitions**
  * **Result:** `PASS`
  * **Flow Tested:** `NEW_ORDER` ➔ `ACCEPTED` ➔ `PREPARING` ➔ `READY_FOR_RIDER` ➔ `DELIVERED`.
  * **Verification:** All valid status transitions succeed; socket emits `order:status` to customer room `customer:${userId}`.
* **TC-13: Vendor Closed Store Rejection**
  * **Result:** `PASS`
  * **Flow Tested:** Vendor toggles store `isOpen: false`. Customer attempts order.
  * **Verification:** Order creation rejected with `HTTP 400` and code `VENDOR_CLOSED`.
* **TC-14: Vendor Dashboard Stats Computation**
  * **Result:** `PASS`
  * **Verification:** Dashboard dynamically computes today's order count, delivered orders, active orders, and revenue directly via MongoDB aggregations.
* **TC-15: Vendor Catalog Management (Add & Delete Product)**
  * **Result:** `PASS`
  * **Flow Tested:** Vendor adds `Test Fresh Item` (HTTP 201) and deletes it (HTTP 200).
  * **Verification:** CRUD lifecycle verified with category relationship.

---

## 🚀 Conclusion
All 15 acceptance criteria have been verified and passed. The platform operates with strict single-vendor cart isolation, real-time bidirectional WebSocket synchronization, atomic inventory protection, and reactive UI interfaces across both customer and partner applications.
