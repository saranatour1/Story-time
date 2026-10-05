import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { ImageIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deletePhotos } from "@/lib/actions";
import { errorMessage } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, uploadPhoto } from "@/lib/upload";

const MOODS = ["😊", "😍", "😌", "😂", "🥹", "😴"];

const schema = z.object({
  startsAt: z.string().min(1, "Pick a date and time"),
  place: z.string().max(200, "At most 200 characters"),
  links: z.array(
    z.string().refine((s) => s === "" || /^https?:\/\/\S+$/.test(s), "Enter a full link starting with http:// or https://"),
  ),
  notes: z.array(z.string().max(5000, "At most 5000 characters")),
  feeling: z.string().max(5000, "At most 5000 characters"),
  mood: z.string(),
});

type Photo = { mediaId: Id<"media">; name: string };

// <input type="datetime-local"> wants local time without a zone.
function toLocalInput(ms: number) {
  const offset = new Date(ms).getTimezoneOffset();
  return new Date(ms - offset * 60_000).toISOString().slice(0, 16);
}

// Creates a moment, or edits one when `moment` is given. `day` (YYYY-MM-DD)
// prefills a new moment's date, at noon.
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

  const linkBlocks = moment?.blocks.flatMap((b) => (b.type === "link" ? [b] : [])) ?? [];
  const noteTexts = moment?.blocks.flatMap((b) => (b.type === "note" ? [b.text] : [])) ?? [];
  const feeling = moment?.blocks.find((b) => b.type === "feeling");
  // Link titles aren't editable here; keep them for links that stay.
  const linkTitles = new Map(linkBlocks.flatMap((l) => (l.title ? [[l.url, l.title] as const] : [])));

  const [photos, setPhotos] = useState<Photo[]>(() =>
    (moment?.blocks ?? []).flatMap((b) =>
      b.type === "photo" ? [{ mediaId: b.mediaId, name: "Saved photo" }] : [],
    ),
  );
  const [uploading, setUploading] = useState(false);

  const form = useForm({
    defaultValues: {
      startsAt: moment ? toLocalInput(moment.startsAt) : day ? `${day}T12:00` : "",
      place: moment?.place ?? "",
      links: linkBlocks.length ? linkBlocks.map((l) => l.url) : [""],
      notes: noteTexts.length ? noteTexts : [""],
      feeling: feeling?.type === "feeling" ? feeling.text : "",
      mood: feeling?.type === "feeling" ? (feeling.mood ?? "") : "",
    },
    validators: { onChange: schema },
    onSubmit: async ({ value, formApi }) => {
      const blocks = [
        ...photos.map((p) => ({ type: "photo" as const, mediaId: p.mediaId })),
        ...value.links.filter(Boolean).map((url) => ({ type: "link" as const, url, title: linkTitles.get(url) })),
        ...value.notes.filter((n) => n.trim()).map((text) => ({ type: "note" as const, text })),
        ...(value.feeling.trim()
          ? [{ type: "feeling" as const, text: value.feeling, mood: value.mood || undefined }]
          : []),
      ];
      if (blocks.length === 0) {
        toast.error("Add a photo, link, note or feeling first");
        return;
      }
      const startsAt = new Date(value.startsAt).getTime();
      const tzOffsetMinutes = -new Date(value.startsAt).getTimezoneOffset();
      try {
        if (moment) {
          const { removedMediaIds } = await update({
            momentId: moment._id,
            startsAt,
            tzOffsetMinutes,
            place: value.place.trim(),
            blocks,
          });
          if (token) await deletePhotos(removedMediaIds, token);
          toast.success("Moment saved");
        } else {
          await create({
            eventId,
            startsAt,
            tzOffsetMinutes,
            place: value.place.trim() || undefined,
            blocks,
          });
          toast.success("Moment added");
          setPhotos([]);
          formApi.reset();
        }
        onDone?.();
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
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Mood">
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
      <div className="flex gap-2">
        <Button type="submit" disabled={form.state.isSubmitting || uploading}>
          {moment ? "Save moment" : "Add moment"}
        </Button>
        {moment && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
