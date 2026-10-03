import mongoose from 'mongoose';

const categoryRequestSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true
    },
    proposedName: {
      type: String,
      required: true,
      trim: true
    },
    nameNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    proposedType: {
      type: String,
      enum: ['GROCERY', 'FOOD'],
      required: true
    },
    suggestedParentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    proposedIcon: {
      type: String,
      default: '📦'
    },
    reason: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true
    },
    adminNotes: {
      type: String,
      default: ''
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    mappedCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    createdCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    }
  },
  { timestamps: true }
);

categoryRequestSchema.pre('validate', function () {
  if (this.proposedName) {
    this.nameNormalized = this.proposedName.trim().replace(/\s+/g, ' ').toLowerCase();
  }
});

// Partial unique index: only PENDING requests enforce uniqueness per vendor and normalized name.
// Historical REJECTED or APPROVED requests drop out of this index, allowing future proposals.
categoryRequestSchema.index(
  { vendor: 1, nameNormalized: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);
categoryRequestSchema.index({ status: 1, createdAt: -1 });
categoryRequestSchema.index({ vendor: 1, status: 1 });

export default mongoose.model('CategoryRequest', categoryRequestSchema);
