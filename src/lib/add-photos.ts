import type { FunctionArgs } from "convex/server";
import { toast } from "sonner";
import type { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MOMENT_LIMIT } from "../../convex/lib/limits";
import { reversePlace } from "@/components/event/place-input";
import type { EventView } from "@/components/event/types";
import { deletePhotos } from "@/lib/actions";
import {
  momentsFromPlan,
  type Picked,
  type PlannedDay,
  plural,
  readPicked,
  uploadAll,
} from "@/lib/add-moments";
import { errorMessage } from "@/lib/errors";
import { groupPhotos, type PhotoDay, type PhotoStop } from "@/lib/photo-groups";

const LOOKUP_GAP_MS = 1100;

const namePlaces = async (days: PhotoDay[]): Promise<PlannedDay[]> => {
  const located = days
    .flatMap((d) => d.moments.flat())
    .flatMap((s) => (s.geo ? [{ stop: s, geo: s.geo }] : []));
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
};

const details = (problems: string[]): string => {
  const shown = problems.slice(0, 3).join(" · ");
  return problems.length > 3 ? `${shown} · and ${problems.length - 3} more` : shown;
};

// Without a date inside, a photo is dated by when its file was last saved,
// which is often when it was copied or downloaded, not when it was taken.
const undated = (picked: Picked[]): string | undefined => {
  const n = picked.filter((p) => p.guessed && p.kind === "photo").length;
  if (n === 0) return undefined;
  return `${plural(n, "photo")} had no date inside, so ${n === 1 ? "it's" : "they're"} dated by when the file was saved. Edit the moment to change it.`;
};

export const addPhotos = async (args: {
  event: Pick<EventView, "_id" | "momentCount">;
  files: File[];
  note?: string;
  currentToken: () => string | undefined;
  createMoment: (args: FunctionArgs<typeof api.moments.create>) => Promise<Id<"moments">>;
}): Promise<boolean> => {
  const { event, files, note, createMoment } = args;
  const token = args.currentToken();
  if (files.length === 0 || !token) return false;
  const toastId = toast.loading("Reading photos…");
  try {
    let n = 0;
    const { picked, problems: skipped } = await readPicked(files, new Set(), () => `p${n++}`);
    if (picked.length === 0) {
      toast.error(`Nothing to add · ${plural(skipped.length, "problem")}`, {
        id: toastId,
        description: details(skipped),
      });
      return false;
    }
    const days = groupPhotos(picked.map((p) => p.point));
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
    const naming = namePlaces(days);

    const { uploaded, failures } = await uploadAll(
      picked.map((p) => ({ id: p.point.id, file: p.file })),
      event._id,
      () => args.currentToken() ?? token,
      (done, total) =>
        toast.loading(`Uploading ${Math.min(done + 1, total)} of ${total}…`, { id: toastId }),
    );

    const problems = [...skipped, ...failures];
    const moments = momentsFromPlan(await naming, uploaded, (id) => pickedOf.get(id)?.kind);
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
        const first = created === 0 && words !== undefined;
        const create = first
          ? { ...m.create, blocks: [...m.create.blocks, { type: "note" as const, text: words }] }
          : m.create;
        await createMoment({ eventId: event._id, ...create });
        created++;
        for (const u of m.uses) used.add(u.mediaId);
      } catch (e) {
        problems.push(`${m.label}: ${errorMessage(e)}`);
      }
    }

    const unused = [...uploaded.values()].filter((id) => !used.has(id));
    if (unused.length > 0) await deletePhotos(unused, args.currentToken() ?? token);
    const added = `Added ${plural(created, "moment")}`;
    if (created === 0) {
      toast.error(`No moments were added · ${plural(problems.length, "problem")}`, {
        id: toastId,
        description: details(problems),
      });
    } else if (problems.length > 0) {
      toast.warning(`${added} · ${plural(problems.length, "problem")}`, {
        id: toastId,
        description: [details(problems), undated(picked)].filter(Boolean).join(" · "),
      });
    } else {
      toast.success(added, { id: toastId, description: undated(picked) });
    }
    return created > 0;
  } catch (e) {
    toast.error(errorMessage(e), { id: toastId });
    return false;
  }
};
