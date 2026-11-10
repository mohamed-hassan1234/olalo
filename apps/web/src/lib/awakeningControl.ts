/** Imperative handle so the HTML Skip button can end the Awakening without importing any 3D code. */
export const awakeningControl: { skip?: () => void; progress: number } = { progress: 0 };
