import React from 'react';

const Dummy = () => null;

const MapView = null;
const Marker = Dummy;
const Polyline = Dummy;
const PROVIDER_GOOGLE = 'google';
const MapViewDirections = Dummy;
const AnimatedRegion = class {
  constructor(initial) {
    this.latitude = initial?.latitude || 0;
    this.longitude = initial?.longitude || 0;
  }
  setValue(val) {
    this.latitude = val.latitude;
    this.longitude = val.longitude;
  }
  timing() {
    return {
      start: (cb) => cb?.({ finished: true }),
      stop: () => {}
    };
  }
};

export { MapView, Marker, Polyline, PROVIDER_GOOGLE, MapViewDirections, AnimatedRegion };
export default MapView;
