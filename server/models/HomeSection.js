import mongoose from 'mongoose';

const homeSectionSchema = new mongoose.Schema(
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
    sectionType: {
      type: String,
      enum: ['CATEGORY_PRODUCTS', 'FEATURED_PRODUCTS'],
      default: 'CATEGORY_PRODUCTS'
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      }
    ],
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    maxProducts: {
      type: Number,
      default: 8
    }
  },
  { timestamps: true }
);

homeSectionSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model('HomeSection', homeSectionSchema);
