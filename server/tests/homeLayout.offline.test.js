import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Banner from '../models/Banner.js';
import HomeSection from '../models/HomeSection.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import {
  getPublicBanners,
  getAllBannersAdmin,
  createBannerAdmin,
  updateBannerAdmin,
  deleteBannerAdmin
} from '../controllers/bannerController.js';
import {
  getPublicHomeSections,
  getAllHomeSectionsAdmin,
  createHomeSectionAdmin,
  updateHomeSectionAdmin,
  deleteHomeSectionAdmin
} from '../controllers/homeSectionController.js';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
};

test('Home Layout & Dynamic Sections Offline Suite', async (t) => {
  await t.test('1. Banners: getPublicBanners queries only active banners sorted by sortOrder', async () => {
    const origFind = Banner.find;
    try {
      let capturedFilter = null;
      let capturedSort = null;
      Banner.find = (filter) => {
        capturedFilter = filter;
        return {
          sort: (sortObj) => {
            capturedSort = sortObj;
            return {
              lean: async () => [
                { _id: new mongoose.Types.ObjectId(), title: 'Farm Fresh', imageUrl: 'https://example.com/banner.jpg', sortOrder: 1, isActive: true }
              ]
            };
          }
        };
      };

      const req = {};
      const res = createMockRes();
      await getPublicBanners(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(capturedFilter, { isActive: true });
      assert.deepEqual(capturedSort, { sortOrder: 1, createdAt: 1 });
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 1);
      assert.equal(res.body.banners[0].title, 'Farm Fresh');
    } finally {
      Banner.find = origFind;
    }
  });

  await t.test('2. Banners: createBannerAdmin validates required fields', async () => {
    // Missing title
    let req = { body: { imageUrl: 'https://example.com/banner.jpg' } };
    let res = createMockRes();
    await createBannerAdmin(req, res);
    assert.equal(res.statusCode, 400);

    // Missing imageUrl
    req = { body: { title: 'Fresh Ghee' } };
    res = createMockRes();
    await createBannerAdmin(req, res);
    assert.equal(res.statusCode, 400);
  });

  await t.test('3. Home Sections: getPublicHomeSections filters out sections with 0 products', async () => {
    const origSectionFind = HomeSection.find;
    const origProdFind = Product.find;
    try {
      const catId = new mongoose.Types.ObjectId();
      HomeSection.find = () => ({
        sort: () => ({
          populate: () => ({
            populate: () => ({
              lean: async () => [
                {
                  _id: new mongoose.Types.ObjectId(),
                  title: 'Dairy Essentials',
                  sectionType: 'CATEGORY_PRODUCTS',
                  category: { _id: catId, name: 'Dairy & Milk' },
                  maxProducts: 8,
                  sortOrder: 1,
                  isActive: true
                },
                {
                  _id: new mongoose.Types.ObjectId(),
                  title: 'Empty Category Section',
                  sectionType: 'CATEGORY_PRODUCTS',
                  category: { _id: new mongoose.Types.ObjectId(), name: 'Rare Produce' },
                  maxProducts: 8,
                  sortOrder: 2,
                  isActive: true
                }
              ]
            })
          })
        })
      });

      Product.find = (filter) => ({
        sort: () => ({
          limit: () => ({
            populate: () => ({
              populate: () => ({
                lean: async () => {
                  if (String(filter.category) === String(catId)) {
                    return [
                      {
                        _id: new mongoose.Types.ObjectId(),
                        name: 'Verka Cow Milk 500ml',
                        price: 33,
                        isActive: true,
                        vendor: { storeName: 'Verka Booth', isActive: true, isApproved: true }
                      }
                    ];
                  }
                  return [];
                }
              })
            })
          })
        })
      });

      const req = {};
      const res = createMockRes();
      await getPublicHomeSections(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      // Empty category section MUST be excluded
      assert.equal(res.body.count, 1, 'Sections with 0 products must be hidden');
      assert.equal(res.body.sections[0].title, 'Dairy Essentials');
      assert.equal(res.body.sections[0].products.length, 1);
    } finally {
      HomeSection.find = origSectionFind;
      Product.find = origProdFind;
    }
  });

  await t.test('4. Home Sections: createHomeSectionAdmin validates title', async () => {
    const req = { body: {} };
    const res = createMockRes();
    await createHomeSectionAdmin(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Section title is required');
  });
});
