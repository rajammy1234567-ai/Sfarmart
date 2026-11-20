import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    subtitle: {
      type: String,
      default: '',
      trim: true
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true
    },
    linkType: {
      type: String,
      enum: ['CATEGORY', 'PRODUCT', 'VENDOR', 'NONE'],
      default: 'NONE'
    },
    linkTarget: {
      type: String,
      default: '',
      trim: true
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    placement: {
      type: String,
      enum: ['HOME_TOP', 'HOME_MIDDLE'],
      default: 'HOME_TOP'
    }
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model('Banner', bannerSchema);
