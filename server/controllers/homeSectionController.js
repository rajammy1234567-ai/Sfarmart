import mongoose from 'mongoose';
import HomeSection from '../models/HomeSection.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';

// Public: Get active populated home sections for Customer App
export const getPublicHomeSections = async (req, res) => {
  try {
    const rawSections = await HomeSection.find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .populate('category', 'name slug icon image type')
      .populate({
        path: 'productIds',
        match: { isActive: true },
        populate: { path: 'vendor', select: 'storeName isOpen storeType isActive isApproved' }
      })
      .lean();

    const sectionsWithContent = [];

    for (const sec of rawSections) {
      let prods = [];
      if (sec.sectionType === 'CATEGORY_PRODUCTS' && sec.category) {
        const catId = sec.category._id || sec.category;
        const limit = sec.maxProducts || 8;
        prods = await Product.find({
          category: catId,
          isActive: true
        })
          .sort({ inStock: -1, price: 1 })
          .limit(limit)
          .populate('vendor', 'storeName isOpen storeType isActive isApproved avgPrepTimeMins minOrderValue rating numReviews')
          .populate('category', 'name slug icon image type')
          .lean();

        // Filter out products from inactive or unapproved vendors
        prods = prods.filter((p) => {
          if (!p.vendor) return false;
          if (p.vendor.isActive === false || p.vendor.isApproved === false) return false;
          return true;
        });
      } else if (sec.sectionType === 'FEATURED_PRODUCTS' && Array.isArray(sec.productIds)) {
        prods = sec.productIds.filter((p) => {
          if (!p || p.isActive === false) return false;
          if (p.vendor && (p.vendor.isActive === false || p.vendor.isApproved === false)) return false;
          return true;
        });
      }

      // "If a section has no configured content, hide it."
      if (prods.length > 0) {
        sectionsWithContent.push({
          ...sec,
          products: prods
        });
      }
    }

    res.json({
      success: true,
      count: sectionsWithContent.length,
      sections: sectionsWithContent
    });
  } catch (err) {
    console.error('Error fetching public home sections:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch home sections' });
  }
};

// Admin: Get all home sections (active + inactive)
export const getAllHomeSectionsAdmin = async (req, res) => {
  try {
    const sections = await HomeSection.find()
      .sort({ sortOrder: 1, createdAt: 1 })
      .populate('category', 'name slug icon image type')
      .lean();
    res.json({ success: true, count: sections.length, sections });
  } catch (err) {
    console.error('Error fetching admin home sections:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch home sections' });
  }
};

// Admin: Create new home section
export const createHomeSectionAdmin = async (req, res) => {
  try {
    const { title, subtitle, sectionType, category, productIds, sortOrder, isActive, maxProducts } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Section title is required' });
    }

    const section = new HomeSection({
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : '',
      sectionType: sectionType || 'CATEGORY_PRODUCTS',
      category: category && mongoose.isValidObjectId(category) ? category : null,
      productIds: Array.isArray(productIds) ? productIds.filter(id => mongoose.isValidObjectId(id)) : [],
      sortOrder: typeof sortOrder === 'number' ? sortOrder : parseInt(sortOrder, 10) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      maxProducts: typeof maxProducts === 'number' ? maxProducts : parseInt(maxProducts, 10) || 8
    });

    await section.save();
    const populated = await HomeSection.findById(section._id).populate('category', 'name slug icon image type').lean();
    res.status(201).json({ success: true, section: populated });
  } catch (err) {
    console.error('Error creating home section:', err);
    res.status(500).json({ success: false, message: 'Failed to create home section' });
  }
};

// Admin: Update home section
export const updateHomeSectionAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid section ID' });
    }

    const section = await HomeSection.findById(id);
    if (!section) {
      return res.status(404).json({ success: false, message: 'Home section not found' });
    }

    const allowed = ['title', 'subtitle', 'sectionType', 'category', 'productIds', 'sortOrder', 'isActive', 'maxProducts'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'sortOrder' || key === 'maxProducts') {
          section[key] = parseInt(req.body[key], 10) || 0;
        } else if (key === 'isActive') {
          section[key] = Boolean(req.body[key]);
        } else if (key === 'category') {
          section[key] = req.body[key] && mongoose.isValidObjectId(req.body[key]) ? req.body[key] : null;
        } else if (key === 'productIds') {
          section[key] = Array.isArray(req.body[key]) ? req.body[key].filter(i => mongoose.isValidObjectId(i)) : [];
        } else if (typeof req.body[key] === 'string') {
          section[key] = req.body[key].trim();
        } else {
          section[key] = req.body[key];
        }
      }
    }

    await section.save();
    const populated = await HomeSection.findById(section._id).populate('category', 'name slug icon image type').lean();
    res.json({ success: true, section: populated });
  } catch (err) {
    console.error('Error updating home section:', err);
    res.status(500).json({ success: false, message: 'Failed to update home section' });
  }
};

// Admin: Delete home section
export const deleteHomeSectionAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid section ID' });
    }

    const deleted = await HomeSection.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Home section not found' });
    }

    res.json({ success: true, message: 'Home section deleted successfully' });
  } catch (err) {
    console.error('Error deleting home section:', err);
    res.status(500).json({ success: false, message: 'Failed to delete home section' });
  }
};
