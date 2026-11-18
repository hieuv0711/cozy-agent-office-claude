import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import type { StationProps } from '../crew/Crew';
import { DESK_MUG, LAPTOP, NOTEPAD, PHONE } from './acts';
import { handsetGeometry, laptopBaseGeometry, laptopLidGeometry, mugGeometry, notepadGeometry, officeMats, paperStackGeometry, penGeometry, phoneBaseGeometry, screenMaterial } from './props';
import { K } from './plan';

// A person's things on their desk, in the desk's frame: the laptop (open while
// someone has the desk, its screen showing what they're doing; closed when the
// desk is free), the desk phone, a notepad and pen, a mug, and a stack of
// printouts that grows while a workflow runs.

const MODE: Record<string, number> = { type: 1, ponder: 1, scribble: 1, sip: 1, watch: 2, paper: 3, phone: 4 };

export const Desk = memo(function Desk({ st, act, seed, busy, rush }: StationProps) {
  const m = officeMats();
  const screen = useMemo(() => screenMaterial(st.x * 7.1 + st.z * 3.3), [st.x, st.z]);
  useEffect(() => () => screen.dispose(), [screen]);
  const lid = useRef<THREE.Group>(null);
  const open = useRef(busy ? 1 : 0);
  const clock = useRef(0);
  const stack = useRef(0);
  const stackMesh = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta);
    // the lid opens when someone has this desk
    open.current += ((busy ? 1 : 0) - open.current) * (1 - Math.exp(-dt * 2));
    // closed it lies over the keys; open it leans back, away from the person
    if (lid.current) lid.current.rotation.x = Math.PI / 2 - open.current * (Math.PI / 2 + 0.26);
    const mode = act ? (MODE[act] ?? 0) : 0;
    // the screen only moves while it's being worked on
    if (act === 'type' || act === 'watch' || act === 'phone' || act === 'paper') clock.current += dt;
    const u = screen.uniforms;
    u.uTime.value = clock.current;
    u.uMode.value = mode;
    u.uOn.value = 0.82 * Math.max(0, open.current - 0.6) * 2.5 * (act === 'deskdoze' ? 0.4 : 1);
    // printouts pile up while a workflow runs
    stack.current = rush ? Math.min(8, stack.current + dt * 0.25) : Math.max(0, stack.current - dt * 0.5);
    if (stackMesh.current) stackMesh.current.visible = stack.current > 0.5;
  });
  const n = Math.max(1, Math.round(stack.current));
  return (
    <group position={[st.x, 0, st.z]} rotation={[0, st.yaw, 0]} scale={K}>
      {/* the laptop: its back to the person, the hinge on the far side */}
      <group position={[LAPTOP.x, LAPTOP.y, LAPTOP.z]} rotation={[0, Math.PI, 0]}>
        <mesh geometry={laptopBaseGeometry()} material={m.alu} castShadow receiveShadow />
        <group ref={lid} position={[0, 0.011, -0.069]}>
          <mesh geometry={laptopLidGeometry()} material={m.alu} castShadow />
          <mesh material={screen} position={[0, 0.066, 0.0045]}>
            <planeGeometry args={[0.18, 0.112]} />
          </mesh>
        </group>
      </group>
      <group position={[PHONE.x, PHONE.y, PHONE.z]} rotation={[0, 0.25, 0]}>
        <mesh geometry={phoneBaseGeometry()} material={m.plastic} castShadow receiveShadow />
        {act !== 'phone' && <mesh geometry={handsetGeometry()} material={m.plastic} position={[-0.03, 0.03, 0]} rotation={[Math.PI / 2, 0, 0.05]} castShadow />}
      </group>
      <group position={[NOTEPAD.x, NOTEPAD.y, NOTEPAD.z]} rotation={[0, -0.2, 0]}>
        <mesh geometry={notepadGeometry()} material={m.paper} receiveShadow />
        {act !== 'scribble' && act !== 'phone' && <mesh geometry={penGeometry()} material={m.plastic} position={[0.045, 0.004, 0]} rotation={[0, 0.3, Math.PI / 2]} />}
      </group>
      {act !== 'sip' && <mesh geometry={mugGeometry(Math.floor(seed * 3))} material={m.ceramic} position={[DESK_MUG.x, DESK_MUG.y, DESK_MUG.z]} rotation={[0, 2.2, 0]} castShadow />}
      <mesh ref={stackMesh} geometry={paperStackGeometry(n)} material={m.paper} position={[0.33, LAPTOP.y, 0.33]} rotation={[0, 0.2, 0]} visible={false} castShadow />
    </group>
  );
});
