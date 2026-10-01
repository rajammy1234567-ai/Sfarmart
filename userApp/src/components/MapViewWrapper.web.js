// Web fallback — MUST NEVER import or evaluate react-native-maps
const Dummy = () => null;
Dummy.Animated = Dummy;

const MapView = null;
const Marker = Dummy;
const Polyline = Dummy;
const PROVIDER_GOOGLE = 'google';
const MapViewDirections = Dummy;

class DummyAnimatedRegion {
  constructor(props) {
    Object.assign(this, props);
  }
  timing() {
    return {
      start: (cb) => {
        if (typeof cb === 'function') cb({ finished: true });
      },
      stop: () => {}
    };
  }
  setValue(props) {
    Object.assign(this, props);
  }
}

const AnimatedRegion = DummyAnimatedRegion;

export { MapView, Marker, Polyline, PROVIDER_GOOGLE, MapViewDirections, AnimatedRegion };
export default MapView;
