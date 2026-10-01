import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    icon: {
      type: String,
      default: '🥦'
    },
    image: {
      type: String,
      default: ''
    },
    type: {
      type: String,
      enum: ['GROCERY', 'FOOD'],
      required: true
    },
    subCategories: [
      {
        name: String,
        slug: String
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

categorySchema.index({ type: 1, sortOrder: 1 });

export default mongoose.model('Category', categorySchema);
