export const driverProfile = {
  name: 'Vikram Singh',
  driverId: 'FMT-DVR-7042',
  vehicle: 'TVS Electric Scooter (PB-10-AZ-4921)',
  rating: 4.95,
  completedDeliveries: 412,
  todayEarnings: 840,
  todayTrips: 9,
  isOnline: true
};

export const activeTaskQueue = [
  {
    id: 'FMT-ORD-9821',
    customerName: 'Harpreet Singh',
    customerPhone: '+91 98765 43210',
    pickupLocation: 'Village Hub - Tarn Taran Central',
    pickupAddress: 'G.T. Road, Near Grain Market',
    deliveryAddress: 'House 42, Model Town, Sector 4',
    distanceKm: 3.4,
    estEarnings: 65,
    itemsCount: 3,
    items: [
      '2x Farm Fresh Organic Tomatoes',
      '1x Pure Desi Cow Ghee (A2 Bilona)'
    ],
    status: 'ASSIGNED', // ASSIGNED, ARRIVED_AT_VENDOR, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED
    otpRequired: '4920',
    paymentMethod: 'RAZORPAY',
    totalToCollect: 0 // prepaid
  },
  {
    id: 'FMT-ORD-9825',
    customerName: 'Ramanjit Kaur',
    customerPhone: '+91 98111 22334',
    pickupLocation: 'Chef Sunita Sharma Kitchen',
    pickupAddress: 'Street 9, Urban Estate Phase 2',
    deliveryAddress: 'Flat 304, Green Palms Apartments',
    distanceKm: 4.8,
    estEarnings: 85,
    itemsCount: 2,
    items: [
      '2x Punjabi Rajma Chawal Thali'
    ],
    status: 'READY_FOR_PICKUP',
    otpRequired: '1892',
    paymentMethod: 'COD',
    totalToCollect: 380
  }
];

export const weeklyEarningsHistory = [
  { date: 'Today (Wed)', trips: 9, baseEarn: 620, incentives: 220, total: 840, status: 'PROCESSING' },
  { date: 'Tue, Aug 5', trips: 14, baseEarn: 980, incentives: 350, total: 1330, status: 'PAID' },
  { date: 'Mon, Aug 4', trips: 12, baseEarn: 840, incentives: 280, total: 1120, status: 'PAID' },
  { date: 'Sun, Aug 3', trips: 16, baseEarn: 1120, incentives: 450, total: 1570, status: 'PAID' }
];
