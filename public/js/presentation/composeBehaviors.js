/**
 * @param {Record<string, unknown>} target - Alpine component state (mutated)
 * @param {ReadonlyArray<Record<string, unknown>>} behaviors
 */
export function mergePresentationBehaviors(target, behaviors) {
  for (const behavior of behaviors) {
    Object.assign(target, behavior);
  }
  return target;
}
