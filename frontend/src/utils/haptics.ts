/**
 * Haptics utility for providing tactile feedback on mobile devices.
 */
export const hapticFeedback = {
  /**
   * Light impact feedback
   */
  light: () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  },

  /**
   * Medium impact feedback
   */
  medium: () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(20);
    }
  },

  /**
   * Heavy impact feedback
   */
  heavy: () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(40);
    }
  },

  /**
   * Success feedback (double tap)
   */
  success: () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate([10, 30, 10]);
    }
  },

  /**
   * Error feedback (longer pulse)
   */
  error: () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate([50, 50, 50]);
    }
  }
};

export default hapticFeedback;
