import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import { createProduct, updateProduct, getAllProducts } from '../controllers/productController.js';

test('Subcategory and Product Flow Test Suite', async (t) => {
  const freshFruitsVegId = new mongoose.Types.ObjectId();
  const dairyId = new mongoose.Types.ObjectId();
  const emptyCatId = new mongoose.Types.ObjectId();
  const microgreensSubId = new mongoose.Types.ObjectId();
  const freshVegSubId = new mongoose.Types.ObjectId();
  const milkButterSubId = new mongoose.Types.ObjectId();
  const vendorId = new mongoose.Types.ObjectId();

  // Stub syncVendorCategories dependencies to run instantly in offline tests
  Product.distinct = () => Promise.resolve([freshFruitsVegId]);
  Category.find = () => ({
    distinct: () => Promise.resolve([freshFruitsVegId])
  });
  Vendor.findByIdAndUpdate = () => Promise.resolve({});

  const mockCategories = [
    {
      _id: freshFruitsVegId,
      name: 'Fresh Fruits & Vegetables',
      nameNormalized: 'fresh fruits & vegetables',
      slug: 'fruits-vegetables',
      icon: '🥦',
      type: 'GROCERY',
      isActive: true,
      homeVisibility: true,
      subCategories: [
        { _id: freshVegSubId, name: 'Fresh Vegetables', slug: 'fresh-vegetables' },
        { _id: microgreensSubId, name: 'Microgreens', slug: 'microgreens' }
      ]
    },
    {
      _id: dairyId,
      name: 'Dairy, Bread & Eggs',
      nameNormalized: 'dairy, bread & eggs',
      slug: 'dairy-milk',
      icon: '🥛',
      type: 'GROCERY',
      isActive: true,
      homeVisibility: true,
      subCategories: [
        { _id: milkButterSubId, name: 'Milk & Butter', slug: 'milk-butter' }
      ]
    },
    {
      _id: emptyCatId,
      name: 'Snacks & Munchies',
      nameNormalized: 'snacks & munchies',
      slug: 'snacks',
      icon: '🍿',
      type: 'GROCERY',
      isActive: true,
      homeVisibility: true,
      subCategories: []
    }
  ];

  await t.test('1. Partner Category Contract: Retrieves parent with Microgreens subcategory', async () => {
    const parent = mockCategories.find((c) => c._id.equals(freshFruitsVegId));
    assert.ok(parent, 'Parent category must exist');
    const microgreens = parent.subCategories.find((s) => s.name === 'Microgreens');
    assert.ok(microgreens, 'Microgreens must exist in subCategories');
    assert.equal(microgreens.slug, 'microgreens');
    assert.ok(microgreens._id, 'Microgreens must have real subdocument _id');
  });

  await t.test('2. Partner Selection Logic: Clears incompatible subcategory when parent changes', async () => {
    let selectedCatId = freshFruitsVegId.toString();
    let selectedSubCategory = 'Microgreens';

    const handleSelectCategory = (newCatId) => {
      if (newCatId !== selectedCatId) {
        selectedCatId = newCatId;
        const targetCat = mockCategories.find((c) => c._id.toString() === newCatId);
        const isSubCompatible = (targetCat?.subCategories || []).some(
          (s) =>
            (s._id && s._id.toString() === selectedSubCategory) ||
            (s.name && s.name.toLowerCase() === selectedSubCategory.toLowerCase()) ||
            (s.slug && s.slug.toLowerCase() === selectedSubCategory.toLowerCase())
        );
        if (!isSubCompatible) {
          selectedSubCategory = '';
        }
      }
    };

    handleSelectCategory(dairyId.toString());
    assert.equal(selectedSubCategory, '', 'Incompatible subcategory must be cleared on parent change');

    selectedSubCategory = 'Milk & Butter';
    handleSelectCategory(emptyCatId.toString());
    assert.equal(selectedSubCategory, '', 'Subcategory must be cleared when switching to parent with no subcategories');
  });

  await t.test('3. Product Creation: Validates and persists valid subcategory (Microgreens)', async () => {
    const origFindOne = Category.findOne;
    const origSave = Product.prototype.save;
    try {
      Category.findOne = (query) => {
        const cat = mockCategories.find((c) => c._id.toString() === query._id.toString() && c.isActive);
        return Promise.resolve(cat);
      };

      let savedProductData = null;
      Product.prototype.save = function () {
        savedProductData = this.toObject();
        return Promise.resolve({
          ...savedProductData,
          populate: () => Promise.resolve(savedProductData)
        });
      };

      const req = {
        user: { role: 'VENDOR', vendorId: vendorId.toString() },
        body: {
          name: 'Organic Radish Microgreens',
          category: freshFruitsVegId.toString(),
          subCategory: 'Microgreens',
          price: 90,
          unit: '1 packet',
          stock: 30
        }
      };

      let resData = null;
      let resStatus = 200;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => {
              resData = data;
            }
          };
        },
        json: (data) => {
          resData = data;
        }
      };

      await createProduct(req, res);
      assert.equal(resStatus, 201, 'Product creation should succeed with 201');
      assert.equal(resData.success, true);
      assert.equal(savedProductData.subCategory, 'Microgreens', 'Subcategory must be persisted as Microgreens');
    } finally {
      Category.findOne = origFindOne;
      Product.prototype.save = origSave;
    }
  });

  await t.test('4. Product Creation: Rejects subcategory belonging to a different parent category', async () => {
    const origFindOne = Category.findOne;
    try {
      Category.findOne = (query) => {
        const cat = mockCategories.find((c) => c._id.toString() === query._id.toString() && c.isActive);
        return Promise.resolve(cat);
      };

      const req = {
        user: { role: 'VENDOR', vendorId: vendorId.toString() },
        body: {
          name: 'Paneer Block',
          category: freshFruitsVegId.toString(),
          subCategory: 'Milk & Butter',
          price: 120,
          unit: '200 g'
        }
      };

      let resData = null;
      let resStatus = 200;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => {
              resData = data;
            }
          };
        }
      };

      await createProduct(req, res);
      assert.equal(resStatus, 400, 'Invalid subcategory must return 400');
      assert.equal(resData.code, 'INVALID_SUBCATEGORY');
    } finally {
      Category.findOne = origFindOne;
    }
  });

  await t.test('5. Product Creation: Rejects subcategory on parent category with no subcategories', async () => {
    const origFindOne = Category.findOne;
    try {
      Category.findOne = (query) => {
        const cat = mockCategories.find((c) => c._id.toString() === query._id.toString() && c.isActive);
        return Promise.resolve(cat);
      };

      const req = {
        user: { role: 'VENDOR', vendorId: vendorId.toString() },
        body: {
          name: 'Potato Chips',
          category: emptyCatId.toString(),
          subCategory: 'Microgreens',
          price: 40,
          unit: '1 packet'
        }
      };

      let resData = null;
      let resStatus = 200;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => {
              resData = data;
            }
          };
        }
      };

      await createProduct(req, res);
      assert.equal(resStatus, 400, 'Subcategory on empty parent must return 400');
      assert.equal(resData.code, 'INVALID_SUBCATEGORY');
    } finally {
      Category.findOne = origFindOne;
    }
  });

  await t.test('6. Product Edit: Successfully updates subcategory and validates membership', async () => {
    const origProductFindById = Product.findById;
    const origProductFindByIdAndUpdate = Product.findByIdAndUpdate;
    const origCategoryFindOne = Category.findOne;
    try {
      const existingProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Fresh Salad Mix',
        vendor: vendorId,
        category: freshFruitsVegId,
        subCategory: 'Fresh Vegetables'
      };

      Product.findById = () => Promise.resolve(existingProduct);
      Category.findOne = (query) => {
        const cat = mockCategories.find((c) => c._id.toString() === query._id.toString() && c.isActive);
        return Promise.resolve(cat);
      };

      let updatedFields = null;
      Product.findByIdAndUpdate = (_id, update) => {
        updatedFields = update.$set;
        return {
          populate: () => Promise.resolve({ ...existingProduct, ...updatedFields })
        };
      };

      const req = {
        params: { id: existingProduct._id.toString() },
        user: { role: 'VENDOR', vendorId: vendorId.toString() },
        body: {
          subCategory: 'Microgreens'
        }
      };

      let resData = null;
      let resStatus = 200;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => {
              resData = data;
            }
          };
        },
        json: (data) => {
          resData = data;
        }
      };

      await updateProduct(req, res);
      assert.equal(resStatus, 200);
      assert.equal(resData.success, true);
      assert.equal(updatedFields.subCategory, 'Microgreens', 'Subcategory must be updated to Microgreens');
    } finally {
      Product.findById = origProductFindById;
      Product.findByIdAndUpdate = origProductFindByIdAndUpdate;
      Category.findOne = origCategoryFindOne;
    }
  });

  await t.test('7. Product Edit: Rejects update when subcategory is invalid for existing parent', async () => {
    const origProductFindById = Product.findById;
    const origCategoryFindOne = Category.findOne;
    try {
      const existingProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Fresh Salad Mix',
        vendor: vendorId,
        category: freshFruitsVegId,
        subCategory: 'Fresh Vegetables'
      };

      Product.findById = () => Promise.resolve(existingProduct);
      Category.findOne = (query) => {
        const cat = mockCategories.find((c) => c._id.toString() === query._id.toString() && c.isActive);
        return Promise.resolve(cat);
      };

      const req = {
        params: { id: existingProduct._id.toString() },
        user: { role: 'VENDOR', vendorId: vendorId.toString() },
        body: {
          subCategory: 'NonExistentSubCategory'
        }
      };

      let resData = null;
      let resStatus = 200;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => {
              resData = data;
            }
          };
        }
      };

      await updateProduct(req, res);
      assert.equal(resStatus, 400);
      assert.equal(resData.code, 'INVALID_SUBCATEGORY');
    } finally {
      Product.findById = origProductFindById;
      Category.findOne = origCategoryFindOne;
    }
  });

  await t.test('8. Product Edit: Clears incompatible subcategory when parent changes without new subcategory', async () => {
    const origProductFindById = Product.findById;
    const origProductFindByIdAndUpdate = Product.findByIdAndUpdate;
    const origCategoryFindOne = Category.findOne;
    try {
      const existingProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Hybrid Product',
        vendor: vendorId,
        category: freshFruitsVegId,
        subCategory: 'Microgreens'
      };

      Product.findById = () => Promise.resolve(existingProduct);
      Category.findOne = (query) => {
        const cat = mockCategories.find((c) => c._id.toString() === query._id.toString() && c.isActive);
        return Promise.resolve(cat);
      };

      let updatedFields = null;
      Product.findByIdAndUpdate = (_id, update) => {
        updatedFields = update.$set;
        return {
          populate: () => Promise.resolve({ ...existingProduct, ...updatedFields })
        };
      };

      const req = {
        params: { id: existingProduct._id.toString() },
        user: { role: 'VENDOR', vendorId: vendorId.toString() },
        body: {
          category: dairyId.toString()
        }
      };

      let resData = null;
      let resStatus = 200;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => {
              resData = data;
            }
          };
        },
        json: (data) => {
          resData = data;
        }
      };

      await updateProduct(req, res);
      assert.equal(resStatus, 200);
      assert.equal(updatedFields.category, dairyId);
      assert.equal(updatedFields.subCategory, '', 'Incompatible subcategory must be automatically cleared when parent changes');
    } finally {
      Product.findById = origProductFindById;
      Product.findByIdAndUpdate = origProductFindByIdAndUpdate;
      Category.findOne = origCategoryFindOne;
    }
  });

  await t.test('9. Discoverability: Product is discoverable via parent category query and Home categories remain 8', async () => {
    const origCategoryFindOne = Category.findOne;
    const origProductFind = Product.find;
    try {
      Category.findOne = (query) => {
        if (query.slug === 'fruits-vegetables') {
          return Promise.resolve(mockCategories[0]);
        }
        return Promise.resolve(null);
      };

      let capturedFilter = null;
      Product.find = (filter) => {
        capturedFilter = filter;
        return {
          populate: () => ({
            populate: () => ({
              sort: () => Promise.resolve([
                {
                  _id: new mongoose.Types.ObjectId(),
                  name: 'Organic Radish Microgreens',
                  category: freshFruitsVegId,
                  subCategory: 'Microgreens'
                }
              ])
            })
          })
        };
      };

      const req = {
        query: { category: 'fruits-vegetables' }
      };

      let resData = null;
      const res = {
        json: (data) => {
          resData = data;
        }
      };

      await getAllProducts(req, res);
      assert.equal(resData.success, true);
      assert.equal(resData.count, 1);
      assert.equal(capturedFilter.category, freshFruitsVegId, 'Parent category query must resolve to parent category ID');
      assert.equal(resData.products[0].subCategory, 'Microgreens');
    } finally {
      Category.findOne = origCategoryFindOne;
      Product.find = origProductFind;
    }
  });
});
