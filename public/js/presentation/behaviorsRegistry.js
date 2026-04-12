import { device } from './device.js';
import { socketApi } from './socket.js';
import { navigation } from './navigation.js';
import { laserUi } from './laserUi.js';
import { drawing } from './drawing.js';

/**
 * Ordered list of behavior objects merged into the presentation component.
 * Intentionally flat method maps; duplicate keys should be treated as bugs.
 */
export const presentationBehaviors = [device, socketApi, navigation, laserUi, drawing];
