import { ContactShadows, RoundedBox, useTexture, useVideoTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Stop } from "@/lib/story-steps";
import { useMediaUrl } from "@/lib/use-media-url";

type Media = Extract<Stop["blocks"][number], { type: "photo" | "video" }>;

const PAPER = "#f3e9d6";
const BRASS = "#c9c1ae";
const LEATHER = "#3b2f28";
const PRINT_HEIGHT = 1.7;

// Where things sit for the current window shape, in world units.
type Layout = {
  cameraPos: [number, number, number];
  cameraScale: number;
  frontPos: [number, number, number];
  frontScale: number;
  thumbY: number;
  thumbGap: number;
  thumbScale: number;
};

function layoutFor(viewportWidth: number): Layout {
  if (viewportWidth < 6.5) {
    const frontScale = Math.min(1, (viewportWidth * 0.8) / 2.7);
    return {
      cameraPos: [-1.1, -1.95, 0.4],
      cameraScale: 0.55,
      frontPos: [0.15, 0.55, 2.4],
      frontScale,
      thumbY: -1.05,
      thumbGap: 0.62 * frontScale,
      thumbScale: 0.28,
    };
  }
  return {
    cameraPos: [-2.4, -0.4, 0],
    cameraScale: 1,
    frontPos: [1.1, 0.4, 2.4],
    frontScale: 1,
    thumbY: -1.25,
    thumbGap: 0.78,
    thumbScale: 0.3,
  };
}

// A vintage folding camera that opens up, and the stop's pictures coming
// out of its lens as prints. Click a print to bring it to the front; click
// empty space to move the story on (left third goes back).
export function CameraScene({
  stop,
  opening,
  onBack,
  onNext,
}: {
  stop: Stop;
  opening: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const media = useMemo(() => stop.blocks.filter((b): b is Media => b.type === "photo" || b.type === "video"), [stop]);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.6, 7.5], fov: 38 }}
      gl={{ alpha: true, antialias: true }}
      onPointerMissed={(e) => {
        const el = e.target as HTMLElement;
        const { left, width } = el.getBoundingClientRect();
        if (e.clientX - left < width / 3) onBack();
        else onNext();
      }}
      style={{ touchAction: "pan-y" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.9} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 2.5, 3]} intensity={12} color="#ffd9a0" />
      <Scene media={media} opening={opening} />
      <ContactShadows position={[0, -2.3, 1]} opacity={0.55} scale={16} blur={2.6} far={4} />
    </Canvas>
  );
}

function Scene({ media, opening }: { media: Media[]; opening: boolean }) {
  const viewportWidth = useThree((s) => s.viewport.getCurrentViewport(s.camera, new THREE.Vector3(0, 0, 2.4)).width);
  const layout = useMemo(() => layoutFor(viewportWidth), [viewportWidth]);
  const [front, setFront] = useState(0);
  // Seconds since this stop appeared; prints emerge on this clock.
  const timeRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const openedRef = useRef(!opening);
  const lensWorld = useRef(new THREE.Vector3());

  useEffect(() => {
    startRef.current = null;
    setFront(0);
  }, [media]);

  const emergeAt = opening && !openedRef.current ? 2.1 : 0.3;

  return (
    <>
      <FoldingCamera
        layout={layout}
        opening={opening}
        timeRef={timeRef}
        startRef={startRef}
        openedRef={openedRef}
        lensWorld={lensWorld}
      />
      {media.length === 0 ? (
        <Print
          index={0}
          front={0}
          count={1}
          aspect={4 / 3}
          layout={layout}
          timeRef={timeRef}
          lensWorld={lensWorld}
          emergeAt={emergeAt}
          onPick={() => {}}
        />
      ) : (
        media.map((m, i) => (
          <Suspense key={m.mediaId} fallback={null}>
            <MediaPrint
              media={m}
              index={i}
              front={front}
              count={media.length}
              layout={layout}
              timeRef={timeRef}
              lensWorld={lensWorld}
              emergeAt={emergeAt}
              onPick={setFront}
            />
          </Suspense>
        ))
      )}
    </>
  );
}

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

function FoldingCamera({
  layout,
  opening,
  timeRef,
  startRef,
  openedRef,
  lensWorld,
}: {
  layout: Layout;
  opening: boolean;
  timeRef: React.MutableRefObject<number>;
  startRef: React.MutableRefObject<number | null>;
  openedRef: React.MutableRefObject<boolean>;
  lensWorld: React.MutableRefObject<THREE.Vector3>;
}) {
  const body = useRef<THREE.Group>(null);
  const door = useRef<THREE.Group>(null);
  const lens = useRef<THREE.Group>(null);
  const bellows = useRef<Array<THREE.Mesh | null>>([]);
  const folds = [0, 1, 2, 3, 4];

  useFrame((state) => {
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - startRef.current;
    timeRef.current = t;

    let open = 1;
    if (!openedRef.current) {
      open = opening ? smooth((t - 0.4) / 1.6) : 1;
      if (open >= 1) openedRef.current = true;
    }
    if (door.current) door.current.rotation.x = open * 1.9;
    const reach = 0.42 + open * 0.95;
    if (lens.current) {
      lens.current.position.z = reach;
      lens.current.scale.setScalar(0.05 + 0.95 * open);
      lens.current.getWorldPosition(lensWorld.current);
    }
    bellows.current.forEach((m, k) => {
      if (!m) return;
      m.position.z = 0.42 + (reach - 0.42) * ((k + 0.5) / folds.length);
      m.scale.setScalar(0.05 + 0.95 * open);
    });
    if (body.current) {
      body.current.rotation.y = 0.85 + Math.sin(state.clock.elapsedTime * 0.5) * 0.035;
      body.current.position.y = layout.cameraPos[1] + Math.sin(state.clock.elapsedTime * 0.8) * 0.02;
    }
  });

  return (
    <group ref={body} position={layout.cameraPos} scale={layout.cameraScale} rotation={[0.08, 0.85, 0]}>
      <RoundedBox args={[2.6, 1.6, 1.0]} radius={0.1} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color={LEATHER} roughness={0.8} />
      </RoundedBox>
      {/* Brass top plate, viewfinder, shutter and winder */}
      <mesh position={[0, 0.84, 0]} castShadow>
        <boxGeometry args={[2.5, 0.1, 0.9]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position={[-0.75, 1.03, 0]} castShadow>
        <boxGeometry args={[0.4, 0.28, 0.35]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position={[-0.75, 1.03, 0.18]}>
        <boxGeometry args={[0.22, 0.14, 0.02]} />
        <meshStandardMaterial color="#1a1f2a" metalness={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[0.9, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.14, 24]} />
        <meshStandardMaterial color="#b91c1c" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0.4, 0.98, -0.1]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.18, 32]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.3} />
      </mesh>
      {[-1.35, 1.35].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.08, 0.025, 8, 16]} />
          <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      {/* The opening in the front, and the door hinged along its bottom edge */}
      <mesh position={[0, 0, 0.5]}>
        <boxGeometry args={[1.5, 1.3, 0.04]} />
        <meshStandardMaterial color="#15110f" roughness={0.95} />
      </mesh>
      <group ref={door} position={[0, -0.65, 0.52]}>
        <RoundedBox args={[1.5, 1.3, 0.08]} radius={0.03} position={[0, 0.65, 0.04]} castShadow>
          <meshStandardMaterial color={LEATHER} roughness={0.7} />
        </RoundedBox>
        <mesh position={[0, 0.65, 0.085]}>
          <boxGeometry args={[1.3, 1.1, 0.01]} />
          <meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.4} />
        </mesh>
      </group>
      {/* Bellows and the lens board they carry */}
      {folds.map((k) => (
        <mesh
          key={k}
          ref={(el) => {
            bellows.current[k] = el;
          }}
          castShadow
        >
          <boxGeometry args={[1.25 - k * 0.06, 1.05 - k * 0.06, 0.12]} />
          <meshStandardMaterial color={k % 2 ? "#6b1d1d" : "#4a1414"} roughness={0.9} />
        </mesh>
      ))}
      <group ref={lens}>
        <mesh castShadow>
          <boxGeometry args={[1.0, 0.9, 0.08]} />
          <meshStandardMaterial color="#1f1a17" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.32, 0.2, 48]} />
          <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.02, 48]} />
          <meshStandardMaterial color="#0b1b33" metalness={0.3} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0, 0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.27, 0.03, 12, 48]} />
          <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

type PrintProps = {
  index: number;
  front: number;
  count: number;
  aspect: number;
  layout: Layout;
  timeRef: React.MutableRefObject<number>;
  lensWorld: React.MutableRefObject<THREE.Vector3>;
  emergeAt: number;
  onPick: (index: number) => void;
  map?: THREE.Texture;
};

// One print's resting place: the front one large and centred, the others
// as a row of small ones underneath.
function targetFor(index: number, front: number, count: number, layout: Layout) {
  if (index === front) {
    return { position: new THREE.Vector3(...layout.frontPos), scale: 1, rotZ: 0 };
  }
  const k = index < front ? index : index - 1;
  const x = layout.frontPos[0] + (k - (count - 2) / 2) * layout.thumbGap;
  return {
    position: new THREE.Vector3(x, layout.thumbY, layout.frontPos[2] + 0.2),
    scale: layout.thumbScale,
    rotZ: (((index * 37) % 11) - 5) * 0.03,
  };
}

function Print({ index, front, count, aspect, layout, timeRef, lensWorld, emergeAt, onPick, map }: PrintProps) {
  const group = useRef<THREE.Group>(null);
  const target = useMemo(() => targetFor(index, front, count, layout), [index, front, count, layout]);
  const h = PRINT_HEIGHT * layout.frontScale;
  const w = Math.min(Math.max(aspect, 0.6), 1.9) * h;
  const emerged = useRef(false);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const t = timeRef.current - (emergeAt + index * 0.35);
    if (t <= 0 && !emerged.current) {
      g.visible = false;
      g.position.copy(lensWorld.current);
      g.scale.setScalar(0.02);
      g.rotation.set(0, 0.85, 0);
      return;
    }
    emerged.current = true;
    g.visible = true;
    const k = 1 - Math.exp(-dt * 3.5);
    g.position.lerp(target.position, k);
    const s = THREE.MathUtils.lerp(g.scale.x, target.scale, k);
    g.scale.setScalar(s);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, target.rotZ, k);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, 0, k);
  });

  return (
    <group
      ref={group}
      visible={false}
      onClick={(e) => {
        e.stopPropagation();
        onPick(index);
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <mesh position={[0, -0.14, 0]} castShadow>
        <planeGeometry args={[w + 0.16, h + 0.44]} />
        <meshStandardMaterial color={PAPER} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[w, h]} />
        {map ? <meshBasicMaterial map={map} toneMapped={false} /> : <meshStandardMaterial color="#e8dcc4" roughness={1} />}
      </mesh>
    </group>
  );
}

// Loads the picture with the viewer's token, then hands the texture to Print.
function MediaPrint({ media, ...rest }: Omit<PrintProps, "aspect" | "map"> & { media: Media }) {
  const { url, failed } = useMediaUrl(media.mediaId);
  if (failed) return <Print {...rest} aspect={4 / 3} />;
  if (!url) return null;
  return media.type === "video" ? <VideoPrint url={url} {...rest} /> : <PhotoPrint url={url} {...rest} />;
}

function PhotoPrint({ url, ...rest }: Omit<PrintProps, "aspect" | "map"> & { url: string }) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 4 / 3;
  return <Print {...rest} aspect={aspect} map={texture} />;
}

function VideoPrint({ url, ...rest }: Omit<PrintProps, "aspect" | "map"> & { url: string }) {
  const texture = useVideoTexture(url, { muted: true, loop: true, start: true, playsInline: true });
  const video = texture.image as HTMLVideoElement;
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  return <Print {...rest} aspect={aspect} map={texture} />;
}
