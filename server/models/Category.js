import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    nameNormalized: {
      type: String,
      lowercase: true,
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
    // Admin-controlled visibility on Home page (separate from isActive)
    homeVisibility: {
      type: Boolean,
      default: false
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

categorySchema.pre('validate', function () {
  if (this.name) {
    this.nameNormalized = this.name.trim().replace(/\s+/g, ' ').toLowerCase();
  }
});

categorySchema.index({ type: 1, sortOrder: 1 });
categorySchema.index({ nameNormalized: 1 }, { unique: true, sparse: true });

export default mongoose.model('Category', categorySchema);
