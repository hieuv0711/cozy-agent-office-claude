import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { WORLD_WORDS, WORLDS } from '../office/world';
import { batchStatic } from './batch';
import { onWalkway } from './crew/itemPlaces';
import { editor, type EditorState, setEditing, touch } from './editorState';
import { itemsOf, layoutActions, newId, useCustomised, useItems } from './layoutStore';
import { catalogFor, inWorkZone, THEMES } from './themes';
import { thumbs } from './Thumbs';
import type { CatalogItem, Placed, Surface, ThemeId } from './types';
import { tip } from '../panels/Tooltip';

// Customise mode. In the scene: click an item to select it, drag it to move it
// along the surfaces it can stand on (a counter, bench or desk, a shelf, a sill,
// the floor, the wall). In the panel: pick something to add, then click where it
// goes; turn, resize, duplicate or remove the selected item; reset the theme.

const TURN = Math.PI / 12;

interface Hit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  surface: Surface;
}

/** Where an item lands on a surface hit, or null where it can't go (and why, when it's a rule: see `blocked`). */
function landing(def: CatalogItem, hit: Hit, theme: ThemeId, scale = 1): { p: [number, number, number]; r?: number } | null {
  const { point: q, surface } = hit;
  blocked = null;
  if (surface === 'wall') return { p: [q.x + hit.normal.x * 0.002, q.y, q.z + hit.normal.z * 0.002], r: Math.atan2(hit.normal.x, hit.normal.z) };
  // things stand on surfaces that face up, not on the edge of a counter or a shelf
  if (hit.normal.y < 0.6) return null;
  // and never on someone's own work spot
  if (surface === 'top' && inWorkZone(theme, q.x, q.z, def.radius * 0.5)) {
    blocked = 'workspot';
    return null;
  }
  // nor in people's way: the walkways stay clear (a rug is fine)
  if (surface === 'floor' && def.height > 0.12 && onWalkway(THEMES[theme].crew, q.x, q.z, def.radius * scale * 0.8)) {
    blocked = 'walkway';
    return null;
  }
  return { p: [q.x, q.y, q.z] };
}
/** Why the last landing() refused its spot. */
let blocked: EditorState['blocked'] = null;
const tellBlocked = () => {
  if (editor.get().blocked !== blocked) editor.set({ blocked });
};

function useSurfacePicker() {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const nm = useMemo(() => new THREE.Matrix3(), []);
  return useMemo(
    () =>
      (clientX: number, clientY: number, surfaces: Surface[]): Hit | null => {
        const rect = gl.domElement.getBoundingClientRect();
        ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const meshes: THREE.Object3D[] = [];
        scene.traverse((o) => {
          const s = o.userData?.surface as Surface | undefined;
          if (s && surfaces.includes(s) && o.visible) meshes.push(o);
        });
        const hit = raycaster.intersectObjects(meshes, false)[0];
        if (!hit) return null;
        const normal = hit.face ? hit.face.normal.clone().applyMatrix3(nm.getNormalMatrix(hit.object.matrixWorld)).normalize() : new THREE.Vector3(0, 0, 1);
        return { point: hit.point, normal, surface: hit.object.userData.surface as Surface };
      },
    [camera, gl, scene, raycaster, ndc, nm],
  );
}

const ringFlat = new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2);
const ringUp = new THREE.RingGeometry(0.94, 1, 64);
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f6f1e4').multiplyScalar(1.7), transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false });
const ghostRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a9b8f0').multiplyScalar(1.5), transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, toneMapped: false });

function Ring({ def, it, mat }: { def: CatalogItem; it: { p: [number, number, number]; r: number; s: number }; mat: THREE.Material }) {
  const wall = def.surfaces.length === 1 && def.surfaces[0] === 'wall';
  const r = (def.radius + 0.12) * it.s;
  return wall ? (
    <mesh geometry={ringUp} material={mat} position={[it.p[0], it.p[1], it.p[2] + 0.02]} rotation={[0, it.r, 0]} scale={r} renderOrder={20} />
  ) : (
    <mesh geometry={ringFlat} material={mat} position={[it.p[0], it.p[1] + 0.03, it.p[2]]} scale={r} renderOrder={20} />
  );
}

function ItemNode({ it, def, editing, onGrab }: { it: Placed; def: CatalogItem; editing: boolean; onGrab: (e: ThreeEvent<PointerEvent>, it: Placed) => void }) {
  const R = def.Render;
  return (
    <group
      position={it.p}
      rotation={[0, it.r, 0]}
      scale={it.s}
      onPointerDown={editing ? (e) => onGrab(e, it) : undefined}
      onPointerOver={
        editing
          ? (e) => {
              e.stopPropagation();
              document.body.style.cursor = 'grab';
            }
          : undefined
      }
      onPointerOut={editing ? () => (document.body.style.cursor = '') : undefined}
    >
      <R seed={it.seed} />
    </group>
  );
}

/** The theme's items, live: draggable and selectable in customise mode. */
export function EditableItems({ theme }: { theme: ThemeId }) {
  const items = useItems(theme);
  const catalog = catalogFor(theme);
  const editing = editor.use((e) => e.editing);
  const selected = editor.use((e) => e.selected);
  const placing = editor.use((e) => e.placing);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const gl = useThree((s) => s.gl);
  const pick = useSurfacePicker();
  const drag = useRef<{ id: string; def: CatalogItem } | null>(null);
  const ghost = useRef<THREE.Group>(null);
  const ghostRing = useRef<THREE.Group>(null);
  const ghostAt = useRef<{ p: [number, number, number]; r: number } | null>(null);
  const room = useRef<THREE.Group>(null);

  // the room's things only catch a little of the studio reflections, like the room
  useLayoutEffect(() => {
    room.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.3;
    });
  });

  const placingDef = placing ? catalog.get(placing.kind) : undefined;

  // while nobody is customizing, the things that hold still are merged into a
  // draw call per material (tide/batch.ts); editing, or a new layout, undoes it
  const layoutKey = JSON.stringify(items);
  useEffect(() => {
    if (editing || new URLSearchParams(location.search).get('batch') === '0') return;
    let undo: (() => void) | null = null;
    let cancel: (() => void) | null = null;
    const start = window.setTimeout(() => {
      if (room.current) cancel = batchStatic(room.current, 1200, (b) => void (undo = b?.undo ?? null));
    }, 2500);
    return () => {
      window.clearTimeout(start);
      cancel?.();
      undo?.();
    };
  }, [editing, layoutKey]);

  useEffect(() => {
    if (!editing) return;
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (d) {
        const hit = pick(e.clientX, e.clientY, d.def.surfaces);
        const scale = itemsOf(theme).find((it) => it.id === d.id)?.s ?? 1;
        const at = hit && landing(d.def, hit, theme, scale);
        if (!hit) blocked = null;
        tellBlocked();
        if (at) layoutActions.update(theme, d.id, at.r === undefined ? { p: at.p } : { p: at.p, r: at.r });
        return;
      }
      const pl = editor.get().placing;
      const def = pl && catalog.get(pl.kind);
      if (def) {
        const hit = pick(e.clientX, e.clientY, def.surfaces);
        const at = hit && landing(def, hit, theme);
        if (!hit) blocked = null;
        tellBlocked();
        ghostAt.current = at ? { p: at.p, r: at.r ?? 0 } : null;
        if (ghost.current) {
          ghost.current.visible = !!at;
          if (at) {
            ghost.current.position.set(...at.p);
            ghost.current.rotation.set(0, at.r ?? 0, 0);
          }
        }
        if (ghostRing.current) {
          ghostRing.current.visible = !!at;
          if (at) {
            ghostRing.current.position.set(...at.p);
            ghostRing.current.rotation.set(0, at.r ?? 0, 0);
          }
        }
      }
    };
    const down = (e: PointerEvent) => {
      const pl = editor.get().placing;
      if (!pl || e.button !== 0) return;
      const at = ghostAt.current;
      if (!at) return;
      const id = newId();
      layoutActions.add(theme, { id, kind: pl.kind, p: at.p, r: at.r, s: 1, seed: pl.seed });
      touch();
      editor.set({ placing: null, selected: id });
      ghostAt.current = null;
    };
    const up = () => {
      if (editor.get().blocked) editor.set({ blocked: null });
      if (!drag.current) return;
      touch();
      drag.current = null;
      document.body.style.cursor = '';
      if (controls) controls.enabled = true;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [editing, gl, pick, catalog, theme, controls]);

  // while placing, the camera holds still so the click lands where you aim
  useEffect(() => {
    if (!controls) return;
    controls.enabled = !placing;
    return () => {
      controls.enabled = true;
    };
  }, [placing, controls]);

  // leaving customise mode puts the cursor back
  useEffect(() => {
    if (!editing) document.body.style.cursor = '';
  }, [editing]);

  const grab = (e: ThreeEvent<PointerEvent>, it: Placed) => {
    if (editor.get().placing || e.button !== 0) return;
    e.stopPropagation();
    const def = catalog.get(it.kind);
    if (!def) return;
    touch();
    editor.set({ selected: it.id });
    drag.current = { id: it.id, def };
    document.body.style.cursor = 'grabbing';
    if (controls) controls.enabled = false;
  };

  useFrame(() => {
    if (ghost.current && !placing) ghost.current.visible = false;
  });

  const sel = selected ? items.find((it) => it.id === selected) : undefined;
  const selDef = sel ? catalog.get(sel.kind) : undefined;
  const node = (it: Placed) => {
    const def = catalog.get(it.kind);
    return def ? <ItemNode key={it.id} it={it} def={def} editing={editing} onGrab={grab} /> : null;
  };
  const GhostR = placingDef?.Render;
  return (
    <>
      <group ref={room}>{items.map(node)}</group>
      {editing && sel && selDef && <Ring def={selDef} it={sel} mat={ringMat} />}
      {editing && placingDef && GhostR && (
        <>
          <group ref={ghost} visible={false}>
            <GhostR seed={placing!.seed} />
          </group>
          <group ref={ghostRing} visible={false}>
            <Ring def={placingDef} it={{ p: [0, 0, 0], r: 0, s: 1 }} mat={ghostRingMat} />
          </group>
        </>
      )}
    </>
  );
}

// ---------- the panel ----------

function grouped(list: CatalogItem[]) {
  const out = new Map<string, CatalogItem[]>();
  for (const it of list) {
    const g = out.get(it.group) || [];
    g.push(it);
    out.set(it.group, g);
  }
  return [...out.entries()];
}

function Palette({ title, list, placing }: { title: string; list: CatalogItem[]; placing: string | null }) {
  const pics = thumbs.use((s) => s.map);
  return (
    <section className="cz-sec">
      <h3>{title}</h3>
      {grouped(list).map(([group, defs]) => (
        <div key={group} className="cz-group">
          <span className="cz-group-name">{group}</span>
          <div className="cz-items">
            {defs.map((d) => (
              <button
                key={d.kind}
                type="button"
                className="cz-item"
                aria-pressed={placing === d.kind}
                onClick={() => editor.set({ placing: placing === d.kind ? null : { kind: d.kind, seed: Math.floor(Math.random() * 997) }, selected: null })}
              >
                <span className="cz-thumb" aria-hidden="true">
                  {pics[d.kind] && pics[d.kind] !== 'none' ? <img src={pics[d.kind]} alt="" /> : null}
                </span>
                <span className="cz-label">{d.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function selectedTools(theme: ThemeId, catalog: Map<string, CatalogItem>) {
  const get = () => {
    const id = editor.get().selected;
    const it = id ? itemsOf(theme).find((x) => x.id === id) : undefined;
    const def = it ? catalog.get(it.kind) : undefined;
    return it && def ? { it, def } : null;
  };
  return {
    turn(dir: 1 | -1) {
      const x = get();
      if (x && !x.def.surfaces.every((s) => s === 'wall')) layoutActions.update(theme, x.it.id, { r: x.it.r + dir * TURN });
    },
    resize(dir: 1 | -1) {
      const x = get();
      if (!x) return;
      const s = Math.max(x.def.minScale ?? 0.5, Math.min(x.def.maxScale ?? 1.8, Math.round((x.it.s * (dir > 0 ? 1.1 : 1 / 1.1)) * 100) / 100));
      layoutActions.update(theme, x.it.id, { s });
    },
    duplicate() {
      const x = get();
      if (!x) return;
      const id = newId();
      const shift = x.def.radius * x.it.s * 1.6;
      const p: [number, number, number] = [x.it.p[0] + (x.it.p[0] > 0 ? -shift : shift), x.it.p[1], x.it.p[2]];
      layoutActions.add(theme, { ...x.it, id, p, seed: Math.floor(Math.random() * 997) });
      editor.set({ selected: id });
    },
    remove() {
      const x = get();
      if (!x) return;
      layoutActions.remove(theme, x.it.id);
      editor.set({ selected: null });
    },
  };
}

/** The customise panel: what you can add, the selected item's tools, reset and done. */
export function CustomizePanel({ theme }: { theme: ThemeId }) {
  const editing = editor.use((e) => e.editing);
  const selected = editor.use((e) => e.selected);
  const placing = editor.use((e) => e.placing);
  const blockedWhy = editor.use((e) => e.blocked);
  const items = useItems(theme);
  const customised = useCustomised(theme);
  const catalog = catalogFor(theme);
  const [confirmReset, setConfirmReset] = useState(false);
  const tools = useMemo(() => selectedTools(theme, catalog), [theme, catalog]);

  useEffect(() => setConfirmReset(false), [theme, editing]);
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const st = editor.get();
      if (k === 'Escape') {
        if (st.placing) editor.set({ placing: null });
        else if (st.selected) editor.set({ selected: null });
        else setEditing(false);
      } else if (!st.selected) return;
      else if (k === 'r' || k === 'R') tools.turn(e.shiftKey ? -1 : 1);
      else if (k === '[') tools.resize(-1);
      else if (k === ']') tools.resize(1);
      else if (k === 'd' || k === 'D') tools.duplicate();
      else if (k === 'Delete' || k === 'Backspace') tools.remove();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, tools]);

  if (!editing) return null;
  const sel = selected ? items.find((it) => it.id === selected) : undefined;
  const selDef = sel ? catalog.get(sel.kind) : undefined;
  const placingDef = placing ? catalog.get(placing.kind) : undefined;
  const onWall = !!selDef && selDef.surfaces.every((s) => s === 'wall');
  const why = blockedWhy === 'walkway' ? 'People walk here: keep the way clear.' : blockedWhy === 'workspot' ? "That's someone's work spot." : null;
  return (
    <aside className="customize" aria-label={`Customize the ${WORLDS[theme].name} theme`} data-selected={selected ?? ''} data-placing={placing?.kind ?? ''}>
      <div className="cz-head">
        <span className="title-card">Customize</span>
        <span className="cz-theme">{WORLDS[theme].name}</span>
      </div>
      <div className="cz-now" aria-live="polite">
        {sel && selDef ? (
          <>
            <div className="cz-sel-name">{selDef.label}</div>
            <div className="cz-tools">
              {!onWall && (
                <>
                  <button type="button" className="icon-btn" onClick={() => tools.turn(-1)} {...tip('Turns it 15° to the left.', 'Turn left', 'Shift+R')}>
                    Turn left
                  </button>
                  <button type="button" className="icon-btn" onClick={() => tools.turn(1)} {...tip('Turns it 15° to the right.', 'Turn right', 'R')}>
                    Turn right
                  </button>
                </>
              )}
              <button type="button" className="icon-btn" onClick={() => tools.resize(-1)} {...tip('A size smaller, down to the smallest it goes.', 'Smaller', '[')}>
                Smaller
              </button>
              <button type="button" className="icon-btn" onClick={() => tools.resize(1)} {...tip('A size bigger, up to the biggest it goes.', 'Bigger', ']')}>
                Bigger
              </button>
              <button type="button" className="icon-btn" onClick={tools.duplicate} {...tip('Puts a copy of it beside it.', 'Duplicate', 'D')}>
                Duplicate
              </button>
              <button type="button" className="icon-btn cz-remove" onClick={tools.remove} {...tip('Takes it out of the room.', 'Remove', 'Delete')}>
                Remove
              </button>
            </div>
            <p className="cz-hint">Drag it to move it. Esc to let go.</p>
          </>
        ) : placingDef ? (
          <p className="cz-hint">
            Click where the <b>{placingDef.label.toLowerCase()}</b> should go. Esc to cancel.
          </p>
        ) : (
          <p className="cz-hint">Pick something to add, then click where it goes. Drag anything to move it; click it for more.</p>
        )}
        {why && (
          <p className="cz-hint cz-blocked" role="status">
            {why}
          </p>
        )}
      </div>
      <div className="cz-body">
        <Palette title={`Around the ${WORLD_WORDS[theme].view.toLowerCase()}`} list={THEMES[theme].items} placing={placing?.kind ?? null} />
      </div>
      <div className="cz-foot">
        <button
          type="button"
          className="btn"
          disabled={!customised}
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true);
            layoutActions.reset(theme);
            editor.set({ selected: null, placing: null });
            setConfirmReset(false);
          }}
        >
          {confirmReset ? 'Click again to reset' : 'Reset theme'}
        </button>
        <button type="button" className="btn primary" onClick={() => setEditing(false)}>
          Done
        </button>
      </div>
    </aside>
  );
}
