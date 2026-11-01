"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, type Points, type ShaderMaterial } from "three";

export function NetherAtmosphere({ intimate, reduced }: { intimate: boolean; reduced: boolean }) {
  const fog = useRef<ShaderMaterial>(null);
  const particles = useRef<Points>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uColor: { value: new Color("#74917a") } }), []);
  const positions = useMemo(() => {
    const values = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      values[i * 3] = Math.sin(i * 127.1) * 5;
      values[i * 3 + 1] = ((i * 0.618) % 1) * 4.4;
      values[i * 3 + 2] = -1 - ((i * 0.371) % 1) * 4;
    }
    return values;
  }, []);
  useFrame(({ clock }) => {
    if (fog.current) fog.current.uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
    if (particles.current && !reduced) particles.current.rotation.y = clock.elapsedTime * 0.018;
  });
  return <>
    <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[18, 12, 36, 24]} />
      <shaderMaterial ref={fog} uniforms={uniforms} transparent depthWrite={false} side={2}
        vertexShader={`uniform float uTime; varying vec2 vUv; varying float vHeight;
          void main(){vUv=uv; vec3 p=position; p.z=sin(p.x*1.3+uTime*.2)*.13+cos(p.y*1.7-uTime*.17)*.15;vHeight=p.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`}
        fragmentShader={`uniform float uTime;uniform vec3 uColor;varying vec2 vUv;varying float vHeight;
          void main(){float edge=smoothstep(.5,.12,length((vUv-.5)*vec2(1.,1.4)));float mist=.5+.5*sin(vUv.x*35.+sin(vUv.y*24.+uTime*.22)*3.+uTime*.18);gl_FragColor=vec4(uColor,edge*(.045+mist*.10+vHeight*.08));}`}
      />
    </mesh>
    <group visible={intimate}>
      {Array.from({ length: 6 }, (_, i) => <group key={i} position={[Math.sin(i * 4.7) * 3.8, 0.6 + (i % 3) * 1.1, -2.5 - (i % 2)]} scale={0.12}>
        {i % 2 === 0 ? <>
          <mesh scale={[1, 0.8, 1]}><sphereGeometry args={[0.6, 10, 6]} /><meshStandardMaterial color="#d66a26" emissive="#a43e0b" emissiveIntensity={0.35} /></mesh>
          <mesh position={[0, 0.55, 0]} rotation={[0, 0, -0.3]}><cylinderGeometry args={[0.06, 0.1, 0.3, 5]} /><meshStandardMaterial color="#7d8a5a" /></mesh>
        </> : <>
          {Array.from({ length: 6 }, (_, petal) => <group key={petal} rotation={[0, 0, petal * Math.PI / 3]}>
            <mesh position={[0, 0.34, 0]} rotation={[0.5, 0, 0]}><torusGeometry args={[0.32, 0.018, 4, 16, Math.PI * 1.4]} /><meshBasicMaterial color="#a43f32" transparent opacity={0.55} /></mesh>
          </group>)}
          <mesh position={[0, -0.55, 0]}><cylinderGeometry args={[0.012, 0.016, 0.9, 4]} /><meshBasicMaterial color="#57634d" /></mesh>
        </>}
      </group>)}
    </group>
    <points ref={particles} visible={intimate}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#f6a15d" size={0.025} transparent opacity={0.5} depthWrite={false} blending={AdditiveBlending} />
    </points>
  </>;
}
