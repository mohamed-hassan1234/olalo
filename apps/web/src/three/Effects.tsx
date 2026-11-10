'use client';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

/** HIGH profile only (lazy-loaded): selective bloom on emissive elements plus a soft vignette. */
export default function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.9} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
      <Vignette offset={0.3} darkness={0.6} />
    </EffectComposer>
  );
}
