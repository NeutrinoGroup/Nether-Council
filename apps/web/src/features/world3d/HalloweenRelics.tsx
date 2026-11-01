"use client";
// Small stage props: a bamboo witch's broom and a cinnabar-tipped wand.
// Authored geometry rather than another model download.
export function HalloweenRelics() {
  return <group position={[-1.28, 0, -0.3]} rotation={[0, 0, -0.18]}>
    <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.018, 0.023, 1.5, 8]} /><meshStandardMaterial color="#7d5833" roughness={0.85} /></mesh>
    {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[(i - 5) * 0.025, 0.17, Math.sin(i * 2.4) * 0.035]} rotation={[0, 0, (i - 5) * -0.04]}><cylinderGeometry args={[0.006, 0.018, 0.34, 5]} /><meshStandardMaterial color="#9b794b" roughness={1} /></mesh>)}
    <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.06, 0.013, 5, 12]} /><meshStandardMaterial color="#a44f31" /></mesh>
    <group position={[0.58, 0.34, 0.38]} rotation={[0, 0, -1.1]}>
      <mesh><cylinderGeometry args={[0.01, 0.015, 0.62, 7]} /><meshStandardMaterial color="#6a3b2f" /></mesh>
      <mesh position={[0, 0.34, 0]}><octahedronGeometry args={[0.045]} /><meshStandardMaterial color="#f6a15d" emissive="#ff6b00" emissiveIntensity={0.5} /></mesh>
    </group>
  </group>;
}
