export const SWIPE_MIN_DISTANCE = 50;
export const SWIPE_MAX_TIME_MS = 500;
export const SWIPE_MAX_VERTICAL = 100;

/** Tap on slide preview (no swipe): advance one slide, or go back if in the left edge zone */
export const TAP_MAX_MOVE_PX = 20;
export const TAP_MAX_DURATION_MS = 400;
/** Left fraction of the preview width where a tap goes to the previous slide */
export const TAP_BACK_ZONE_WIDTH_FRAC = 0.22;
export const PING_INTERVAL_MS = 30000;

/** Min time between emitting pointer samples to the server (ms) */
export const LASER_EMIT_INTERVAL_MS = 22;

/** Per-frame trail fade (higher = faster disappearance) */
export const LASER_FADE_STEP = 0.055;

/** Interpolation toward remote samples each frame (0–1); higher = snappier */
export const LASER_REMOTE_SMOOTHING = 0.32;

/** Skip drawing segments shorter than this (normalized coords) */
export const LASER_MIN_SEGMENT_NORM = 0.00012;

/** Idle frames before stopping the animation loop (trail has faded via destination-out) */
export const LASER_IDLE_FRAMES_STOP = 140;

/** 1×1 transparent GIF — placeholder `src` for the inactive slide layer before it has a real URL */
export const EMPTY_IMG_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
