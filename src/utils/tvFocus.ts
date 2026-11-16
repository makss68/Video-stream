import { Platform } from 'react-native';

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
