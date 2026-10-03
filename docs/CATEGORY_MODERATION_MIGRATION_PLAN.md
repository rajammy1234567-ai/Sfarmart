# Farmart Category Moderation & Taxonomy Migration Plan

## 1. Executive Summary & Migration Philosophy
To ensure high-quality catalog taxonomy and seamless customer discovery, category management has been transitioned to an **admin-moderated workflow**:
- **Partners cannot directly create global categories.** Instead, partners submit proposals via `POST /api/categories/request`.
- **Existing category IDs, product references, and vendor associations are strictly preserved.**
- **No automatic bulk-approval** of historical or partner-created categories will take place. Each record must undergo explicit administrative review.
- All database changes follow a phased, read-only audit prior to any write operations.

---

## 2. Schema Architecture & Indexes

### A. `CategoryRequest` Collection
Stores vendor category requests independently from active platform categories:
```javascript
{
  vendor: { type: ObjectId, ref: 'Vendor', required: true, index: true },
  proposedName: { type: String, required: true, trim: true, maxlength: 60 },
  nameNormalized: { type: String, required: true, trim: true, lowercase: true, index: true },
  proposedType: { type: String, enum: ['GROCERY', 'FOOD'], required: true },
  suggestedParentCategory: { type: ObjectId, ref: 'Category', default: null },
  proposedIcon: { type: String, trim: true, default: '🥦' },
  reason: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
  adminNotes: { type: String, trim: true, maxlength: 500 },
  reviewedBy: { type: ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  mappedCategory: { type: ObjectId, ref: 'Category' },
  createdCategory: { type: ObjectId, ref: 'Category' },
  createdAt: { type: Date },
  updatedAt: { type: Date }
}
```

### B. `Category` Collection
Governs live platform taxonomy:
- `slug`: String, unique, lowercase.
- `nameNormalized`: String, unique sparse index (prevents whitespace/case duplicate bypass).
- `subCategories`: Array of `{ name: String, slug: String }` for nested discovery.
- `sortOrder`: Number (governs presentation ordering on customer Home rail).
- `isActive`: Boolean (enables admin curation/toggling).

---

## 3. Four-Step Migration & Review Procedure

### Step 1: Read-Only Audit & Taxonomy Inventory
Before touching database records, execute a read-only inventory of all existing categories:
```bash
node server/scripts/auditCategories.js
```
The audit script outputs:
1. Total categories in MongoDB.
2. Canonical 8 vs partner-created categories.
3. Inactive/deactivated categories (must never be blindly reactivated).
4. Product count and vendor count linked to each category ID.
5. Detection of missing `nameNormalized` fields on legacy documents.

### Step 2: Schema Index Provisioning (Zero-Downtime)
Verify and create required unique indexes using background indexing:
- `slug_1`: `{ unique: true }`
- `nameNormalized_1`: `{ unique: true, sparse: true }`
- `type_1_sortOrder_1`: compound index for sorted catalog queries.

*Safety Rule*: If any legacy duplicate normalized names exist in the database, indexing will halt with a conflict report before applying the unique constraint.

### Step 3: Admin Review & Moderation Workflow
Using the **Farmart Central Admin Portal** (`http://localhost:5173/categories`):
1. **Review Pending Requests**:
   - Inspect proposed name, catalog type, suggested parent category, and vendor justification.
2. **Action Decisions**:
   - **Approve as Global Category**: For genuine platform-wide categories.
   - **Approve as Subcategory**: Nests the proposed category inside an existing parent's `subCategories` array.
   - **Map to Existing Category**: Maps the vendor request to an existing approved category without duplicating taxonomy.
   - **Reject**: Rejects with explicit feedback returned to the partner.

### Step 4: Referential Integrity & Product Re-Linking (Transactional)
For historical partner-created categories that are mapped or merged:
1. Any product referencing `oldCategoryId` is updated to `targetCategoryId`:
   ```javascript
   await Product.updateMany(
     { category: oldCategoryId },
     { $set: { category: targetCategoryId } },
     { session }
   );
   ```
2. Any vendor listing `oldCategoryId` in `categories` is updated:
   ```javascript
   await Vendor.updateMany(
     { categories: oldCategoryId },
     { $addToSet: { categories: targetCategoryId }, $pull: { categories: oldCategoryId } },
     { session }
   );
   ```
3. The historical `oldCategoryId` is archived (`isActive: false`) rather than hard-deleted to preserve referential history.

---

## 4. Concurrency & Collision Safeguards
- **Duplicate Normalized Names**: Even if two concurrent requests propose identical names with different casing or spacing (e.g. `"Organic Apples"` vs `"organic   apples"`), the `nameNormalized` field ensures one triggers MongoDB `E11000 duplicate key error`.
- **E11000 Catch & Map Handler**: When an admin approves a request that collides with a concurrent approval, the controller catches `saveErr.code === 11000` and automatically maps the request to the existing record instead of crashing.
- **Notification Guarantee**: Every approval, rejection, or mapping dispatches both a Socket.io event (`vendor:${vendorId}`) and an Expo push notification.

---

## 5. Verification Checklist

| Check | Target | Offline / Live | Status |
| :--- | :--- | :--- | :--- |
| Direct Partner Create Blocked | `POST /api/categories` returns 403 `MODERATED_FLOW_REQUIRED` | Offline Test | Verified |
| Partner Request Flow | `POST /api/categories/request` creates `PENDING` request | Offline Test | Verified |
| Duplicate Request Guard | `409 REQUEST_ALREADY_PENDING` on same normalized name | Offline Test | Verified |
| Customer API Isolation | `GET /api/categories` returns 0 pending/rejected requests | Offline Test | Verified |
| Subcategory Approval | Nests within parent category `subCategories` | Offline Test | Verified |
| Partner UI Moderation | Modal displays "Request New Category" with parent picker | Web/Bundle | Verified |
| Admin Portal UI | Full moderation dashboard with Approve/Sub/Map/Reject | Web/Bundle | Verified |
| Physical Device Verification | Real Android push / Socket.io on physical hardware | Device Check | Next Phase |
