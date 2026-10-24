import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useForm } from "@tanstack/react-form";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImageIcon,
  PlusIcon,
  Trash2Icon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AuthImage } from "@/components/auth-image";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { type Geo, PlaceInput, reversePlace } from "@/components/event/place-input";
import {
  stopsOf,
  TRANSPORT_VALUES,
  TRANSPORTS,
  type Transport,
} from "@/components/event/transport";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deletePhotos } from "@/lib/actions";
import { errorMessage } from "@/lib/errors";
import { fromInput, toInput } from "@/lib/local-time";
import { combinePhotoMeta, type PhotoMeta, readPhotoMeta } from "@/lib/photo-meta";
import { isVideoFile, MEDIA_ACCEPT, uploadMedia } from "@/lib/upload";
import { cn } from "@/lib/utils";

const MOODS = ["😊", "😍", "😌", "😂", "🥹", "😴"];
const MAX_STOPS = 10;

type Media = { mediaId: string; kind: "photo" | "video"; name: string };

type StopValue = {
  transport: Transport | "";
  startsAt: string;
  place: string;
  // Set by picking a suggested place (typing clears it), or read from a
  // photo's GPS (`geoFromPhoto`; typing keeps it).
  geo?: Geo;
  geoFromPhoto?: boolean;
  media: Media[];
  notes: string[];
  links: string[];
  feeling: string;
  mood: string;
};

const schema = z.object({
  labels: z.string().max(500, "At most 500 characters"),
  people: z.array(z.string()),
  stops: z.array(
    z.object({
      transport: z.enum(["", ...TRANSPORT_VALUES]),
      startsAt: z.string(),
      place: z.string().max(200, "At most 200 characters"),
      geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
      geoFromPhoto: z.boolean().optional(),
      media: z.array(
        z.object({ mediaId: z.string(), kind: z.enum(["photo", "video"]), name: z.string() }),
      ),
      notes: z.array(z.string().max(5000, "At most 5000 characters")),
      links: z.array(
        z
          .string()
          .refine(
            (s) => s === "" || /^https?:\/\/\S+$/.test(s),
            "Enter a full link starting with http:// or https://",
          ),
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

const stopValuesOf = (moment: MomentView): StopValue[] => {
  return stopsOf(moment).map((s) => {
    const notes = s.blocks.flatMap((b) => (b.type === "note" ? [b.text] : []));
    const links = s.blocks.flatMap((b) => (b.type === "link" ? [b.url] : []));
    const feeling = s.blocks.find((b) => b.type === "feeling");
    return {
      transport: s.transport ?? "",
      // Shown on the clock where the moment happened, as the story shows it.
      startsAt: s.startsAt === undefined ? "" : toInput(s.startsAt, moment.tzOffsetMinutes),
      place: s.place ?? "",
      geo: s.geo,
      media: s.blocks.flatMap((b): Media[] =>
        b.type === "photo" || b.type === "video"
          ? [
              {
                mediaId: b.mediaId,
                kind: b.type,
                name: b.type === "photo" ? "Saved photo" : "Saved video",
              },
            ]
          : [],
      ),
      notes: notes.length ? notes : [""],
      links: links.length ? links : [""],
      feeling: feeling?.type === "feeling" ? feeling.text : "",
      mood: feeling?.type === "feeling" ? (feeling.mood ?? "") : "",
    };
  });
};

// Edits a moment: a journey of stops, each with its time, place, photos and
// words. Deleting it lives here too.
export const MomentForm = ({
  eventId,
  moment,
  onDone,
}: {
  eventId: Id<"events">;
  moment: MomentView;
  onDone?: () => void;
}) => {
  const update = useMutation(api.moments.update);
  // Who can be tagged. Most trips fit in the first page; a bigger one shows
  // "More people".
  const people = usePaginatedQuery(api.sessions.members, { eventId }, { initialNumItems: 50 });
  const members = people.status === "LoadingFirstPage" ? undefined : people.results;
  // The form holds ids as strings; these are the people they name: those
  // tagged before and those loaded here.
  const idOf = new Map<string, Id<"users">>([
    ...moment.people.map((p) => [p.userId, p.userId] as const),
    ...people.results.map((m) => [m.userId, m.userId] as const),
  ]);
  // Someone who has since left the trip drops off; the server refuses them.
  // That's only known with everyone loaded: a person on an unread page isn't gone.
  const onTrip = (id: string) =>
    people.status !== "Exhausted" || people.results.some((m) => m.userId === id);
  const remove = useMutation(api.moments.remove);
  const [confirming, setConfirming] = useState(false);
  const token = useAuthToken();
  // The stop whose photos are uploading, if any.
  const [uploadingStop, setUploadingStop] = useState<number | null>(null);
  const uploading = uploadingStop !== null;
  // Unique ids, so labels stay tied to their inputs wherever this renders.
  const uid = useId();
  // Set while a save is in flight: a second Enter or click must not create
  // the moment twice.
  const saving = useRef(false);

  // Uploads from this session that no saved moment uses yet. They count
  // toward the experience's upload cap, so they're deleted (best effort) when
  // removed or abandoned. Photos already saved on `moment` are never here.
  const unsaved = useRef(new Set<string>());
  // The files uploaded in this session, by media id: a new moment's AI
  // thumbnails come from them.
  const picked = useRef(new Map<string, File>());
  const closed = useRef(false);
  const latestToken = useRef(token);
  useEffect(() => {
    latestToken.current = token;
  }, [token]);
  useEffect(() => {
    closed.current = false;
    const ids = unsaved.current;
    return () => {
      closed.current = true;
      // A save in flight settles these itself.
      if (saving.current) return;
      if (ids.size > 0 && latestToken.current) void deletePhotos([...ids], latestToken.current);
      ids.clear();
    };
  }, []);
  const discard = (mediaId: string) => {
    picked.current.delete(mediaId);
    if (unsaved.current.delete(mediaId) && latestToken.current)
      void deletePhotos([mediaId], latestToken.current);
  };
  // After a save: uploads the moment now uses are its own; any others (say,
  // on a removed stop) are returned for deletion.
  const settle = (stops: StopValue[]) => {
    const kept = new Set(stops.flatMap((s) => s.media.map((m) => m.mediaId)));
    const dropped = [...unsaved.current].filter((id) => !kept.has(id));
    unsaved.current.clear();
    picked.current.clear();
    return dropped;
  };

  // Link titles aren't editable here; keep them for links that stay.
  const linkTitles = new Map(
    stopsOf(moment)
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.type === "link" && b.title ? [[b.url, b.title] as const] : [])),
  );

  const toBlocks = (s: StopValue) => [
    ...s.media.map((m) => ({ type: m.kind, mediaId: m.mediaId as Id<"media"> })),
    ...s.links
      .filter(Boolean)
      .map((url) => ({ type: "link" as const, url, title: linkTitles.get(url) })),
    ...s.notes.filter((n) => n.trim()).map((text) => ({ type: "note" as const, text })),
    ...(s.feeling.trim()
      ? [{ type: "feeling" as const, text: s.feeling, mood: s.mood || undefined }]
      : []),
  ];

  const form = useForm({
    defaultValues: {
      labels: moment.labels.join(", ") ?? "",
      people: moment.people.map((p): string => p.userId),
      stops: stopValuesOf(moment),
    },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      const [first, ...rest] = value.stops;
      if (!first?.startsAt) {
        toast.error("Pick when the first stop happened");
        return;
      }
      // A feeling needs words; the server rejects a mood on its own, so say
      // so rather than dropping it.
      const moodOnly = value.stops.findIndex((s) => s.mood && !s.feeling.trim());
      if (moodOnly !== -1) {
        toast.error(
          `${value.stops.length > 1 ? `Stop ${moodOnly + 1}: add` : "Add"} a few words to go with the mood`,
        );
        return;
      }
      const blocksPerStop = value.stops.map(toBlocks);
      if (blocksPerStop.every((b) => b.length === 0)) {
        toast.error("Add a photo, video, link, note or feeling first");
        return;
      }
      const emptyStopAt = rest.findIndex(
        (s, i) => !s.place.trim() && blocksPerStop[i + 1]!.length === 0,
      );
      if (emptyStopAt !== -1) {
        toast.error(`Stop ${emptyStopAt + 2} needs a place or something to share`);
        return;
      }
      // An edited moment's times are read in the zone it happened in, as they
      // show. A new moment, or one with no zone yet, reads them in the viewer's.
      const zone = moment.tzOffsetMinutes;
      const startsAt = fromInput(first.startsAt, zone);
      const tzOffsetMinutes = zone ?? -new Date(first.startsAt).getTimezoneOffset();
      // Coordinates only go with a place.
      const geoOf = (s: StopValue) => (s.place.trim() ? s.geo : undefined);
      const stops = rest.map((s, i) => ({
        startsAt: s.startsAt ? fromInput(s.startsAt, zone) : undefined,
        place: s.place.trim() || undefined,
        geo: geoOf(s),
        transport: s.transport || undefined,
        blocks: blocksPerStop[i + 1]!,
      }));
      const labels = value.labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      try {
        // The time, and with it the zone and the day the moment is grouped
        // under, only change when the first stop's time did. Fixing a typo
        // keeps the author's day.
        const timeChanged = first.startsAt !== toInput(moment.startsAt, zone);
        const { removedMediaIds } = await update({
          momentId: moment._id,
          ...(timeChanged ? { startsAt, tzOffsetMinutes } : {}),
          place: first.place.trim(),
          geo: geoOf(first),
          transport: first.transport || null,
          blocks: blocksPerStop[0]!,
          stops,
          labels,
          people: value.people.flatMap((id) => {
            const user = idOf.get(id);
            return user !== undefined && onTrip(id) ? [user] : [];
          }),
        });
        const dropped = settle(value.stops);
        if (latestToken.current)
          await deletePhotos([...removedMediaIds, ...dropped], latestToken.current);
        toast.success("Moment saved");
        // Closed mid-save: whatever is open now isn't this form's to close.
        if (!closed.current) onDone?.();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  });

  const onMedia = async (stop: number, input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    // Cleared, so picking the same file again (after removing it) still works.
    input.value = "";
    if (files.length === 0 || !latestToken.current) return;
    setUploadingStop(stop);
    // Read before any upload: the uploaded copy has its camera details stripped.
    const metas = await Promise.all(
      files.map((file) => readPhotoMeta(file).catch((): PhotoMeta => ({}))),
    );
    void fillFromPhotos(stop, combinePhotoMeta(metas));
    for (const file of files) {
      // Read per file: tokens are short-lived.
      const token = latestToken.current;
      if (closed.current || !token) break;
      try {
        const mediaId = await uploadMedia(file, eventId, token);
        // Closed mid-upload: nothing will ever save this one.
        if (closed.current) {
          void deletePhotos([mediaId], latestToken.current ?? token);
          break;
        }
        unsaved.current.add(mediaId);
        picked.current.set(mediaId, file);
        form.pushFieldValue(`stops[${stop}].media`, {
          mediaId,
          kind: isVideoFile(file) ? "video" : "photo",
          name: file.name,
        });
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "Upload failed"}`);
      }
    }
    setUploadingStop(null);
  };

  // A stop with no time takes the earliest the photos were taken, and one
  // with no location the first photo GPS, then, if its Where is empty, a name
  // for that spot from OpenStreetMap. Typed text is never overwritten. Stops
  // can't move while photos upload, so `stop` still points at the same one.
  const fillFromPhotos = async (stop: number, { takenAt, geo }: PhotoMeta) => {
    const current = form.state.values.stops[stop];
    if (closed.current || !current) return;
    if (takenAt !== undefined && !current.startsAt)
      form.setFieldValue(`stops[${stop}].startsAt`, toInput(takenAt, moment.tzOffsetMinutes));
    if (!geo || current.geo) return;
    form.setFieldValue(`stops[${stop}].geo`, geo);
    form.setFieldValue(`stops[${stop}].geoFromPhoto`, true);
    if (current.place.trim()) return;
    const label = await reversePlace(geo);
    const now = form.state.values.stops[stop];
    const same = now?.geo?.lat === geo.lat && now.geo.lng === geo.lng;
    if (label && !closed.current && same && !now.place.trim())
      form.setFieldValue(`stops[${stop}].place`, label);
  };

  // Where to centre place search for stop `i`: the nearest earlier stop on
  // the map, else any stop of this moment that is.
  const biasFor = (i: number) => {
    const stops = form.state.values.stops;
    return (
      stops
        .slice(0, i)
        .reverse()
        .find((s) => s.geo)?.geo ?? stops.find((s) => s.geo)?.geo
    );
  };

  // One stop's fields. `i` addresses the stop inside the form's array.
  const stopFields = (i: number) => {
    const id = (name: string) => `${uid}-stop-${i}-${name}`;
    return (
      <FieldGroup>
        <form.Field name={`stops[${i}].transport`}>
          {(f) => (
            <Field>
              <FieldLabel htmlFor={id("transport")}>
                {i === 0 ? "How you got there" : "How you got here"}
              </FieldLabel>
              <Select
                value={f.state.value || "none"}
                onValueChange={(v) => f.handleChange(v === "none" ? "" : (v as Transport))}
              >
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
                <Input
                  id={id("when")}
                  type="datetime-local"
                  required={i === 0}
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.Field>
          {/* The place's text, its pin and where the pin came from. */}
          <form.Field name={`stops[${i}].place`}>
            {(f) => (
              <form.Field name={`stops[${i}].geo`}>
                {(g) => (
                  <form.Field name={`stops[${i}].geoFromPhoto`}>
                    {(p) => (
                      <Field data-invalid={f.state.meta.errors.length > 0}>
                        <FieldLabel htmlFor={id("place")}>Where</FieldLabel>
                        <PlaceInput
                          id={id("place")}
                          placeholder={i === 0 ? "Optional" : "Café, station, viewpoint…"}
                          value={f.state.value}
                          geo={g.state.value}
                          fromPhoto={p.state.value}
                          getBias={() => biasFor(i)}
                          onChange={(place, geo, fromPhoto) => {
                            f.handleChange(place);
                            g.handleChange(geo);
                            p.handleChange(fromPhoto);
                          }}
                        />
                        <FieldError errors={f.state.meta.errors} />
                      </Field>
                    )}
                  </form.Field>
                )}
              </form.Field>
            )}
          </form.Field>
        </div>

        <form.Field name={`stops[${i}].media`} mode="array">
          {(f) => (
            <Field>
              <FieldLabel htmlFor={id("media")}>Photos and videos</FieldLabel>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  uploading ? "cursor-default opacity-70" : "cursor-pointer hover:bg-accent",
                )}
              >
                <ImageIcon aria-hidden className="size-4 shrink-0" />
                <span aria-live="polite">
                  {uploadingStop === i ? "Uploading…" : "Choose photos (20 MB) or videos (50 MB)"}
                </span>
                <input
                  id={id("media")}
                  type="file"
                  accept={MEDIA_ACCEPT}
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => void onMedia(i, e.target)}
                />
              </label>
              {(f.state.value.length > 0 || uploadingStop === i) && (
                <ul
                  aria-label={`Stop ${i + 1} photos and videos`}
                  className="grid grid-cols-4 gap-2 sm:grid-cols-5"
                >
                  {f.state.value.map((m, j) => (
                    <li key={m.mediaId} className="relative">
                      {m.kind === "video" ? (
                        <div
                          title={m.name}
                          className="grid aspect-square place-items-center rounded-md bg-muted text-muted-foreground"
                        >
                          <VideoIcon aria-hidden className="size-5" />
                          <span className="sr-only">{m.name}</span>
                        </div>
                      ) : (
                        <AuthImage
                          mediaId={m.mediaId}
                          alt={m.name}
                          width={160}
                          height={160}
                          sizes="160px"
                          className="aspect-square rounded-md"
                        />
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${m.name}`}
                        onClick={() => {
                          f.removeValue(j);
                          discard(m.mediaId);
                        }}
                        className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  {uploadingStop === i && (
                    <li aria-hidden className="aspect-square animate-pulse rounded-md bg-muted" />
                  )}
                </ul>
              )}
            </Field>
          )}
        </form.Field>

        <form.Field name={`stops[${i}].notes`} mode="array">
          {(f) => (
            <Field aria-labelledby={id("notes")}>
              <FieldLabel id={id("notes")}>Notes</FieldLabel>
              {f.state.value.map((_, j) => (
                <form.Field key={j} name={`stops[${i}].notes[${j}]`}>
                  {(n) => (
                    <>
                      <Textarea
                        rows={2}
                        value={n.state.value}
                        onChange={(e) => n.handleChange(e.target.value)}
                        aria-label={`Stop ${i + 1}, note ${j + 1}`}
                      />
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
            <Field aria-labelledby={id("links")}>
              <FieldLabel id={id("links")}>Links</FieldLabel>
              {f.state.value.map((_, j) => (
                <form.Field key={j} name={`stops[${i}].links[${j}]`}>
                  {(l) => (
                    <>
                      <Input
                        type="url"
                        placeholder="https://…"
                        value={l.state.value}
                        onChange={(e) => l.handleChange(e.target.value)}
                        aria-label={`Stop ${i + 1}, link ${j + 1}`}
                      />
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
                  <div
                    className="flex flex-wrap gap-1"
                    role="group"
                    aria-label={`Stop ${i + 1} mood`}
                  >
                    {MOODS.map((mood) => (
                      <Button
                        key={mood}
                        type="button"
                        size="sm"
                        variant={m.state.value === mood ? "default" : "outline"}
                        onClick={() => m.handleChange(m.state.value === mood ? "" : mood)}
                      >
                        {mood}
                      </Button>
                    ))}
                  </div>
                )}
              </form.Field>
              <Textarea
                id={id("feeling")}
                rows={2}
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
              />
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
        if (saving.current) return;
        saving.current = true;
        void form.handleSubmit().finally(() => {
          saving.current = false;
          // Closed mid-save and it failed: nothing will save these now.
          if (closed.current && unsaved.current.size > 0 && latestToken.current) {
            void deletePhotos([...unsaved.current], latestToken.current);
            unsaved.current.clear();
          }
        });
      }}
    >
      <form.Field name="labels">
        {(f) => (
          <Field data-invalid={f.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={`${uid}-labels`}>Labels</FieldLabel>
            <Input
              id={`${uid}-labels`}
              placeholder="food, museum, sunset"
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
            />
            <FieldDescription>Separate labels with commas.</FieldDescription>
            <FieldError errors={f.state.meta.errors} />
          </Field>
        )}
      </form.Field>

      {/* Only worth asking once someone else is on the trip. */}
      {members !== undefined && members.length > 1 && (
        <form.Field name="people">
          {(f) => (
            <Field>
              <FieldLabel id={`${uid}-people`}>Who was there</FieldLabel>
              <div role="group" aria-labelledby={`${uid}-people`} className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const on = f.state.value.includes(m.userId);
                  return (
                    <Button
                      key={m.userId}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      aria-pressed={on}
                      onClick={() =>
                        f.handleChange(
                          on
                            ? f.state.value.filter((id) => id !== m.userId)
                            : [...f.state.value, m.userId],
                        )
                      }
                    >
                      {m.displayName ?? "Anonymous"}
                    </Button>
                  );
                })}
              </div>
              {people.status === "CanLoadMore" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => people.loadMore(50)}
                >
                  More people
                </Button>
              )}
              <FieldDescription>Only people on this experience see who was there.</FieldDescription>
            </Field>
          )}
        </form.Field>
      )}

      <form.Field name="stops" mode="array">
        {(stops) => (
          <div className="space-y-4">
            {stops.state.value.map((_, i) => {
              const count = stops.state.value.length;
              return (
                <fieldset key={i} className="space-y-4 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="text-sm font-medium">Stop {i + 1}</legend>
                    {/* Locked during uploads: a finished upload lands on the
                        stop at the index it started from. */}
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move stop ${i + 1} up`}
                        disabled={i === 0 || uploading}
                        onClick={() => stops.moveValue(i, i - 1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move stop ${i + 1} down`}
                        disabled={i === count - 1 || uploading}
                        onClick={() => stops.moveValue(i, i + 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove stop ${i + 1}`}
                        disabled={count === 1 || uploading}
                        onClick={() => stops.removeValue(i)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                  {stopFields(i)}
                </fieldset>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stops.state.value.length >= MAX_STOPS}
              onClick={() => stops.pushValue(emptyStop())}
            >
              <PlusIcon /> Add stop
            </Button>
          </div>
        )}
      </form.Field>

      <div className="flex gap-2">
        {/* Subscribed, so the button re-renders (and disables) while saving. */}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <>
              <Button type="submit" disabled={submitting || uploading}>
                {uploading ? "Uploading…" : submitting ? "Saving…" : "Save moment"}
              </Button>
              {onDone && (
                <Button type="button" variant="ghost" disabled={submitting} onClick={onDone}>
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="ml-auto text-destructive"
                disabled={submitting || uploading}
                onClick={() => setConfirming(true)}
              >
                <Trash2Icon /> Delete
              </Button>
            </>
          )}
        </form.Subscribe>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this moment?"
        description="Its notes, links and photos are removed for everyone. This can't be undone."
        confirmLabel="Delete moment"
        onConfirm={async () => {
          const { removedMediaIds } = await remove({ momentId: moment._id });
          if (latestToken.current) await deletePhotos(removedMediaIds, latestToken.current);
          toast.success("Moment deleted");
          onDone?.();
        }}
      />
    </form>
  );
};
