import { Environment, Lightformer, RoundedBox, useTexture, useVideoTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Stop } from "@/lib/story-steps";
import { useMediaUrl } from "@/lib/use-media-url";

type Media = Extract<Stop["blocks"][number], { type: "photo" | "video" }>;

// How long each picture stays on the ground glass before the next.
const PICTURE_MS = 2200;

// A silver camera seen from above, its viewfinder hood popping open on the
// stop's pictures, one after another. Click the camera for the next picture;
// click empty space to move the story on (left third goes back).
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
      dpr={[1, 2]}
      camera={{ position: [0, 0, 12], fov: 24 }}
      gl={{ alpha: true, antialias: true }}
      onPointerMissed={(e) => {
        const el = e.target as HTMLElement;
        const { left, width } = el.getBoundingClientRect();
        if (e.clientX - left < width / 3) onBack();
        else onNext();
      }}
      style={{ touchAction: "pan-y" }}
    >
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 5, 6]} intensity={1.6} />
      <pointLight position={[-4, 2.5, 3]} intensity={10} color="#ffd9a0" />
      {/* A studio of soft lights for the chrome to reflect; drawn here, not downloaded. */}
      <Environment resolution={256}>
        <Lightformer intensity={1.2} position={[0, 0, 9]} scale={[24, 14, 1]} />
        <Lightformer intensity={2.5} position={[0, 4, 6]} scale={[12, 3, 1]} />
        <Lightformer intensity={1.5} color="#ffd9a0" position={[-7, 0, 2]} scale={[8, 14, 1]} />
        <Lightformer intensity={1} position={[7, 0, 2]} scale={[8, 14, 1]} />
        <Lightformer form="ring" intensity={2} position={[2.5, 3, 5]} scale={1.2} />
      </Environment>
      <Scene media={media} opening={opening} />
    </Canvas>
  );
}

function Scene({ media, opening }: { media: Media[]; opening: boolean }) {
  const viewport = useThree((s) => s.viewport);
  // The camera's footprint on screen, its top plate nearer the viewer than
  // the origin, is about 3.9 wide by 2.6 tall.
  const scale = Math.min((viewport.width * 0.94) / 3.9, (viewport.height * 0.94) / 2.6);
  const [shown, setShown] = useState(0);
  const glass = useRef<THREE.Mesh>(null);
  // When the ground glass last changed picture, so it can fade in.
  const swapAt = useRef(0);

  useEffect(() => {
    setShown(0);
    if (media.length < 2) return;
    const t = setInterval(() => setShown((i) => (i + 1) % media.length), PICTURE_MS);
    return () => clearInterval(t);
  }, [media]);

  return (
    <>
      <TopCamera
        scale={scale}
        opening={opening}
        glass={glass}
        swapAt={swapAt}
        onClick={media.length > 1 ? () => setShown((i) => (i + 1) % media.length) : undefined}
      />
      {media.map((m, i) => (
        <Suspense key={m.mediaId} fallback={null}>
          <MediaPicture media={m} index={i} shown={shown} glass={glass} swapAt={swapAt} />
        </Suspense>
      ))}
    </>
  );
}

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (g) draw(g);
  const t = new THREE.CanvasTexture(canvas);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Text around a cylinder: the side's texture runs right to left and upside
// down as the camera is turned, so it's spun half a turn to read.
function bandTexture(bg: string, fg: string, marks: string[]) {
  const t = canvasTexture(1024, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 64);
    g.fillStyle = fg;
    g.font = "bold 26px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    marks.forEach((m, i) => g.fillText(m, 512 + (i - (marks.length - 1) / 2) * 44, 30));
  });
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI;
  return t;
}

const SPEEDS: Array<[string, string]> = [
  ["B", "#facc15"],
  ["1", "#facc15"],
  ["2", "#facc15"],
  ["4", "#facc15"],
  ["8", "#facc15"],
  ["15", "#f5f5f4"],
  ["30", "#ef4444"],
  ["60", "#f5f5f4"],
  ["125", "#f5f5f4"],
  ["250", "#f5f5f4"],
  ["500", "#60a5fa"],
  ["1000", "#f5f5f4"],
];

// Everything the camera is made of: brushed and knurled chrome, black
// leatherette, a printed shutter dial, lens scales and coated glass.
function useCameraLook() {
  const look = useMemo(() => {
    const brushed = canvasTexture(
      512,
      512,
      (g) => {
        g.fillStyle = "#5a5a5a";
        g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 900; i++) {
          const v = 70 + Math.floor(Math.random() * 40);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 200, 1);
        }
      },
      false,
    );
    const knurl = canvasTexture(
      512,
      8,
      (g) => {
        for (let i = 0; i < 128; i++) {
          g.fillStyle = i % 2 ? "#fff" : "#000";
          g.fillRect(i * 4, 0, 4, 8);
        }
      },
      false,
    );
    const leather = canvasTexture(
      256,
      256,
      (g) => {
        g.fillStyle = "#808080";
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 2600; i++) {
          const v = Math.floor(Math.random() * 255);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.beginPath();
          g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 0, Math.PI * 2);
          g.fill();
        }
      },
      false,
    );
    for (const t of [brushed, knurl, leather]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    leather.repeat.set(6, 2);

    const dial = canvasTexture(256, 256, (g) => {
      g.fillStyle = "#121212";
      g.fillRect(0, 0, 256, 256);
      g.font = "bold 17px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      SPEEDS.forEach(([label, color], i) => {
        g.save();
        g.translate(128, 128);
        g.rotate((i / SPEEDS.length) * Math.PI * 2);
        g.fillStyle = color;
        g.fillText(label, 0, -84);
        g.fillRect(-1, -110, 2, 10);
        g.restore();
      });
    });
    const counter = canvasTexture(64, 64, (g) => {
      g.fillStyle = "#101010";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#f5f5f4";
      g.font = "bold 30px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("7", 32, 34);
    });
    const engraving = canvasTexture(512, 128, (g) => {
      g.textBaseline = "middle";
      g.font = "600 52px ui-sans-serif, system-ui, sans-serif";
      // A light edge under dark letters reads as cut into the metal.
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.fillText("STORY·TIME", 10, 50);
      g.fillStyle = "#2a2a2a";
      g.fillText("STORY·TIME", 8, 48);
      g.font = "500 28px ui-sans-serif, system-ui, sans-serif";
      g.fillText("6×6   No 104772", 10, 104);
    });
    const aperture = bandTexture("#c8cacc", "#111", ["22", "16", "11", "8", "5.6", "4", "2.8"]);
    const distance = bandTexture("#121212", "#f5f5f4", ["∞", "10", "5", "3", "2", "1.5", "1.2", "1", "m"]);

    const textures = [brushed, knurl, leather, dial, counter, engraving, aperture, distance];
    const materials = {
      chrome: new THREE.MeshStandardMaterial({ color: "#eceef0", metalness: 0.95, roughness: 1, roughnessMap: brushed }),
      knurled: new THREE.MeshStandardMaterial({ color: "#e4e6e8", metalness: 0.7, roughness: 0.4, bumpMap: knurl, bumpScale: 0.6 }),
      grip: new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.75, bumpMap: knurl, bumpScale: 6 }),
      leather: new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.9, bumpMap: leather, bumpScale: 2 }),
      black: new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.45, metalness: 0.2 }),
      matte: new THREE.MeshStandardMaterial({ color: "#121212", roughness: 0.95 }),
      dial: new THREE.MeshStandardMaterial({ map: dial, roughness: 0.4 }),
      counter: new THREE.MeshStandardMaterial({ map: counter, roughness: 0.3 }),
      engraving: new THREE.MeshStandardMaterial({ map: engraving, transparent: true, metalness: 0.5, roughness: 0.5 }),
      aperture: new THREE.MeshStandardMaterial({ map: aperture, metalness: 0.9, roughness: 0.35 }),
      distance: new THREE.MeshStandardMaterial({ map: distance, roughness: 0.5 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#121a2c", metalness: 0.3, roughness: 0.05, clearcoat: 1 }),
      coating: new THREE.MeshBasicMaterial({ color: "#7c4dbb", transparent: true, opacity: 0.35 }),
      red: new THREE.MeshStandardMaterial({ color: "#dc2626", roughness: 0.4 }),
    };
    return { textures, materials };
  }, []);

  useEffect(
    () => () => {
      for (const t of look.textures) t.dispose();
      for (const m of Object.values(look.materials)) m.dispose();
    },
    [look],
  );
  return look.materials;
}

// The waist-level finder's hood: four flaps hinged around the ground glass,
// the back lid lifting first. `sign` folds each one in over the glass.
const HOOD = 1.45;
const FLAPS = [
  { at: [0, HOOD / 2], axis: "x", sign: -1, size: [HOOD, 0.5, 0.03] },
  { at: [-HOOD / 2, 0], axis: "z", sign: -1, size: [0.03, 0.42, HOOD] },
  { at: [HOOD / 2, 0], axis: "z", sign: 1, size: [0.03, 0.42, HOOD] },
  { at: [0, -HOOD / 2], axis: "x", sign: 1, size: [HOOD, 0.36, 0.03] },
] as const;

// The top plate's surface, and the finder's rim above it.
const TOP = 0.77;
const RIM = TOP + 0.17;

const SCREWS = [
  [-1.58, 0.62],
  [-0.98, 0.66],
  [1.62, -0.25],
  [-1.6, -0.3],
] as const;

// A silver medium-format camera, modelled with its top up and its lens along
// -z, then turned so the viewer looks down on it the way you'd hold one at
// the waist: lens pointing away, ground glass facing up.
function TopCamera({
  scale,
  opening,
  glass,
  swapAt,
  onClick,
}: {
  scale: number;
  opening: boolean;
  glass: React.RefObject<THREE.Mesh | null>;
  swapAt: React.RefObject<number>;
  onClick?: () => void;
}) {
  const look = useCameraLook();
  const body = useRef<THREE.Group>(null);
  const flaps = useRef<Array<THREE.Group | null>>([]);
  const start = useRef<number | null>(null);
  const opened = useRef(!opening);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (start.current === null) start.current = now;
    let open = 1;
    if (!opened.current) {
      open = smooth((now - start.current - 0.3) / 1.2);
      if (open >= 1) opened.current = true;
    }
    FLAPS.forEach((f, k) => {
      const g = flaps.current[k];
      if (g) g.rotation[f.axis] = f.sign * 1.5 * (1 - smooth((open - k * 0.15) / 0.55));
    });
    // The ground glass lights up as the hood opens and fades each new
    // picture in; with no picture it stays dark.
    const m = glass.current?.material;
    if (m instanceof THREE.MeshBasicMaterial) {
      m.color.setScalar(m.map ? open * smooth((performance.now() - swapAt.current) / 350) : 0.02);
    }
    if (body.current) {
      body.current.position.y = -0.32 * scale + Math.sin(now * 0.8) * 0.015;
    }
  });

  // Cylinders take [side, top, bottom] materials.
  const along = [Math.PI / 2, 0, 0] as const;
  const facingLens = [0, Math.PI, 0] as const;

  return (
    <group
      ref={body}
      scale={scale}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={() => {
        if (onClick) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <group rotation={[Math.PI / 2 + 0.06, 0, 0]}>
        {/* Body, top plate and leatherette */}
        <RoundedBox args={[3.4, 1.4, 1.6]} radius={0.2} smoothness={4} material={look.chrome} />
        <RoundedBox args={[3.34, 0.1, 1.56]} radius={0.04} smoothness={3} position={[0, TOP - 0.05, 0]} material={look.chrome} />
        {[-0.801, 0.801].map((z) => (
          <mesh key={z} position={[0, -0.12, z]} material={look.leather}>
            <boxGeometry args={[2.9, 0.86, 0.02]} />
          </mesh>
        ))}
        {[-1.72, 1.72].map((x) => (
          <mesh key={x} position={[x, 0.25, 0]} rotation={[0, Math.PI / 2, 0]} material={look.chrome}>
            <torusGeometry args={[0.11, 0.035, 12, 24]} />
          </mesh>
        ))}
        {SCREWS.map(([x, z]) => (
          <group key={`${x},${z}`} position={[x, TOP, z]}>
            <mesh material={look.knurled}>
              <cylinderGeometry args={[0.04, 0.04, 0.02, 16]} />
            </mesh>
            <mesh position={[0, 0.011, 0]} material={look.black}>
              <boxGeometry args={[0.06, 0.004, 0.012]} />
            </mesh>
          </group>
        ))}
        <mesh position={[-1.2, TOP + 0.002, -0.56]} rotation={[-Math.PI / 2, 0, 0]} material={look.engraving}>
          <planeGeometry args={[0.8, 0.2]} />
        </mesh>

        {/* The lens, pointing away along -z: mount, aperture ring, focus
            grip, distance scale, front ring and coated glass */}
        <mesh position={[0, 0, -0.85]} rotation={along} material={look.chrome}>
          <cylinderGeometry args={[0.6, 0.6, 0.1, 64]} />
        </mesh>
        <mesh position={[0, 0, -0.96]} rotation={along} material={[look.aperture, look.chrome, look.chrome]}>
          <cylinderGeometry args={[0.565, 0.565, 0.12, 64]} />
        </mesh>
        <mesh position={[0, 0, -1.15]} rotation={along} material={[look.grip, look.black, look.black]}>
          <cylinderGeometry args={[0.585, 0.585, 0.26, 64]} />
        </mesh>
        <mesh position={[0, 0, -1.325]} rotation={along} material={[look.distance, look.black, look.black]}>
          <cylinderGeometry args={[0.55, 0.55, 0.09, 64]} />
        </mesh>
        <mesh position={[0, 0, -1.405]} rotation={along} material={look.knurled}>
          <cylinderGeometry args={[0.535, 0.535, 0.07, 64]} />
        </mesh>
        <mesh position={[0, 0, -1.441]} rotation={facingLens} material={look.black}>
          <ringGeometry args={[0.38, 0.535, 64]} />
        </mesh>
        <mesh position={[0, 0, -1.442]} material={look.chrome}>
          <torusGeometry args={[0.38, 0.01, 8, 64]} />
        </mesh>
        <mesh position={[0, 0, -1.425]} rotation={facingLens} material={look.glass}>
          <circleGeometry args={[0.38, 64]} />
        </mesh>
        <mesh position={[0, 0, -1.426]} rotation={facingLens} material={look.coating}>
          <ringGeometry args={[0.16, 0.24, 48]} />
        </mesh>

        {/* The waist-level finder: chrome trim, the ground glass showing the
            pictures, and the hood's flaps on chrome hinge pins */}
        <mesh position={[0, TOP + 0.025, 0]} material={look.chrome}>
          <boxGeometry args={[HOOD + 0.16, 0.05, HOOD + 0.16]} />
        </mesh>
        <mesh position={[0, TOP + 0.11, 0]} material={look.black}>
          <boxGeometry args={[HOOD + 0.1, 0.12, HOOD + 0.1]} />
        </mesh>
        <mesh ref={glass} position={[0, RIM + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[HOOD - 0.08, HOOD - 0.08]} />
          <meshBasicMaterial color="#000" toneMapped={false} />
        </mesh>
        {FLAPS.map((f, k) => (
          <group key={k}>
            <mesh
              position={[f.at[0], RIM, f.at[1]]}
              rotation={f.axis === "x" ? [0, 0, Math.PI / 2] : along}
              material={look.chrome}
            >
              <cylinderGeometry args={[0.022, 0.022, HOOD, 12]} />
            </mesh>
            <group
              ref={(el) => {
                flaps.current[k] = el;
              }}
              position={[f.at[0], RIM, f.at[1]]}
            >
              <mesh position={[0, f.size[1] / 2, 0]} material={look.matte}>
                <boxGeometry args={f.size} />
              </mesh>
            </group>
          </group>
        ))}

        {/* Rewind knob with its fold-out crank, on the left */}
        <mesh position={[-1.22, TOP + 0.08, 0.1]} material={[look.knurled, look.chrome, look.chrome]}>
          <cylinderGeometry args={[0.36, 0.36, 0.16, 64]} />
        </mesh>
        <mesh position={[-1.22, TOP + 0.21, 0.1]} material={[look.knurled, look.chrome, look.chrome]}>
          <cylinderGeometry args={[0.24, 0.26, 0.1, 48]} />
        </mesh>
        <mesh position={[-1.1, TOP + 0.275, 0.1]} material={look.black}>
          <boxGeometry args={[0.3, 0.03, 0.08]} />
        </mesh>
        <mesh position={[-0.97, TOP + 0.32, 0.1]} material={look.black}>
          <cylinderGeometry args={[0.035, 0.035, 0.1, 12]} />
        </mesh>

        {/* Shutter speed dial and its index mark, release button, advance
            lever and frame counter, on the right */}
        <mesh position={[1.15, TOP + 0.06, -0.15]} rotation={[0, Math.PI / 2, 0]} material={[look.knurled, look.dial, look.chrome]}>
          <cylinderGeometry args={[0.36, 0.36, 0.12, 64]} />
        </mesh>
        <mesh position={[1.15, TOP + 0.14, -0.15]} material={look.chrome}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 24]} />
        </mesh>
        <mesh position={[1.15, TOP + 0.005, -0.56]} material={look.red}>
          <cylinderGeometry args={[0.025, 0.025, 0.01, 12]} />
        </mesh>
        <mesh position={[1.5, TOP + 0.04, 0.3]} material={[look.knurled, look.chrome, look.chrome]}>
          <cylinderGeometry args={[0.13, 0.13, 0.08, 32]} />
        </mesh>
        <mesh position={[1.5, TOP + 0.1, 0.3]} material={look.chrome}>
          <cylinderGeometry args={[0.085, 0.085, 0.12, 32]} />
        </mesh>
        <mesh position={[1.42, TOP + 0.025, 0.58]} material={look.chrome}>
          <cylinderGeometry args={[0.14, 0.14, 0.05, 32]} />
        </mesh>
        <RoundedBox
          args={[0.5, 0.04, 0.13]}
          radius={0.018}
          position={[1.17, TOP + 0.065, 0.6]}
          rotation={[0, 0.15, 0]}
          material={look.chrome}
        />
        <mesh position={[0.92, TOP + 0.09, 0.64]} material={look.black}>
          <cylinderGeometry args={[0.065, 0.065, 0.1, 24]} />
        </mesh>
        <mesh position={[1.5, TOP + 0.015, -0.6]} rotation={[0, Math.PI / 2, 0]} material={[look.chrome, look.counter, look.chrome]}>
          <cylinderGeometry args={[0.11, 0.11, 0.03, 32]} />
        </mesh>
      </group>
    </group>
  );
}

type PictureProps = {
  index: number;
  shown: number;
  glass: React.RefObject<THREE.Mesh | null>;
  swapAt: React.RefObject<number>;
};

// Puts this picture on the ground glass while it's the one shown, cropped to
// fill the square glass.
function Picture({ index, shown, glass, swapAt, map, aspect }: PictureProps & { map: THREE.Texture; aspect: number }) {
  useEffect(() => {
    const m = glass.current?.material;
    if (index !== shown || !(m instanceof THREE.MeshBasicMaterial)) return;
    map.repeat.set(Math.min(1, 1 / aspect), Math.min(1, aspect));
    map.offset.set((1 - map.repeat.x) / 2, (1 - map.repeat.y) / 2);
    m.map = map;
    m.needsUpdate = true;
    swapAt.current = performance.now();
  }, [index, shown, glass, swapAt, map, aspect]);
  return null;
}

// Loads the picture with the viewer's token, then hands the texture on.
function MediaPicture({ media, ...rest }: PictureProps & { media: Media }) {
  const { url } = useMediaUrl(media.mediaId);
  if (!url) return null;
  return media.type === "video" ? <VideoPicture url={url} {...rest} /> : <PhotoPicture url={url} {...rest} />;
}

function PhotoPicture({ url, ...rest }: PictureProps & { url: string }) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 4 / 3;
  return <Picture {...rest} map={texture} aspect={aspect} />;
}

function VideoPicture({ url, ...rest }: PictureProps & { url: string }) {
  const texture = useVideoTexture(url, { muted: true, loop: true, start: true, playsInline: true });
  const video = texture.image as HTMLVideoElement;
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  return <Picture {...rest} map={texture} aspect={aspect} />;
}
