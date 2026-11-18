import { useMemo, useRef } from 'react';
import type { CrewTheme } from '../tide/crew/Crew';
import { Actor } from '../tide/crew/Crew';
import { lookFor, type Motion, type Outfit } from '../tide/crew/Person';
import { KITCHEN_KIT } from '../tide/kitchen/acts';
import { KITCHEN_THEME } from '../tide/kitchen/theme';
import { OFFICE_THEME } from '../tide/office/theme';
import { WORKSHOP_THEME } from '../tide/workshop/theme';
import { useTankEnvironment } from '../tank/water';
import { sessionColor } from '../theme';

// People in a row, one per act, with stand-in furniture and their theme's
// work things, for close-ups: /?proto=crew&theme=kitchen|office|workshop|diner
// &acts=a,b,c&ids=x,y,z  (cam/target/fov as usual)
// The whole cast side by side, standing free: /?proto=crew&cast=chef:stand,office:wave,maker:stand,diner:umbrella
// (an outfit and an act each; add &helper=2,4 to make the 2nd and 4th small helpers).

const THEMES: Record<string, CrewTheme> = { kitchen: KITCHEN_THEME, office: OFFICE_THEME, workshop: WORKSHOP_THEME };
const DEFAULT: Record<string, string[]> = {
  kitchen: ['chop', 'stir', 'read', 'book', 'taste', 'strain', 'wipe', 'plate'],
  office: ['type', 'watch', 'paper', 'phone', 'ponder', 'scribble', 'sip', 'deskdoze'],
  workshop: ['saw', 'hammer', 'blueprint', 'rummage', 'tinker', 'sand', 'measure', 'paint'],
  diner: ['menu', 'eat', 'carry', 'serve', 'mug', 'nap', 'wave', 'stand'],
};
const SEATED = new Set(['mug', 'nap', 'menu', 'eat']);

function One({ theme, outfit, act, id, x, free = false, helper = false }: { theme: CrewTheme; outfit: Outfit; act: string; id: string; x: number; free?: boolean; helper?: boolean }) {
  const K = theme.plan.K;
  const st = theme.plan.stations[0];
  const desk = !free && !!st.seat;
  const seated = desk || SEATED.has(act);
  const look = useMemo(() => lookFor(id, sessionColor(id), outfit, helper), [id, outfit, helper]);
  const motion = useMemo<Motion>(() => ({ speed: 0, seat: 0.53 / K }), [K]);
  const actRef = useRef(act);
  actRef.current = act;
  const Station = theme.Station;
  const work = theme.plan.stations[0];
  const top = desk ? 0.84 : 0.92;
  return (
    <group position={[x, 0, 0]}>
      {!free && !SEATED.has(act) && act !== 'wave' && act !== 'stand' && act !== 'carry' && act !== 'serve' && act !== 'paint' && act !== 'clipboard' && (
        <>
          <mesh position={[0, top / 2, (work.zone.z0 + work.zone.z1) / 2 - work.z + 0.35]} receiveShadow castShadow>
            <boxGeometry args={[2.3, top, 1.5]} />
            <meshStandardMaterial color="#8a6748" roughness={0.8} />
          </mesh>
          <Station st={{ ...work, x: 0, z: 0 }} act={act} seed={x * 0.37} busy rush={false} />
        </>
      )}
      {seated && (
        <mesh position={[0, 0.265, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.32, 0.34, 0.53, 20]} />
          <meshStandardMaterial color="#5a4436" roughness={0.8} />
        </mesh>
      )}
      {SEATED.has(act) && (
        <mesh position={[0, 0.42, 0.75]} castShadow receiveShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.84, 24]} />
          <meshStandardMaterial color="#8a6748" roughness={0.8} />
        </mesh>
      )}
      <group scale={K * (helper ? 0.72 : 1)}>
        <Actor look={look} actRef={actRef} motion={motion} seed={x * 0.37 + 1} kit={outfit === 'diner' ? KITCHEN_KIT : theme.kit} />
      </group>
    </group>
  );
}

export function CrewPreview() {
  useTankEnvironment(0.45);
  const q = new URLSearchParams(location.search);
  const name = q.get('theme') || 'kitchen';
  const theme = THEMES[name] ?? KITCHEN_THEME;
  const outfit: Outfit = name === 'diner' ? 'diner' : theme.outfit;
  const acts = q.get('acts')?.split(',') ?? DEFAULT[name] ?? DEFAULT.kitchen;
  const ids = q.get('ids')?.split(',') ?? acts.map((_, i) => `person-${name}-${i * 7 + 3}`);
  const gap = Number(q.get('gap') ?? 2.6);
  // the whole cast: an outfit and an act each, standing free
  const cast = q.get('cast')?.split(',').map((e) => e.split(':') as [Outfit, string]);
  const helpers = new Set((q.get('helper') ?? '').split(',').filter(Boolean).map(Number));
  const THEME_OF: Record<Outfit, CrewTheme> = { chef: KITCHEN_THEME, office: OFFICE_THEME, maker: WORKSHOP_THEME, diner: KITCHEN_THEME };
  return (
    <>
      <color attach="background" args={['#1a1512']} />
      <hemisphereLight args={['#ffe9d2', '#3a2c24', 0.8]} />
      <directionalLight position={[4, 9, 8]} intensity={1.9} color="#ffe3c4" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}>
        <orthographicCamera attach="shadow-camera" args={[-14, 14, 8, -8, 0.5, 40]} />
      </directionalLight>
      <directionalLight position={[-6, 4, -6]} intensity={0.6} color="#9fc4ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 30]} />
        <meshStandardMaterial color="#4e3c30" roughness={0.9} />
      </mesh>
      {cast
        ? cast.map(([o, act], i) => (
            <One key={`${o}-${act}-${i}`} theme={THEME_OF[o] ?? KITCHEN_THEME} outfit={o} act={act} id={ids[i % ids.length]} x={(i - (cast.length - 1) / 2) * gap} free helper={helpers.has(i + 1)} />
          ))
        : acts.map((act, i) => <One key={`${act}-${i}`} theme={theme} outfit={outfit} act={act} id={ids[i % ids.length]} x={(i - (acts.length - 1) / 2) * gap} />)}
    </>
  );
}
