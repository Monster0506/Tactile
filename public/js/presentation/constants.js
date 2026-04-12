export const SWIPE_MIN_DISTANCE = 50;
export const SWIPE_MAX_TIME_MS = 500;
export const SWIPE_MAX_VERTICAL = 100;
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
