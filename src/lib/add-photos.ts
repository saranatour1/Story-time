import type { FunctionArgs } from "convex/server";
import { toast } from "sonner";
import type { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MOMENT_LIMIT } from "../../convex/lib/limits";
import { reversePlace } from "@/components/event/place-input";
import type { EventView } from "@/components/event/types";
import { deletePhotos } from "@/lib/actions";
import {
  type Enrich,
  enrichMoment,
  momentsFromPlan,
  type Picked,
  type PlannedDay,
  plural,
  readPicked,
  samplePhotos,
  uploadAll,
} from "@/lib/add-moments";
import { errorMessage } from "@/lib/errors";
import { groupPhotos, type PhotoDay, type PhotoStop } from "@/lib/photo-groups";
import { thumbnail } from "@/lib/thumbs";

// The geocoder asks for one lookup at a time, spaced out.
const LOOKUP_GAP_MS = 1100;

// Names each located stop from its coordinates, so the moments get a place
// and a map pin. Runs while the uploads do; a stop it can't name stays unnamed.
async function namePlaces(days: PhotoDay[]): Promise<PlannedDay[]> {
  const located = days.flatMap((d) => d.moments.flat()).flatMap((s) => (s.geo ? [{ stop: s, geo: s.geo }] : []));
  const names = new Map<PhotoStop, string>();
  for (const [i, { stop, geo }] of located.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, LOOKUP_GAP_MS));
    const place = await reversePlace(geo);
    if (place) names.set(stop, place);
  }
  return days.map((d) => ({
    day: d.day,
    moments: d.moments.map((stops) => stops.map((s) => ({ ...s, place: names.get(s) }))),
  }));
}

// The first few problems, for a toast's description.
function details(problems: string[]): string {
  const shown = problems.slice(0, 3).join(" · ");
  return problems.length > 3 ? `${shown} · and ${problems.length - 3} more` : shown;
}

// Reads, uploads and plans the picked photos and videos, then makes their
// moments: grouped as the review sheet groups them, each with its AI note.
// `note`, when given, is the person's own words: it becomes the first moment's
// note as written, and guides the notes the AI drafts for the rest. Returns
// whether any moment was made. Progress and problems are shown as toasts.
export async function addPhotos(args: {
  event: Pick<EventView, "_id" | "momentCount">;
  files: File[];
  note?: string;
  // Read at each call: tokens are short-lived and a batch can run for minutes.
  token: () => string | undefined;
  createMoment: (args: FunctionArgs<typeof api.moments.create>) => Promise<Id<"moments">>;
  enrich: Enrich;
}): Promise<boolean> {
  const { event, files, note, createMoment, enrich } = args;
  const token = args.token();
  if (files.length === 0 || !token) return false;
  const toastId = toast.loading("Reading photos…");
  try {
    let n = 0;
    const { picked, problems: skipped } = await readPicked(files, new Set(), () => `p${n++}`);
    if (picked.length === 0) {
      toast.error(`Nothing to add · ${plural(skipped.length, "problem")}`, { id: toastId, description: details(skipped) });
      return false;
    }
    const days = groupPhotos(picked.map((p) => p.point));
    // Checked before anything uploads, so no photo goes up that can't be added.
    const planned = days.reduce((count, d) => count + d.moments.length, 0);
    const left = Math.max(0, MOMENT_LIMIT - event.momentCount);
    if (planned > left) {
      toast.error(
        `These photos make ${plural(planned, "moment")}, and this experience has room for ${left}. Choose fewer.`,
        { id: toastId },
      );
      return false;
    }

    const pickedOf = new Map<string, Picked>(picked.map((p) => [p.point.id, p]));
    const picksOf = (stops: PhotoStop[]) => stops.flatMap((s) => s.photos).flatMap((p) => pickedOf.get(p.id) ?? []);
    // The AI's thumbnails and the place names are made while the uploads run.
    for (const stops of days.flatMap((d) => d.moments)) {
      for (const p of samplePhotos(picksOf(stops))) void thumbnail(p.file);
    }
    const naming = namePlaces(days);

    const { uploaded, failures } = await uploadAll(
      picked.map((p) => ({ id: p.point.id, file: p.file })),
      event._id,
      () => args.token() ?? token,
      (done, total) => toast.loading(`Uploading ${Math.min(done + 1, total)} of ${total}…`, { id: toastId }),
    );

    const problems = [...skipped, ...failures];
    const moments = momentsFromPlan(await naming, uploaded, (id) => pickedOf.get(id)?.kind);
    // Media ids now on a saved moment; any other upload gets deleted.
    const used = new Set<string>();
    let created = 0;
    const words = note?.trim() || undefined;
    for (const [i, m] of moments.entries()) {
      toast.loading(`Creating moment ${i + 1} of ${moments.length}…`, { id: toastId });
      if (!m.create) {
        problems.push(`${m.label}: none of its photos uploaded`);
        continue;
      }
      try {
        // The person's words go on the first moment made, after its photos.
        const first = created === 0 && words !== undefined;
        const create = first ? { ...m.create, blocks: [...m.create.blocks, { type: "note" as const, text: words }] } : m.create;
        const momentId = await createMoment({ eventId: event._id, ...create });
        created++;
        for (const u of m.uses) used.add(u.mediaId);
        enrichMoment(
          enrich,
          momentId,
          m.uses.flatMap((u) => {
            const p = pickedOf.get(u.photoId);
            return p ? [{ mediaId: u.mediaId, file: p.file }] : [];
          }),
          words,
        );
      } catch (e) {
        problems.push(`${m.label}: ${errorMessage(e)}`);
      }
    }

    const unused = [...uploaded.values()].filter((id) => !used.has(id));
    if (unused.length > 0) await deletePhotos(unused, args.token() ?? token);
    const added = `Added ${plural(created, "moment")}`;
    if (created === 0) {
      toast.error(`No moments were added · ${plural(problems.length, "problem")}`, { id: toastId, description: details(problems) });
    } else if (problems.length > 0) {
      toast.warning(`${added} · ${plural(problems.length, "problem")}`, { id: toastId, description: details(problems) });
    } else {
      toast.success(`${added} · writing the notes…`, { id: toastId });
    }
    return created > 0;
  } catch (e) {
    toast.error(errorMessage(e), { id: toastId });
    return false;
  }
}
