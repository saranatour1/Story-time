import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowUpIcon,
  ArrowUpToLineIcon,
  BookOpenIcon,
  ClipboardPasteIcon,
  CopyIcon,
  CopyPlusIcon,
  FilePlusIcon,
  ImageDownIcon,
  ImagePlusIcon,
  LinkIcon,
  PencilIcon,
  LockIcon,
  PaletteIcon,
  PenLineIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScissorsIcon,
  SquareDashedIcon,
  StickerIcon,
  SunIcon,
  Trash2Icon,
  UnlockIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  DECOS,
  type JournalElement,
  NOTE_STYLES,
  PAPERS,
  PRINT_STYLES,
  TITLE_STYLES,
} from "../../../convex/lib/journal";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { type NewThing, WORDED } from "./add";
import { writable } from "./editor";
import { DECO_NAMES, NOTE_NAMES, PAPER_LOOKS, PRINT_NAMES, TITLE_NAMES } from "./look";

// What a right-click on a journal page offers: for the thing under the
// pointer, everything you can do to it; on bare paper, things to put right
// there and what you can do to the page.

export type Layer = "front" | "forward" | "backward" | "back";

export type MenuActions = {
  write: (e: JournalElement) => void;
  copy: (e: JournalElement) => void;
  cut: (e: JournalElement) => void;
  paste: () => void;
  duplicate: (e: JournalElement) => void;
  layer: (e: JournalElement, to: Layer) => void;
  change: (e: JournalElement, patch: Partial<JournalElement>) => void;
  sticker: (e: JournalElement) => void;
  remove: (e: JournalElement) => void;
  addHere: (thing: NewThing) => void;
  paper: (paper: string) => void;
  addPage: () => void;
  lockPage: () => void;
  savePicture: () => void;
  read: () => void;
  draw: () => void;
  picture: () => void;
  link: () => void;
};

const mod =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

const Styles = ({
  label,
  list,
  names,
  on,
  pick,
}: {
  label: string;
  list: readonly string[];
  names: Record<string, string>;
  on: string | undefined;
  pick: (s: string) => void;
}) => {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <PaletteIcon /> {label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="paper-scope">
        {list.map((s) => (
          <ContextMenuItem key={s} onSelect={() => pick(s)}>
            <span className="w-4">{on === s ? "✓" : ""}</span> {names[s] ?? s}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
};

const ThingMenu = ({
  e,
  can,
  act,
}: {
  e: JournalElement;
  can: { paste: boolean };
  act: MenuActions;
}) => {
  const locked = e.locked ?? false;
  let styles: ReactNode = null;
  if (e.kind === "title")
    styles = (
      <Styles
        label="Title style"
        list={TITLE_STYLES}
        names={TITLE_NAMES}
        on={e.style ?? "typewriter"}
        pick={(style) => act.change(e, { style })}
      />
    );
  else if (e.kind === "note")
    styles = (
      <Styles
        label="Note paper"
        list={NOTE_STYLES}
        names={NOTE_NAMES}
        on={e.style ?? "typed"}
        pick={(style) => act.change(e, { style })}
      />
    );
  else if (e.kind === "photo")
    styles = (
      <Styles
        label="Print"
        list={PRINT_STYLES}
        names={PRINT_NAMES}
        on={e.style ?? "polaroid"}
        pick={(style) => act.change(e, { style })}
      />
    );
  else if (e.kind === "deco" && e.style?.startsWith("tape")) {
    styles = (
      <Styles
        label="Tape"
        list={DECOS.filter((d) => d.startsWith("tape"))}
        names={DECO_NAMES}
        on={e.style}
        pick={(style) => act.change(e, { style })}
      />
    );
  } else if (e.kind === "deco" && e.style?.startsWith("circle")) {
    styles = (
      <Styles
        label="Colour"
        list={DECOS.filter((d) => d.startsWith("circle"))}
        names={DECO_NAMES}
        on={e.style}
        pick={(style) => act.change(e, { style })}
      />
    );
  }
  return (
    <>
      {writable(e) && (
        <ContextMenuItem disabled={locked} onSelect={() => act.write(e)}>
          <PenLineIcon /> {e.kind === "photo" ? "Write a caption" : "Write"}
          <ContextMenuShortcut>↵</ContextMenuShortcut>
        </ContextMenuItem>
      )}
      {styles}
      {(e.kind === "photo" || e.kind === "sticker") && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <SunIcon /> Tone
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="paper-scope">
            {(
              [
                [undefined, "Colour"],
                ["sepia", "Sepia"],
                ["mono", "Black & white"],
              ] as const
            ).map(([tone, label]) => (
              <ContextMenuItem key={label} onSelect={() => act.change(e, { tone })}>
                <span className="w-4">{e.tone === tone ? "✓" : ""}</span> {label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {e.kind === "photo" && (
        <ContextMenuItem onSelect={() => act.sticker(e)}>
          <StickerIcon /> Cut out a sticker
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={locked} onSelect={() => act.cut(e)}>
        <ScissorsIcon /> Cut
        <ContextMenuShortcut>{mod}X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => act.copy(e)}>
        <CopyIcon /> Copy
        <ContextMenuShortcut>{mod}C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!can.paste} onSelect={act.paste}>
        <ClipboardPasteIcon /> Paste
        <ContextMenuShortcut>{mod}V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => act.duplicate(e)}>
        <CopyPlusIcon /> Duplicate
        <ContextMenuShortcut>{mod}D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <SquareDashedIcon /> Order
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="paper-scope">
          <ContextMenuItem onSelect={() => act.layer(e, "front")}>
            <ArrowUpToLineIcon /> Bring to the front
            <ContextMenuShortcut>]</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => act.layer(e, "forward")}>
            <ArrowUpIcon /> Bring forward
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => act.layer(e, "backward")}>
            <ArrowDownIcon /> Send backward
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => act.layer(e, "back")}>
            <ArrowDownToLineIcon /> Send to the back
            <ContextMenuShortcut>[</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={locked}>
          <RotateCwIcon /> Turn
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="paper-scope">
          <ContextMenuItem onSelect={() => act.change(e, { rotation: 0 })}>
            Straighten
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => act.change(e, { rotation: (e.rotation - 5) % 360 })}>
            <RotateCcwIcon /> Tip left
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => act.change(e, { rotation: (e.rotation + 5) % 360 })}>
            <RotateCwIcon /> Tip right
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => act.change(e, { rotation: (e.rotation + 90) % 360 })}>
            A quarter turn
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onSelect={() => act.change(e, { locked: locked ? undefined : true })}>
        {locked ? <UnlockIcon /> : <LockIcon />} {locked ? "Unlock it" : "Lock it in place"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => act.remove(e)}>
        <Trash2Icon /> Delete
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
};

const QUICK: Array<{ label: string; thing: NewThing }> = [
  { label: "A title", thing: { kind: "title", style: "typewriter", text: "Our trip", w: 0, h: 0 } },
  { label: "A typed note", thing: { kind: "note", style: "typed", text: "", w: 0, h: 0 } },
  { label: "A handwritten note", thing: { kind: "note", style: "hand", text: "", w: 0, h: 0 } },
  { label: "A label", thing: { kind: "title", style: "label", text: "Hello", w: 0, h: 0 } },
  {
    label: "A rubber stamp",
    thing: { kind: "title", style: "stamp", text: "Approved", w: 0, h: 0 },
  },
];

const PaperMenu = ({
  paper,
  locked,
  can,
  act,
}: {
  paper: string;
  locked: boolean;
  can: { paste: boolean };
  act: MenuActions;
}) => {
  return (
    <>
      {!locked && (
        <>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <PlusIcon /> Add here
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="paper-scope">
              {QUICK.map((q) => (
                <ContextMenuItem key={q.label} onSelect={() => act.addHere(q.thing)}>
                  {q.label}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={act.picture}>
                <ImagePlusIcon /> A picture from your device…
              </ContextMenuItem>
              <ContextMenuItem onSelect={act.link}>
                <LinkIcon /> A link…
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <StickerIcon /> A sticker here
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="paper-scope max-h-80">
              {DECOS.map((d) => (
                <ContextMenuItem
                  key={d}
                  onSelect={() =>
                    act.addHere({ kind: "deco", style: d, text: WORDED[d], w: 0, h: 0 })
                  }
                >
                  {DECO_NAMES[d] ?? d}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onSelect={act.draw}>
            <PencilIcon /> Draw
          </ContextMenuItem>
          <ContextMenuItem disabled={!can.paste} onSelect={act.paste}>
            <ClipboardPasteIcon /> Paste here
            <ContextMenuShortcut>{mod}V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <PaletteIcon /> Paper
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="paper-scope">
              {PAPERS.map((p) => (
                <ContextMenuItem key={p} onSelect={() => act.paper(p)}>
                  <span
                    className="size-3.5 rounded-sm border border-stone-400/60"
                    style={{ background: PAPER_LOOKS[p]!.color }}
                  />
                  {PAPER_LOOKS[p]!.name}
                  {paper === p && <ContextMenuShortcut>✓</ContextMenuShortcut>}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={act.addPage}>
            <FilePlusIcon /> Add a page after this one
          </ContextMenuItem>
        </>
      )}
      <ContextMenuItem onSelect={act.lockPage}>
        {locked ? <UnlockIcon /> : <LockIcon />} {locked ? "Unlock this page" : "Lock this page"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={act.savePicture}>
        <ImageDownIcon /> Save this page as a picture
      </ContextMenuItem>
      <ContextMenuItem onSelect={act.read}>
        <BookOpenIcon /> Read the journal
      </ContextMenuItem>
    </>
  );
};

export const JournalMenu = ({
  e,
  paper,
  pageLocked,
  can,
  act,
}: {
  // The thing that was right-clicked, or none for bare paper.
  e: JournalElement | undefined;
  paper: string;
  pageLocked: boolean;
  can: { paste: boolean; edit: boolean };
  act: MenuActions;
}) => {
  return (
    <ContextMenuContent className="paper-scope w-60">
      {can.edit && e && !pageLocked ? (
        <>
          <ContextMenuLabel>
            {e.kind === "deco"
              ? (DECO_NAMES[e.style ?? ""] ?? "Decoration")
              : e.kind[0]!.toUpperCase() + e.kind.slice(1)}
          </ContextMenuLabel>
          <ThingMenu e={e} can={can} act={act} />
        </>
      ) : can.edit ? (
        <PaperMenu paper={paper} locked={pageLocked} can={can} act={act} />
      ) : (
        <>
          <ContextMenuItem onSelect={act.savePicture}>
            <ImageDownIcon /> Save this page as a picture
          </ContextMenuItem>
          <ContextMenuItem onSelect={act.read}>
            <BookOpenIcon /> Read the journal
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );
};
