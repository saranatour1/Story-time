# The collage canvas

A second way to see and edit an experience: one infinite canvas of frames and
pieces, laid over the same moments and photos. The itinerary stays as it is.
The canvas is a tab beside it.

## What is on it

Things nest, so editing can go from a whole page down to one letter.

| Level | Kinds | Notes |
| --- | --- | --- |
| Frame | `frame` | A page with a theme (peach, cream, slate, sky, kraft, plum). Has a name and a place in the flow. Never turned. |
| Piece | `moment`, `photo`, `scrap`, `tape`, `ransom` | Lie on a frame or loose on the desk. A `moment` piece draws a moment as a scrapbook page and follows it when the moment is edited. A `photo` points at one photo. |
| Atom | `letter` | One letter cut from a magazine, inside a `ransom` title. Each can be moved, turned, recoloured or rewritten alone. |

A child's position is inside its parent, so moving a frame moves what is on it.
Frames and titles never turn, which keeps the maths for placing children a plain
offset.

## Editing

- Press to select, drag to move. Dropping on a frame puts the piece in it,
  dropping on the desk takes it out. Handles size and turn (Shift snaps turns to
  15 degrees). Shift-click adds to the selection.
- A frame is a page, not a group: pressing a piece on it picks the piece. A title
  is a group: double-click goes inside it to its letters, Escape comes back out.
- Double-click a frame to zoom to it. Arrow keys nudge (Shift for 10), `[` and
  `]` restack, Delete removes, ⌘D duplicates, ⌘Z and ⇧⌘Z undo and redo.
- Pan by dragging the desk, scrolling, or holding Space. Zoom with ⌘/Ctrl+scroll
  or a pinch.
- Every edit is one thing: a drag writes the moved pieces and nothing else, and
  shows at once while it saves.

## The flow

Frames with a place in the flow play in order. The camera backs out of one frame
and into the next, and the desk takes the colour of the frame it is in. Anyone who
can see the experience can play it.

## Pages made for you

Every moment lands on the canvas on its own: the canvas asks for the moments
made since it was last filled (`get` returns them as `pending`, owner only), the
page groups them by the day they happened and sends one `add` with a frame per
day, its heading, and the moments laid out in cells that never overlap. The `add`
carries `filled`, the time of the newest of them, and the canvas remembers it, so
two windows filling at once make the pages once, and a moment taken off by hand
stays off. A day that already has a frame gets its new moments on that frame,
in the room it has. The frames are named for the day and the place; Haiku then
offers a short title for each from its notes (`ai.frames.name`), in the
background after a fill and from "Name my frames" in the Ask box. A name you
asked for is a step to undo; one made in the background isn't.

Frames keep a gap between them (`GAP` in `src/lib/canvas/layout.ts`): a new one
goes beside the last, one dropped on another is moved clear, and the grid button
in the corner lays them all out again in flow order. A piece added by a click
goes to the first free spot on the page you're working on. While a piece is
dragged on a page its edges and middle snap to the page's and its neighbours'
(hold Alt to move freely), with a blue line where it settled. A frame's
inspector can arrange its moments and photos as a grid, a scrapbook or a strip.
The tray's ready-made pages (cover, postcard, memory notes) are frames with
pieces already on them.

The Ask button on the canvas opens the same box as the one on the itinerary;
what it adds goes to its day's page like anything else.

## Rules

- Only the owner edits. Everyone else can look and play. (People don't edit
  together yet.)
- Words on a canvas (a frame's name, a scrap, a letter) are encrypted like notes.
  A piece that points at a moment or photo stores only the id.
- A `photo` piece must point at a ready photo already on a moment of this
  experience, the same rule that decides who may see it.
- A canvas holds up to 400 things. One request changes at most 100.
- Deleting an experience deletes its canvas. Deleting a canvas piece never
  deletes the moment or photo it shows.

## Where it lives

- `convex/canvas.ts`: `get`, `ensure`, `add`, `patch`, `remove`.
- `src/lib/canvas/`: camera maths, the node tree, looks and torn edges, resize and
  turn geometry, history, and the helpers that make new pieces. All pure and tested.
- `src/components/canvas/`: the pan and zoom surface (`canvas.tsx`, which knows
  nothing about frames), the pieces, the tray, the inspector, and the editor.

## Not here yet

Sharing a canvas read-only by link, making a collage with AI, and editing the
canvas from the box above the itinerary are the next pieces.
