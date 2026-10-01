import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: {
    type: String,
    default: ''
  },
  unit: {
    type: String,
    default: '1 pc'
  },
  priceAtAdd: {
    type: Number, // Integer paise
    required: true,
    min: 0
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
    max: 20,
    default: 1
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null
    },
    items: [cartItemSchema],
    schemaVersion: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

// Virtual for item count
cartSchema.virtual('itemCount').get(function () {
  return (this.items || []).reduce((sum, item) => sum + item.qty, 0);
});

// Virtual for subtotal in paise
cartSchema.virtual('subtotalPaise').get(function () {
  return (this.items || []).reduce((sum, item) => sum + (item.priceAtAdd * item.qty), 0);
});

cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
