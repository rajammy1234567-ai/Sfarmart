/**
 * Shared layout constants and spacing helpers for S-farmart Customer App
 */
export const TAB_BAR_HEIGHT = 62;
export const STICKY_CART_HEIGHT = 56;

export const getDockBottomOffset = (insets) => {
  const bottom = insets?.bottom || 0;
  return bottom > 0 ? bottom + 8 : 12;
};

export const getDockTotalHeight = (insets) => {
  return TAB_BAR_HEIGHT + getDockBottomOffset(insets);
};

export const getStickyCartBottom = (insets) => {
  return getDockTotalHeight(insets) + 8;
};

export const getScrollBottomPadding = (insets, hasActiveCart = false) => {
  const dockH = getDockTotalHeight(insets);
  if (hasActiveCart) {
    return dockH + STICKY_CART_HEIGHT + 20;
  }
  return dockH + 16;
};

