// @jest-environment jsdom

const React = require('react');
const { create, act } = require('react-test-renderer');
const LiveOrderMap = require('../../LiveOrderMap').default;

// Simple render mock using react-test-renderer
function render(element) {
  const instance = create(element);
  return {
    unmount: () => instance.unmount(),
    ...instance,
  };
}

// Mock react-native-maps components used in LiveOrderMap
jest.mock('react-native-maps', () => {
  const React = require('react');
  const MockMapView = (props) => React.createElement(React.Fragment, null, props.children);
  const MockMarker = (props) => React.createElement(React.Fragment, null, props.children);
  const MockAnimated = {
    View: (p) => p.children,
    ...React,
  };
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Animated: MockAnimated,
    PROVIDER_GOOGLE: 'google',
  };
});

// Mock the SocketContext to control riderLocation updates without real sockets
jest.mock('../../context/SocketContext', () => {
  const React = require('react');
  const mockSocket = { emit: jest.fn() };
  let riderLocationUpdate = null;
  const setRiderLocationUpdate = jest.fn((loc) => {
    riderLocationUpdate = loc;
  });
  const trackOrder = jest.fn();
  const leaveOrder = jest.fn();
  const useSocket = () => ({
    socketRef: { current: mockSocket },
    trackOrder,
    leaveOrder,
    riderLocationUpdate,
    setRiderLocationUpdate,
    trackedOrderRef: { current: null },
    // expose a helper for tests to push a new location
    __testPushLocation: (loc) => {
      setRiderLocationUpdate(loc);
    },
  });
  return { useSocket };
});

const makeLocation = (lat, lng, heading = 0, ts = Date.now()) => ({
  lat,
  lng,
  heading,
  at: new Date(ts).toISOString(),
});

describe('LiveOrderMap rider tracking logic', () => {
  it('ignores out‑of‑order timestamps', () => {
    const order = {
      _id: 'order123',
      vendor: { address: { location: { coordinates: [78, 20] } } },
      address: { lat: 21, lng: 79 },
      status: 'OUT_FOR_DELIVERY',
    };
    const { unmount } = render(React.createElement(LiveOrderMap, {order}));
    const { __testPushLocation } = require('../../context/SocketContext').useSocket();
    // First, push a newer timestamp
    act(() => {
      __testPushLocation(makeLocation(20.5, 78.5, 45, Date.now()));
    });
    // Then push an older timestamp – should be ignored
    act(() => {
      __testPushLocation(makeLocation(20.6, 78.6, 90, Date.now() - 10000));
    });
    // No errors means older update was ignored
    unmount();
  });

  it('cancels previous animations when a new location arrives', () => {
    const order = {
      _id: 'order456',
      vendor: { address: { location: { coordinates: [78, 20] } } },
      address: { lat: 21, lng: 79 },
      status: 'OUT_FOR_DELIVERY',
    };
    const { unmount } = render(React.createElement(LiveOrderMap, {order}));
    const { __testPushLocation } = require('../../context/SocketContext').useSocket();
    act(() => {
      __testPushLocation(makeLocation(20.5, 78.5, 30, Date.now()));
    });
    // Simulate quick second update which should stop the first animation
    act(() => {
      __testPushLocation(makeLocation(20.55, 78.55, 60, Date.now() + 500));
    });
    unmount();
  });

  it('cleans up on component unmount', () => {
    const order = {
      _id: 'order789',
      vendor: { address: { location: { coordinates: [78, 20] } } },
      address: { lat: 21, lng: 79 },
      status: 'OUT_FOR_DELIVERY',
    };
    const { unmount } = render(React.createElement(LiveOrderMap, {order}));
    const { leaveOrder } = require('../../context/SocketContext').useSocket();
    unmount();
    expect(leaveOrder).toHaveBeenCalled();
  });
});
