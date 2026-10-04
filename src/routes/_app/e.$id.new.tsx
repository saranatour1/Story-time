import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { ImageIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, uploadPhoto } from "@/lib/upload";

export const Route = createFileRoute("/_app/e/$id/new")({ component: NewEvent });

function NewEvent() {
  const { id } = Route.useParams();
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { eventId });

  if (event === undefined) return <Skeleton className="h-96 w-full" />;
  if (event === null) return <p className="text-muted-foreground">Experience not found.</p>;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">About this experience</h1>
        <EventForm eventId={eventId} event={event} />
      </section>
      <section className="space-y-6 border-t pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">New moment</h2>
          <Badge variant="secondary">
            {event.momentLimit - event.momentCount} of {event.momentLimit} left
          </Badge>
        </div>
        <MomentForm eventId={eventId} full={event.momentCount >= event.momentLimit} />
      </section>
    </div>
  );
}

const eventSchema = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters").max(80, "At most 80 characters"),
    description: z.string().max(2000, "At most 2000 characters"),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt, {
    path: ["endsAt"],
    message: "End must be after the start",
  });

const toDate = (s: string) => (s ? new Date(`${s}T00:00:00`).getTime() : undefined);
const fromDate = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

function EventForm({
  eventId,
  event,
}: {
  eventId: Id<"events">;
  event: { title: string; description?: string; startsAt?: number; endsAt?: number; status: string };
}) {
  const update = useMutation(api.events.update);
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: {
      title: event.status === "draft" ? "" : event.title,
      description: event.description ?? "",
      startsAt: fromDate(event.startsAt),
      endsAt: fromDate(event.endsAt),
    },
    validators: { onChange: eventSchema },
    onSubmit: async ({ value }) => {
      try {
        await update({
          eventId,
          title: value.title.trim(),
          description: value.description,
          startsAt: toDate(value.startsAt),
          endsAt: toDate(value.endsAt),
        });
        toast.success("Saved");
        await navigate({ to: "/e/$id", params: { id: eventId } });
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="title">
          {(f) => (
            <Field data-invalid={f.state.meta.isTouched && f.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                placeholder="Lisbon, summer 2026"
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
              />
              {f.state.meta.isTouched && <FieldError errors={f.state.meta.errors} />}
            </Field>
          )}
        </form.Field>
        <form.Field name="description">
          {(f) => (
            <Field data-invalid={f.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                rows={4}
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
              />
              <FieldDescription>Optional. Only people you share with see it.</FieldDescription>
              <FieldError errors={f.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="startsAt">
            {(f) => (
              <Field>
                <FieldLabel htmlFor="startsAt">Starts</FieldLabel>
                <Input id="startsAt" type="date" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              </Field>
            )}
          </form.Field>
          <form.Field name="endsAt">
            {(f) => (
              <Field data-invalid={f.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="endsAt">Ends</FieldLabel>
                <Input id="endsAt" type="date" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                <FieldError errors={f.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        </div>
      </FieldGroup>
      <Button type="submit" disabled={form.state.isSubmitting}>
        Save and open
      </Button>
    </form>
  );
}

const MOODS = ["😊", "😍", "😌", "😂", "🥹", "😴"];

const momentSchema = z.object({
  startsAt: z.string().min(1, "Pick a date and time"),
  place: z.string().max(200, "At most 200 characters"),
  links: z.array(z.string().refine((s) => s === "" || /^https?:\/\/\S+$/.test(s), "Enter a full link starting with http:// or https://")),
  notes: z.array(z.string().max(5000, "At most 5000 characters")),
  feeling: z.string().max(5000, "At most 5000 characters"),
  mood: z.string(),
});

type Photo = { mediaId: Id<"media">; name: string };

function MomentForm({ eventId, full }: { eventId: Id<"events">; full: boolean }) {
  const create = useMutation(api.moments.create);
  const requestMore = useMutation(api.quota.request);
  const token = useAuthToken();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);

  const form = useForm({
    defaultValues: {
      startsAt: "",
      place: "",
      links: [""] as string[],
      notes: [""] as string[],
      feeling: "",
      mood: "",
    },
    validators: { onChange: momentSchema },
    onSubmit: async ({ value, formApi }) => {
      const blocks = [
        ...photos.map((p) => ({ type: "photo" as const, mediaId: p.mediaId })),
        ...value.links.filter(Boolean).map((url) => ({ type: "link" as const, url })),
        ...value.notes.filter((n) => n.trim()).map((text) => ({ type: "note" as const, text })),
        ...(value.feeling.trim()
          ? [{ type: "feeling" as const, text: value.feeling, mood: value.mood || undefined }]
          : []),
      ];
      if (blocks.length === 0) {
        toast.error("Add a photo, link, note or feeling first");
        return;
      }
      try {
        await create({
          eventId,
          startsAt: new Date(value.startsAt).getTime(),
          tzOffsetMinutes: -new Date(value.startsAt).getTimezoneOffset(),
          place: value.place.trim() || undefined,
          blocks,
        });
        toast.success("Moment added");
        setPhotos([]);
        formApi.reset();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  });

  async function onPhotos(files: FileList | null) {
    if (!files || !token) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is over 5 MB`);
        continue;
      }
      try {
        const mediaId = await uploadPhoto(file, eventId, token);
        setPhotos((p) => [...p, { mediaId: mediaId as Id<"media">, name: file.name }]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    }
    setUploading(false);
  }

  if (full) {
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

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="startsAt">
          {(f) => (
            <Field data-invalid={f.state.meta.isTouched && f.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="momentWhen">When</FieldLabel>
              <Input id="momentWhen" type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} />
              {f.state.meta.isTouched && <FieldError errors={f.state.meta.errors} />}
            </Field>
          )}
        </form.Field>
        <form.Field name="place">
          {(f) => (
            <Field data-invalid={f.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="place">Where</FieldLabel>
              <Input id="place" placeholder="Optional" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              <FieldError errors={f.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <Field>
          <FieldLabel htmlFor="photos">Photos</FieldLabel>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent">
            <ImageIcon className="size-4" />
            {uploading ? "Uploading…" : "Choose photos (up to 5 MB each)"}
            <input id="photos" type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={(e) => void onPhotos(e.target.files)} />
          </label>
          {photos.length > 0 && (
            <ul className="space-y-1 text-sm">
              {photos.map((p) => (
                <li key={p.mediaId} className="flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPhotos((all) => all.filter((x) => x.mediaId !== p.mediaId))}>
                    <XIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>

        <form.Field name="notes" mode="array">
          {(f) => (
            <Field>
              <FieldLabel>Notes</FieldLabel>
              {f.state.value.map((_, i) => (
                <form.Field key={i} name={`notes[${i}]`}>
                  {(n) => (
                    <>
                      <Textarea rows={2} value={n.state.value} onChange={(e) => n.handleChange(e.target.value)} aria-label={`Note ${i + 1}`} />
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

        <form.Field name="links" mode="array">
          {(f) => (
            <Field>
              <FieldLabel>Links</FieldLabel>
              {f.state.value.map((_, i) => (
                <form.Field key={i} name={`links[${i}]`}>
                  {(l) => (
                    <>
                      <Input type="url" placeholder="https://…" value={l.state.value} onChange={(e) => l.handleChange(e.target.value)} aria-label={`Link ${i + 1}`} />
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

        <form.Field name="feeling">
          {(f) => (
            <Field data-invalid={f.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="feeling">How it felt</FieldLabel>
              <form.Field name="mood">
                {(m) => (
                  <div className="flex gap-1" role="group" aria-label="Mood">
                    {MOODS.map((mood) => (
                      <Button key={mood} type="button" size="sm" variant={m.state.value === mood ? "default" : "outline"} onClick={() => m.handleChange(m.state.value === mood ? "" : mood)}>
                        {mood}
                      </Button>
                    ))}
                  </div>
                )}
              </form.Field>
              <Textarea id="feeling" rows={3} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              <FieldError errors={f.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <Button type="submit" disabled={form.state.isSubmitting || uploading}>
        Add moment
      </Button>
    </form>
  );
}
