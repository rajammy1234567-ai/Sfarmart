export const activeDeliveryStates = ['RIDER_ASSIGNED', 'RIDER_ARRIVED_STORE', 'OUT_FOR_DELIVERY'];
export const idOf = value => String(value?._id || value?.id || value || '');
export function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
export function distanceKm(a, b) {
  if (!validCoordinates(a?.lat, a?.lng) || !validCoordinates(b?.lat, b?.lng)) return Infinity;
  const rad = n => n * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function storePoint(vendor) {
  const coordinates = vendor?.address?.location?.coordinates || vendor?.location?.coordinates;
  return { lat: coordinates?.[1], lng: coordinates?.[0] };
}
export function canAccessOrder(user, order) {
  const id = idOf(user?.sub || user?.id || user?._id || user?.vendorId);
  if (!id) return false;
  return user.role === 'ADMIN' ||
    (user.role === 'CUSTOMER' && idOf(order.customer) === id) ||
    (user.role === 'VENDOR' && idOf(order.vendor) === idOf(user.vendorId || id)) ||
    (user.role === 'RIDER' && idOf(order.rider) === id);
}
// OTPs are shared only with the party responsible for handing over the parcel.
export function orderForRole(doc, role) {
  const order = doc?.toObject ? doc.toObject() : { ...doc };
  if (role !== 'ADMIN' && role !== 'VENDOR') delete order.pickupOtp;
  if (role !== 'ADMIN' && role !== 'CUSTOMER') delete order.deliveryOtp;
  for (const field of ['vendor', 'customer', 'rider']) {
    if (order[field] && typeof order[field] === 'object') {
      delete order[field].passwordHash;
      delete order[field].refreshTokenHash;
    }
  }
  return order;
}
export function canTransition(user, order, status) {

  if (!canAccessOrder(user, order)) return false;
  if (user.role === 'CUSTOMER') return order.status === 'NEW_ORDER' && status === 'CANCELLED';
  if (user.role === 'ADMIN') return true;
  if (user.role === 'VENDOR') {
    // Vendors may only move through preparation stages; direct to delivery is prohibited
    return ({
      NEW_ORDER: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: ['PREPARING', 'REJECTED'],
      PREPARING: ['READY_FOR_RIDER', 'REJECTED'],
      // No direct transition to OUT_FOR_DELIVERY or DELIVERED from vendor side
      READY_FOR_RIDER: []
    }[order.status] || []).includes(status);
  }
  if (user.role === 'RIDER') {
    // Rider transitions should be handled by dedicated handlers; generic endpoint must reject.
    return false;
  }
  return false;


}
