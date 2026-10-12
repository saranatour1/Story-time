import { ArrowDownToLineIcon, ArrowUpToLineIcon, CopyIcon, ScissorsIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FRAME_LOOKS, LETTERS, PAPERS, PRINTS, TAPES } from "@/lib/canvas/look";
import type { Arrangement } from "@/lib/canvas/layout";
import type { Node } from "@/lib/canvas/model";
import { cn } from "@/lib/utils";
import type { Update } from "./use-canvas";

// What you can change about whatever is selected. Words are saved when you
// leave the box, so a sentence is one undo, not one per letter.

type Props = {
  nodes: Node[];
  // Whether the frame is in the flow, and where among the frames in it.
  flow: { place: number | undefined; count: number };
  // Bumps when something new that wants words was added, to put the cursor there.
  focusWords: number;
  onChange: (updates: Update[]) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onRestack: (to: "front" | "back") => void;
  onBreakApart: () => void;
  onFlow: (id: Node["_id"], action: "add" | "remove" | "earlier" | "later") => void;
  onZoomTo: (id: Node["_id"]) => void;
  // How many moments and photos a selected frame has to arrange, and the arranging.
  arrangeable: number;
  onArrange: (mode: Arrangement) => void;
};

const ARRANGEMENTS: Array<{ id: Arrangement; name: string; hint: string }> = [
  { id: "grid", name: "Grid", hint: "Lay them out square, in rows" },
  { id: "scrapbook", name: "Scrapbook", hint: "Lay them out a little tipped" },
  { id: "strip", name: "Strip", hint: "Lay them out in one row" },
];
const TURNS = new Set<Node["kind"]>(["moment", "photo", "scrap", "tape", "letter"]);
const NAMES: Record<Node["kind"], string> = {
  frame: "Frame",
  moment: "Moment",
  photo: "Photo",
  scrap: "Paper",
  ransom: "Title",
  letter: "Letter",
  tape: "Tape",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[11px] tracking-[0.12em] text-stone-500 uppercase">{label}</div>
      {children}
    </div>
  );
}

function Swatch({ on, color, label, onClick, children }: { on: boolean; color: string; label: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn("grid size-7 place-items-center rounded-md border text-[11px] shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none", on ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-300")}
      style={{ background: color }}
    >
      {children}
    </button>
  );
}

// Text that is saved when you leave it, and starts over for each selection.
function Words({ value, focus, rows, max, onSave, label }: { value: string; focus: number; rows?: number; max: number; onSave: (text: string) => void; label: string }) {
  const [text, setText] = useState(value);
  const box = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (focus > 0) box.current?.focus();
  }, [focus]);
  const save = () => {
    if (text !== value) onSave(text);
  };
  const shared = {
    value: text,
    maxLength: max,
    "aria-label": label,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: save,
    className: "w-full rounded-md border border-stone-300 bg-white/80 px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
  };
  return rows === undefined ? (
    <input ref={box as React.RefObject<HTMLInputElement>} {...shared} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
  ) : (
    <textarea ref={box as React.RefObject<HTMLTextAreaElement>} rows={rows} {...shared} style={{ fontFamily: "var(--font-hand)", fontSize: 18 }} />
  );
}

export function Inspector({ nodes, flow, focusWords, onChange, onRemove, onDuplicate, onRestack, onBreakApart, onFlow, onZoomTo, arrangeable, onArrange }: Props) {
  if (nodes.length === 0) return null;
  const one = nodes.length === 1 ? nodes[0]! : undefined;

  return (
    <aside aria-label="Selected" className="absolute right-3 bottom-14 z-10 max-h-[calc(100%-5rem)] w-60 space-y-3 overflow-y-auto rounded-xl border border-stone-300 bg-[#f6f1e6]/95 p-3 text-stone-900 shadow-lg backdrop-blur md:top-3 md:bottom-auto">
      <div className="font-mono text-xs tracking-[0.12em] uppercase">{one ? NAMES[one.kind] : `${nodes.length} selected`}</div>

      {one?.kind === "frame" && (
        <>
          <Row label="Name">
            <Words label="Frame name" value={one.text ?? ""} focus={0} max={60} onSave={(text) => onChange([{ id: one._id, text }])} />
          </Row>
          <Row label="Theme">
            <div className="flex flex-wrap gap-1.5">
              {FRAME_LOOKS.map((l) => (
                <Swatch key={l.id} on={(one.look ?? "cream") === l.id} color={l.page} label={l.name} onClick={() => onChange([{ id: one._id, look: l.id }])} />
              ))}
            </div>
          </Row>
          <Row label="In the flow">
            {flow.place === undefined ? (
              <Button size="sm" variant="outline" onClick={() => onFlow(one._id, "add")}>Add to the flow</Button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="mr-1 text-sm">{flow.place + 1} of {flow.count}</span>
                <Button size="icon-sm" variant="outline" aria-label="Play it earlier" disabled={flow.place === 0} onClick={() => onFlow(one._id, "earlier")}>↑</Button>
                <Button size="icon-sm" variant="outline" aria-label="Play it later" disabled={flow.place === flow.count - 1} onClick={() => onFlow(one._id, "later")}>↓</Button>
                <Button size="sm" variant="ghost" onClick={() => onFlow(one._id, "remove")}>Take out</Button>
              </div>
            )}
          </Row>
          {arrangeable > 1 && (
            <Row label="Arrange">
              <div className="flex flex-wrap gap-1">
                {ARRANGEMENTS.map((a) => (
                  <Button key={a.id} size="sm" variant="outline" title={a.hint} onClick={() => onArrange(a.id)}>{a.name}</Button>
                ))}
              </div>
            </Row>
          )}
          <Button size="sm" variant="outline" onClick={() => onZoomTo(one._id)}>Zoom to it</Button>
        </>
      )}

      {one?.kind === "scrap" && (
        <>
          <Row label="Words">
            <Words label="Words on the paper" value={one.text ?? ""} focus={focusWords} rows={4} max={400} onSave={(text) => text.trim() !== "" && onChange([{ id: one._id, text }])} />
          </Row>
          <Row label="Paper">
            <div className="flex flex-wrap gap-1.5">
              {PAPERS.map((p) => (
                <Swatch key={p.id} on={(one.look ?? "paper") === p.id} color={p.page} label={p.name} onClick={() => onChange([{ id: one._id, look: p.id }])} />
              ))}
            </div>
          </Row>
        </>
      )}

      {one?.kind === "photo" && (
        <Row label="Print">
          <div className="flex flex-wrap gap-1">
            {PRINTS.map((p) => (
              <Button key={p.id} size="sm" variant={(one.look ?? "print") === p.id ? "default" : "outline"} onClick={() => onChange([{ id: one._id, look: p.id }])}>{p.name}</Button>
            ))}
          </div>
        </Row>
      )}

      {one?.kind === "tape" && (
        <Row label="Tape">
          <div className="flex flex-wrap gap-1.5">
            {TAPES.map((t) => (
              <Swatch key={t.id} on={(one.look ?? "tape") === t.id} color={t.color} label={t.name} onClick={() => onChange([{ id: one._id, look: t.id }])} />
            ))}
          </div>
        </Row>
      )}

      {one?.kind === "letter" && (
        <>
          <Row label="Letter">
            <Words label="The letter" value={one.text ?? ""} focus={0} max={1} onSave={(text) => text.trim() !== "" && onChange([{ id: one._id, text: text.trim() }])} />
          </Row>
          <Row label="Cut from">
            <div className="flex flex-wrap gap-1.5">
              {LETTERS.map((l) => (
                <Swatch key={l.id} on={(one.look ?? "paper") === l.id} color={l.bg} label={l.id} onClick={() => onChange([{ id: one._id, look: l.id }])}>
                  <span style={{ color: l.fg, fontFamily: l.font, fontWeight: l.weight }}>A</span>
                </Swatch>
              ))}
            </div>
          </Row>
        </>
      )}

      {one?.kind === "ransom" && <p className="text-xs text-stone-600">Double-click to go inside and change one letter at a time. Escape to come back out.</p>}

      {one?.kind === "moment" && (
        <Button size="sm" variant="outline" onClick={onBreakApart}>
          <ScissorsIcon aria-hidden /> Break apart
        </Button>
      )}

      {one !== undefined && TURNS.has(one.kind) && (
        <Row label={`Turn · ${Math.round(one.rotation)}°`}>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={Math.round(one.rotation)}
            aria-label="Turn"
            className="w-full"
            onChange={(e) => onChange([{ id: one._id, rotation: Number(e.target.value) }])}
          />
        </Row>
      )}

      <div className="flex flex-wrap gap-1 border-t border-stone-300 pt-2">
        <Button size="icon-sm" variant="outline" aria-label="Bring to the front" title="Bring to the front" onClick={() => onRestack("front")}><ArrowUpToLineIcon aria-hidden /></Button>
        <Button size="icon-sm" variant="outline" aria-label="Send to the back" title="Send to the back" onClick={() => onRestack("back")}><ArrowDownToLineIcon aria-hidden /></Button>
        <Button size="icon-sm" variant="outline" aria-label="Duplicate" title="Duplicate" onClick={onDuplicate}><CopyIcon aria-hidden /></Button>
        <Button size="icon-sm" variant="outline" aria-label="Delete" title="Delete" onClick={onRemove} className="ml-auto text-destructive"><Trash2Icon aria-hidden /></Button>
      </div>
    </aside>
  );
}
