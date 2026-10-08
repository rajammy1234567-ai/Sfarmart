import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    image: {
      type: String,
      default: ''
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true
    },
    subCategory: {
      type: String,
      default: ''
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    mrp: {
      type: Number,
      default: 0
    },
    unit: {
      type: String,
      required: true,
      trim: true
    },
    stockQty: {
      type: Number,
      default: 20,
      min: 0
    },
    inStock: {
      type: Boolean,
      default: true
    },
    isVeg: {
      type: Boolean,
      default: true
    },
    tags: [
      {
        type: String
      }
    ],
    isActive: {
      type: Boolean,
      default: true
    },
    isStagingFixture: {
      type: Boolean,
      default: false
    },
    fixtureRunId: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

productSchema.index({ vendor: 1, category: 1 });
productSchema.index({ vendor: 1, isActive: 1, inStock: -1, price: 1, _id: 1 });
productSchema.index({ isActive: 1, inStock: -1, createdAt: -1, _id: 1 });
productSchema.index({ name: 'text', tags: 'text' });
productSchema.index({ isActive: 1, inStock: 1 });

export default mongoose.model('Product', productSchema);
