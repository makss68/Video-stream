import { PixelRatio, Platform } from 'react-native';

/**
 * TV lists: margin kept between the focused card and the top/bottom edge, as the list's
 * `fadingEdgeLength` (pixels). Android scrolls a list just enough to show the focused card, which
 * leaves it flush with the edge — cut off on TVs that crop the picture (overscan), with nothing
 * visible below it. The scroll view keeps its fading edges clear when scrolling to the focused
 * card, so the card stops about one card height from the edge and the next cards show through
 * the fade. 0 (no fade) on phones.
 * (Lists must also sit in a flex: 1 box: see the listBox styles of the list screens.)
 */
export const TV_LIST_EDGE = Platform.isTV ? PixelRatio.getPixelSizeForLayoutSize(90) : 0;

/**
 * Focus a view on TV once a screen is back on top.
 *
 * On return from a pushed screen, react-native-screens fires onAppear (→ 'transitionEnd')
 * before the leaving screen's views are detached. Detaching the view that held focus makes
 * Android hand focus to the first focusable view, undoing an immediate request. So the
 * request is repeated once the old screen is gone.
 */
export function restoreTVFocus(getTarget: () => any): () => void {
  if (!Platform.isTV) return () => {};
  const focus = () => {
    const target = getTarget();
    if (!target) return;
    if (typeof target.requestTVFocus === 'function') target.requestTVFocus();
    else target.setNativeProps?.({ hasTVPreferredFocus: true });
  };
  focus();
  const timers = [setTimeout(focus, 150), setTimeout(focus, 450)];
  return () => timers.forEach(clearTimeout);
}
