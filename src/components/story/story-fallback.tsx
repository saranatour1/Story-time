import { useState } from "react";
import { AuthImage, AuthVideo } from "@/components/auth-image";
import type { Stop } from "@/lib/story-steps";
import { cn } from "@/lib/utils";

// The stop's pictures as a pile of prints, for browsers without WebGL and
// people who asked for less motion. Click a print to bring it to the front.
export function StopFallback({ stop }: { stop: Stop }) {
  const media = stop.blocks.filter((b) => b.type === "photo" || b.type === "video");
  const [front, setFront] = useState(0);

  if (media.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="aspect-[4/3] w-full max-w-sm rotate-[-2deg] rounded-sm bg-[#f3e9d6] p-3 pb-10 shadow-2xl">
          <div className="grid h-full place-items-center rounded-sm bg-[#e8dcc4] text-sm text-stone-500">No pictures at this stop</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 p-4" data-no-advance="">
      <div className="relative aspect-[4/3] w-full max-w-2xl">
        {media.map((b, i) => {
          const offset = i - front;
          const tilt = ((i * 37) % 11) - 5;
          return (
            <div
              key={i}
              aria-hidden={i !== front}
              className={cn(
                "absolute inset-0 rounded-sm bg-[#f3e9d6] p-2 pb-8 shadow-2xl transition-transform duration-700 ease-out",
                i === front ? "scale-100" : "scale-90",
              )}
              style={{
                transform: `translate(${offset * 4}%, ${Math.abs(offset) * 2}%) rotate(${i === front ? 0 : tilt}deg)`,
                zIndex: i === front ? 10 : media.length - Math.abs(offset),
              }}
            >
              <div className="h-full overflow-hidden rounded-sm bg-stone-800 [&>*]:h-full [&>*]:w-full [&>*]:rounded-none [&_img]:aspect-auto [&_img]:h-full [&_img]:object-cover [&_video]:aspect-auto [&_video]:h-full">
                {b.type === "video" ? (
                  <AuthVideo mediaId={b.mediaId} label={`Video ${i + 1}`} />
                ) : b.type === "photo" ? (
                  <AuthImage mediaId={b.mediaId} alt={`Picture ${i + 1}`} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {media.length > 1 && (
        <div className="flex items-center gap-2" role="group" aria-label="Pictures at this stop">
          {media.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show picture ${i + 1} of ${media.length}`}
              aria-pressed={i === front}
              onClick={() => setFront(i)}
              className={cn(
                "size-2.5 rounded-full transition-colors",
                i === front ? "bg-[#3f3a32]" : "bg-[#3f3a32]/25 hover:bg-[#3f3a32]/50",
              )}
            />
          ))}
          <span className="ml-2 text-xs text-[#7a7164]">
            {front + 1} / {media.length}
          </span>
        </div>
      )}
    </div>
  );
}
