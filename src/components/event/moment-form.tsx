import { useMutation, usePaginatedQuery } from "convex/react";
import { useForm } from "@tanstack/react-form";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
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
import { useCurrentAuthToken } from "@/hooks/use-current-auth-token";
import { deletePhotos } from "@/lib/actions";
import { errorMessage } from "@/lib/errors";
import { fromInput, toInput } from "@/lib/local-time";
import { combinePhotoMeta, type PhotoMeta, readPhotoMeta } from "@/lib/photo-meta";
import { isVideoFile, MEDIA_ACCEPT, uploadMedia } from "@/lib/upload";
import { cn } from "@/lib/utils";

const MOODS = ["😊", "😍", "😌", "😂", "🥹", "😴"];
const MAX_STOPS = 10;

// `hidden`: kept from everyone but the experience's owners and whoever wrote the moment.
type Media = { mediaId: string; kind: "photo" | "video"; name: string; hidden?: boolean };

type StopValue = {
  transport: Transport | "";
  startsAt: string;
  place: string;
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
  people: z.array(z.custom<Id<"users">>()),
  stops: z.array(
    z.object({
      transport: z.enum(["", ...TRANSPORT_VALUES]),
      startsAt: z.string(),
      place: z.string().max(200, "At most 200 characters"),
      geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
      geoFromPhoto: z.boolean().optional(),
      media: z.array(
        z.object({
          mediaId: z.string(),
          kind: z.enum(["photo", "video"]),
          name: z.string(),
          hidden: z.boolean().optional(),
        }),
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
                hidden: b.hidden,
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
  const people = usePaginatedQuery(api.sessions.members, { eventId }, { initialNumItems: 50 });
  const members = people.status === "LoadingFirstPage" ? undefined : people.results;
  const onTripOrStillLoading = (id: Id<"users">) =>
    people.status !== "Exhausted" || people.results.some((m) => m.userId === id);
  const remove = useMutation(api.moments.remove);
  const setArchived = useMutation(api.moments.setArchived);
  const archive = async () => {
    try {
      await setArchived({ momentId: moment._id, archived: !moment.archived });
      toast.success(
        moment.archived
          ? "Moment restored"
          : "Moment archived. Only you and the experience's owners see it now.",
      );
      onDone?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const [confirming, setConfirming] = useState(false);
  const currentToken = useCurrentAuthToken();
  const [uploadingStop, setUploadingStop] = useState<number | null>(null);
  const uploading = uploadingStop !== null;
  const uid = useId();
  const saving = useRef(false);

  const unsaved = useRef(new Set<string>());
  const closed = useRef(false);
  useEffect(() => {
    closed.current = false;
    const ids = unsaved.current;
    return () => {
      closed.current = true;
      if (saving.current) return;
      const token = currentToken();
      if (ids.size > 0 && token) void deletePhotos([...ids], token);
      ids.clear();
    };
  }, []);
  const discard = (mediaId: string) => {
    const token = currentToken();
    if (unsaved.current.delete(mediaId) && token) void deletePhotos([mediaId], token);
  };
  const settle = (stops: StopValue[]) => {
    const kept = new Set(stops.flatMap((s) => s.media.map((m) => m.mediaId)));
    const dropped = [...unsaved.current].filter((id) => !kept.has(id));
    unsaved.current.clear();
    return dropped;
  };

  const linkTitles = new Map(
    stopsOf(moment)
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.type === "link" && b.title ? [[b.url, b.title] as const] : [])),
  );

  const toBlocks = (s: StopValue) => [
    ...s.media.map((m) => ({
      type: m.kind,
      mediaId: m.mediaId as Id<"media">,
      ...(m.hidden && { hidden: true }),
    })),
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
      people: moment.people.map((p) => p.userId),
      stops: stopValuesOf(moment),
    },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      const [first, ...rest] = value.stops;
      if (!first?.startsAt) {
        toast.error("Pick when the first stop happened");
        return;
      }
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
      const zone = moment.tzOffsetMinutes;
      const startsAt = fromInput(first.startsAt, zone);
      const tzOffsetMinutes = zone ?? -new Date(first.startsAt).getTimezoneOffset();
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
          people: value.people.filter(onTripOrStillLoading),
        });
        const dropped = settle(value.stops);
        const token = currentToken();
        if (token) await deletePhotos([...removedMediaIds, ...dropped], token);
        toast.success("Moment saved");
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
    if (files.length === 0 || !currentToken()) return;
    setUploadingStop(stop);
    const metas = await Promise.all(
      files.map((file) => readPhotoMeta(file).catch((): PhotoMeta => ({}))),
    );
    void fillFromPhotos(stop, combinePhotoMeta(metas));
    for (const file of files) {
      const token = currentToken();
      if (closed.current || !token) break;
      try {
        const mediaId = await uploadMedia(file, eventId, token);
        if (closed.current) {
          void deletePhotos([mediaId], currentToken() ?? token);
          break;
        }
        unsaved.current.add(mediaId);
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

  const biasFor = (i: number) => {
    const stops = form.state.values.stops;
    return (
      stops
        .slice(0, i)
        .reverse()
        .find((s) => s.geo)?.geo ?? stops.find((s) => s.geo)?.geo
    );
  };

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
                          className={cn(
                            "grid aspect-square place-items-center rounded-md bg-muted text-muted-foreground",
                            m.hidden && "opacity-40",
                          )}
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
                          className={cn("aspect-square rounded-md", m.hidden && "opacity-40")}
                        />
                      )}
                      <button
                        type="button"
                        aria-pressed={m.hidden === true}
                        aria-label={`Hide ${m.name} from other people`}
                        title={m.hidden ? "Hidden from other people" : "Hide from other people"}
                        onClick={() => f.replaceValue(j, { ...m, hidden: !m.hidden })}
                        className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {m.hidden ? (
                          <EyeOffIcon className="size-3.5" />
                        ) : (
                          <EyeIcon className="size-3.5" />
                        )}
                      </button>
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
              {f.state.value.some((m) => m.hidden) && (
                <FieldDescription>
                  Hidden ones are only seen by you and the experience's owners.
                </FieldDescription>
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
          const token = currentToken();
          if (closed.current && unsaved.current.size > 0 && token) {
            void deletePhotos([...unsaved.current], token);
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
                className="ml-auto"
                disabled={submitting || uploading}
                onClick={() => void archive()}
              >
                {moment.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                {moment.archived ? "Restore" : "Archive"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
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
          const token = currentToken();
          if (token) await deletePhotos(removedMediaIds, token);
          toast.success("Moment deleted");
          onDone?.();
        }}
      />
    </form>
  );
};
