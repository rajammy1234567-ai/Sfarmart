import mongoose from 'mongoose';
import Banner from '../models/Banner.js';

// Public: Get active banners for Customer App
export const getPublicBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, count: banners.length, banners });
  } catch (err) {
    console.error('Error fetching public banners:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch banners' });
  }
};

// Admin: Get all banners (active + inactive)
export const getAllBannersAdmin = async (req, res) => {
  try {
    const banners = await Banner.find()
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, count: banners.length, banners });
  } catch (err) {
    console.error('Error fetching admin banners:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch banners' });
  }
};

// Admin: Create new banner
export const createBannerAdmin = async (req, res) => {
  try {
    const { title, subtitle, imageUrl, linkType, linkTarget, sortOrder, isActive, placement } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Banner title is required' });
    }
    if (!imageUrl || !imageUrl.trim()) {
      return res.status(400).json({ success: false, message: 'Banner imageUrl is required' });
    }

    const banner = new Banner({
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : '',
      imageUrl: imageUrl.trim(),
      linkType: linkType || 'NONE',
      linkTarget: linkTarget ? linkTarget.trim() : '',
      sortOrder: typeof sortOrder === 'number' ? sortOrder : parseInt(sortOrder, 10) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      placement: placement || 'HOME_TOP'
    });

    await banner.save();
    res.status(201).json({ success: true, banner });
  } catch (err) {
    console.error('Error creating banner:', err);
    res.status(500).json({ success: false, message: 'Failed to create banner' });
  }
};

// Admin: Update banner
export const updateBannerAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid banner ID' });
    }

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    const allowed = ['title', 'subtitle', 'imageUrl', 'linkType', 'linkTarget', 'sortOrder', 'isActive', 'placement'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'sortOrder') {
          banner[key] = parseInt(req.body[key], 10) || 0;
        } else if (key === 'isActive') {
          banner[key] = Boolean(req.body[key]);
        } else if (typeof req.body[key] === 'string') {
          banner[key] = req.body[key].trim();
        } else {
          banner[key] = req.body[key];
        }
      }
    }

    await banner.save();
    res.json({ success: true, banner });
  } catch (err) {
    console.error('Error updating banner:', err);
    res.status(500).json({ success: false, message: 'Failed to update banner' });
  }
};

// Admin: Delete banner
export const deleteBannerAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid banner ID' });
    }

    const deleted = await Banner.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    res.json({ success: true, message: 'Banner deleted successfully' });
  } catch (err) {
    console.error('Error deleting banner:', err);
    res.status(500).json({ success: false, message: 'Failed to delete banner' });
  }
};
