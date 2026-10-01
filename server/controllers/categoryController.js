import Category from '../models/Category.js';
import Vendor from '../models/Vendor.js';

export const getAllCategories = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { isActive: true };
    if (type && ['GROCERY', 'FOOD'].includes(type.toUpperCase())) {
      filter.type = type.toUpperCase();
    }

    const categories = await Category.find(filter).sort({ sortOrder: 1, createdAt: 1 });
    res.json({
      success: true,
      count: categories.length,
      categories
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

export const getCategoryBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const category = await Category.findOne({ slug, isActive: true });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, category });
  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch category' });
  }
};

export const getVendorsByCategory = async (req, res) => {
  try {
    const { slug } = req.params;
    const category = await Category.findOne({ slug });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const vendors = await Vendor.find({
      categories: category._id,
      isActive: true
    })
      .populate('categories', 'name slug icon type')
      .sort({ isOpen: -1, rating: -1 });

    res.json({
      success: true,
      category,
      count: vendors.length,
      vendors
    });
  } catch (err) {
    console.error('Error fetching category vendors:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors for category' });
  }
};
