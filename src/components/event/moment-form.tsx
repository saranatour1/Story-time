import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { ArrowDownIcon, ArrowUpIcon, ImageIcon, PlusIcon, Trash2Icon, VideoIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { stopsOf, TRANSPORT_VALUES, TRANSPORTS, type Transport } from "@/components/event/transport";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deletePhotos } from "@/lib/actions";
import { errorMessage } from "@/lib/errors";
import { isVideoFile, MEDIA_ACCEPT, uploadMedia } from "@/lib/upload";

const MOODS = ["😊", "😍", "😌", "😂", "🥹", "😴"];
const MAX_STOPS = 10;

type Media = { mediaId: string; kind: "photo" | "video"; name: string };

type StopValue = {
  transport: Transport | "";
  startsAt: string;
  place: string;
  media: Media[];
  notes: string[];
  links: string[];
  feeling: string;
  mood: string;
};

const schema = z.object({
  labels: z.string().max(500, "At most 500 characters"),
  stops: z.array(
    z.object({
      transport: z.enum(["", ...TRANSPORT_VALUES]),
      startsAt: z.string(),
      place: z.string().max(200, "At most 200 characters"),
      media: z.array(z.object({ mediaId: z.string(), kind: z.enum(["photo", "video"]), name: z.string() })),
      notes: z.array(z.string().max(5000, "At most 5000 characters")),
      links: z.array(
        z.string().refine((s) => s === "" || /^https?:\/\/\S+$/.test(s), "Enter a full link starting with http:// or https://"),
      ),
      feeling: z.string().max(5000, "At most 5000 characters"),
      mood: z.string(),
    }),
  ),
});

const emptyStop = (startsAt = ""): StopValue => ({
  transport: "",
  startsAt,
  place: "",
  media: [],
  notes: [""],
  links: [""],
  feeling: "",
  mood: "",
});

// <input type="datetime-local"> wants local time without a zone.
function toLocalInput(ms: number) {
  const offset = new Date(ms).getTimezoneOffset();
  return new Date(ms - offset * 60_000).toISOString().slice(0, 16);
}

function stopValuesOf(moment: MomentView): StopValue[] {
  return stopsOf(moment).map((s) => {
    const notes = s.blocks.flatMap((b) => (b.type === "note" ? [b.text] : []));
    const links = s.blocks.flatMap((b) => (b.type === "link" ? [b.url] : []));
    const feeling = s.blocks.find((b) => b.type === "feeling");
    return {
      transport: s.transport ?? "",
      startsAt: s.startsAt === undefined ? "" : toLocalInput(s.startsAt),
      place: s.place ?? "",
      media: s.blocks.flatMap((b): Media[] =>
        b.type === "photo" || b.type === "video"
          ? [{ mediaId: b.mediaId, kind: b.type, name: b.type === "photo" ? "Saved photo" : "Saved video" }]
          : [],
      ),
      notes: notes.length ? notes : [""],
      links: links.length ? links : [""],
      feeling: feeling?.type === "feeling" ? feeling.text : "",
      mood: feeling?.type === "feeling" ? (feeling.mood ?? "") : "",
    };
  });
}

// Creates a moment, or edits one when `moment` is given. A moment is a
// journey of stops; `day` (YYYY-MM-DD) prefills the first stop at noon.
export function MomentForm({
  eventId,
  moment,
  day,
  full = false,
  onDone,
}: {
  eventId: Id<"events">;
  moment?: MomentView;
  day?: string;
  full?: boolean;
  onDone?: () => void;
}) {
  const create = useMutation(api.moments.create);
  const update = useMutation(api.moments.update);
  const requestMore = useMutation(api.quota.request);
  const token = useAuthToken();
  const [uploading, setUploading] = useState(false);

  // Link titles aren't editable here; keep them for links that stay.
  const linkTitles = new Map(
    (moment ? stopsOf(moment) : [])
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.type === "link" && b.title ? [[b.url, b.title] as const] : [])),
  );

  const toBlocks = (s: StopValue) => [
    ...s.media.map((m) => ({ type: m.kind, mediaId: m.mediaId as Id<"media"> })),
    ...s.links.filter(Boolean).map((url) => ({ type: "link" as const, url, title: linkTitles.get(url) })),
    ...s.notes.filter((n) => n.trim()).map((text) => ({ type: "note" as const, text })),
    ...(s.feeling.trim() ? [{ type: "feeling" as const, text: s.feeling, mood: s.mood || undefined }] : []),
  ];

  const form = useForm({
    defaultValues: {
      labels: moment?.labels.join(", ") ?? "",
      stops: moment ? stopValuesOf(moment) : [emptyStop(day ? `${day}T12:00` : "")],
    },
    validators: { onChange: schema },
    onSubmit: async ({ value, formApi }) => {
      const [first, ...rest] = value.stops;
      if (!first?.startsAt) {
        toast.error("Pick when the first stop happened");
        return;
      }
      const blocksPerStop = value.stops.map(toBlocks);
      if (blocksPerStop.every((b) => b.length === 0)) {
        toast.error("Add a photo, video, link, note or feeling first");
        return;
      }
      const emptyStopAt = rest.findIndex((s, i) => !s.place.trim() && blocksPerStop[i + 1]!.length === 0);
      if (emptyStopAt !== -1) {
        toast.error(`Stop ${emptyStopAt + 2} needs a place or something to share`);
        return;
      }
      const startsAt = new Date(first.startsAt).getTime();
      const tzOffsetMinutes = -new Date(first.startsAt).getTimezoneOffset();
      const stops = rest.map((s, i) => ({
        startsAt: s.startsAt ? new Date(s.startsAt).getTime() : undefined,
        place: s.place.trim() || undefined,
        transport: s.transport || undefined,
        blocks: blocksPerStop[i + 1]!,
      }));
      const labels = value.labels.split(",").map((l) => l.trim()).filter(Boolean);
      try {
        if (moment) {
          const { removedMediaIds } = await update({
            momentId: moment._id,
            startsAt,
            tzOffsetMinutes,
            place: first.place.trim(),
            transport: first.transport || null,
            blocks: blocksPerStop[0]!,
            stops,
            labels,
          });
          if (token) await deletePhotos(removedMediaIds, token);
          toast.success("Moment saved");
        } else {
          await create({
            eventId,
            startsAt,
            tzOffsetMinutes,
            place: first.place.trim() || undefined,
            transport: first.transport || undefined,
            blocks: blocksPerStop[0]!,
            stops,
            labels,
          });
          toast.success("Moment added");
          formApi.reset();
        }
        onDone?.();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  });

  async function onMedia(stop: number, files: FileList | null) {
    if (!files || !token) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const mediaId = await uploadMedia(file, eventId, token);
        form.pushFieldValue(`stops[${stop}].media`, {
          mediaId,
          kind: isVideoFile(file) ? "video" : "photo",
          name: file.name,
        });
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "Upload failed"}`);
      }
    }
    setUploading(false);
  }

  if (full && !moment) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm">You've used all the moments this experience allows.</p>
        <Button
          variant="outline"
          onClick={() =>
            void requestMore({ eventId, extra: 10 })
              .then(() => toast.success("Requested 10 more moments"))
              .catch((e) => toast.error(errorMessage(e)))
          }
        >
          Request 10 more
        </Button>
      </div>
    );
  }

  // One stop's fields. `i` addresses the stop inside the form's array.
  const stopFields = (i: number) => {
    const id = (name: string) => `stop-${i}-${name}`;
    return (
      <FieldGroup>
        <form.Field name={`stops[${i}].transport`}>
          {(f) => (
            <Field>
              <FieldLabel htmlFor={id("transport")}>{i === 0 ? "How you got there" : "How you got here"}</FieldLabel>
              <Select value={f.state.value || "none"} onValueChange={(v) => f.handleChange(v === "none" ? "" : (v as Transport))}>
                <SelectTrigger id={id("transport")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {TRANSPORTS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <t.icon /> {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name={`stops[${i}].startsAt`}>
            {(f) => (
              <Field>
                <FieldLabel htmlFor={id("when")}>{i === 0 ? "When" : "When (optional)"}</FieldLabel>
                <Input id={id("when")} type="datetime-local" required={i === 0} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              </Field>
            )}
          </form.Field>
          <form.Field name={`stops[${i}].place`}>
            {(f) => (
              <Field data-invalid={f.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={id("place")}>Where</FieldLabel>
                <Input id={id("place")} placeholder={i === 0 ? "Optional" : "Hanover Hbf"} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                <FieldError errors={f.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        </div>

        <form.Field name={`stops[${i}].media`} mode="array">
          {(f) => (
            <Field>
              <FieldLabel htmlFor={id("media")}>Photos and videos</FieldLabel>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent">
                <ImageIcon className="size-4" />
                {uploading ? "Uploading…" : "Choose photos (5 MB) or videos (50 MB)"}
                <input id={id("media")} type="file" accept={MEDIA_ACCEPT} multiple className="sr-only" disabled={uploading} onChange={(e) => void onMedia(i, e.target.files)} />
              </label>
              {f.state.value.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {f.state.value.map((m, j) => (
                    <li key={m.mediaId} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {m.kind === "video" ? <VideoIcon className="size-3.5 shrink-0" /> : <ImageIcon className="size-3.5 shrink-0" />}
                        <span className="truncate">{m.name}</span>
                      </span>
                      <button type="button" aria-label={`Remove ${m.name}`} onClick={() => f.removeValue(j)}>
                        <XIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          )}
        </form.Field>

        <form.Field name={`stops[${i}].notes`} mode="array">
          {(f) => (
            <Field>
              <FieldLabel>Notes</FieldLabel>
              {f.state.value.map((_, j) => (
                <form.Field key={j} name={`stops[${i}].notes[${j}]`}>
                  {(n) => (
                    <>
                      <Textarea rows={2} value={n.state.value} onChange={(e) => n.handleChange(e.target.value)} aria-label={`Stop ${i + 1}, note ${j + 1}`} />
                      <FieldError errors={n.state.meta.errors} />
                    </>
                  )}
                </form.Field>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => f.pushValue("")}>
                <PlusIcon /> Another note
              </Button>
            </Field>
          )}
        </form.Field>

        <form.Field name={`stops[${i}].links`} mode="array">
          {(f) => (
            <Field>
              <FieldLabel>Links</FieldLabel>
              {f.state.value.map((_, j) => (
                <form.Field key={j} name={`stops[${i}].links[${j}]`}>
                  {(l) => (
                    <>
                      <Input type="url" placeholder="https://…" value={l.state.value} onChange={(e) => l.handleChange(e.target.value)} aria-label={`Stop ${i + 1}, link ${j + 1}`} />
                      <FieldError errors={l.state.meta.errors} />
                    </>
                  )}
                </form.Field>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => f.pushValue("")}>
                <PlusIcon /> Another link
              </Button>
            </Field>
          )}
        </form.Field>

        <form.Field name={`stops[${i}].feeling`}>
          {(f) => (
            <Field data-invalid={f.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={id("feeling")}>How it felt</FieldLabel>
              <form.Field name={`stops[${i}].mood`}>
                {(m) => (
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`Stop ${i + 1} mood`}>
                    {MOODS.map((mood) => (
                      <Button key={mood} type="button" size="sm" variant={m.state.value === mood ? "default" : "outline"} onClick={() => m.handleChange(m.state.value === mood ? "" : mood)}>
                        {mood}
                      </Button>
                    ))}
                  </div>
                )}
              </form.Field>
              <Textarea id={id("feeling")} rows={2} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              <FieldError errors={f.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="labels">
        {(f) => (
          <Field data-invalid={f.state.meta.errors.length > 0}>
            <FieldLabel htmlFor="labels">Labels</FieldLabel>
            <Input id="labels" placeholder="food, museum, sunset" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            <FieldDescription>Separate labels with commas.</FieldDescription>
            <FieldError errors={f.state.meta.errors} />
          </Field>
        )}
      </form.Field>

      <form.Field name="stops" mode="array">
        {(stops) => (
          <div className="space-y-4">
            {stops.state.value.map((_, i) => {
              const count = stops.state.value.length;
              return (
                <fieldset key={i} className="space-y-4 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="text-sm font-medium">Stop {i + 1}</legend>
                    <div className="flex items-center gap-0.5">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => stops.moveValue(i, i - 1)}>
                        <ArrowUpIcon />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move stop ${i + 1} down`} disabled={i === count - 1} onClick={() => stops.moveValue(i, i + 1)}>
                        <ArrowDownIcon />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove stop ${i + 1}`} disabled={count === 1} onClick={() => stops.removeValue(i)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                  {stopFields(i)}
                </fieldset>
              );
            })}
            <Button type="button" variant="outline" size="sm" disabled={stops.state.value.length >= MAX_STOPS} onClick={() => stops.pushValue(emptyStop())}>
              <PlusIcon /> Add stop
            </Button>
          </div>
        )}
      </form.Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={form.state.isSubmitting || uploading}>
          {uploading ? "Uploading…" : moment ? "Save moment" : "Add moment"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
