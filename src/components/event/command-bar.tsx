import { useQuery } from "@tanstack/react-query";
import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useMutation } from "convex/react";
import {
  ArrowUpIcon,
  ImagePlusIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PlayIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import { MAX_COMMAND_CHARS } from "../../../convex/lib/limits";
import { AuthImage } from "@/components/auth-image";
import { findPlace, type Geo } from "@/components/event/place-input";
import { canAddTo } from "@/components/event/quick-add";
import { VoiceButton } from "@/components/event/voice-button";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deletePhotos } from "@/lib/actions";
import { enrichMoment, plural } from "@/lib/add-moments";
import { addPhotos } from "@/lib/add-photos";
import { blocksForShelf, type ShelfItem } from "@/lib/command-shelf";
import { commandTakesSlash, pageClaimsSlash } from "@/lib/command-keys";
import { describeOp, placesToFind, withPins, type PlanOp } from "@/lib/command-plan";
import { errorMessage } from "@/lib/errors";
import { MEDIA_ACCEPT } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { track, trackAi } from "@/lib/analytics";

// The geocoder asks for one lookup at a time, spaced out.
const LOOKUP_GAP_MS = 1100;

type Plan = { summary: string; needs?: string; ops: PlanOp[] };

// Pins the places a plan names, one lookup at a time, near `near`.
const pin = async (ops: PlanOp[], near: Geo | undefined): Promise<PlanOp[]> => {
  const found = new Map<string, Geo>();
  for (const [i, name] of placesToFind(ops).entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, LOOKUP_GAP_MS));
    const hit = await findPlace(name, near);
    if (hit) found.set(name, hit.geo);
  }
  return withPins(ops, found);
};

// One box above the moments for everything: say what happened and it becomes
// a moment, as before; say what to change ("move this to Friday", "add Hanover
// as a stop by plane", "delete the second stop") and it shows the changes to
// approve first. Applying is one step, and all of it lands together. Words can
// be spoken (the mic) and photos can be attached: new files, or ones already
// in the trip that aren't on a moment. With photos, the words are what they
// are, and the photos become moments, as the Add button makes them.
export const CommandBar = ({
  event,
  openMomentId,
}: {
  event: EventView;
  openMomentId?: string;
}) => {
  const token = useAuthToken();
  const adding = canAddTo(event);
  const { data: moments } = useQuery(queries.moments.list({ eventId: event._id }));
  const { data: shelf } = useQuery(
    queries.media.unattached(adding ? { eventId: event._id } : "skip"),
  );
  const createMoment = useMutation(api.moments.create);
  const apply = useMutation(api.ai.command.apply);
  const propose = useAction(api.ai.command.propose);
  const enrich = useAction(api.ai.enrich.enrich);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "reading" | "applying">("idle");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState<ShelfItem[]>([]);
  const [shelfOpen, setShelfOpen] = useState(false);
  // Read at each call: tokens are short-lived and a batch can run for minutes.
  const latestToken = useRef(token);
  useEffect(() => {
    latestToken.current = token;
  }, [token]);
  // Slash focuses the box only when moment search is not on the page. That
  // search already uses /, and its listener runs first.
  useEffect(() => {
    if (!adding) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!commandTakesSlash(event, pageClaimsSlash())) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding]);
  // Small previews of the first few attached files, let go of when they change.
  const [previews, setPreviews] = useState<Array<{ name: string; url: string | null }>>([]);
  useEffect(() => {
    const made = files.slice(0, 4).map((file) => ({
      name: file.name,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setPreviews(made);
    return () => made.forEach((m) => m.url && URL.revokeObjectURL(m.url));
  }, [files]);

  if (!adding) return null;
  const said = text.trim();
  const busy = phase !== "idle";
  const lines = plan?.ops.map((op) => describeOp(op, moments ?? [])) ?? [];
  const destructive = lines.some((line) => line.destructive);

  const cancel = () => {
    setPlan(null);
    setProblem(null);
    input.current?.focus();
  };

  const toggleShelf = (item: ShelfItem) => {
    setPicked((now) =>
      now.some((chosen) => chosen.mediaId === item.mediaId)
        ? now.filter((chosen) => chosen.mediaId !== item.mediaId)
        : [...now, item],
    );
    setPlan(null);
  };

  // Something that happened, saved as a moment with only a note, stamped now.
  const addAsMoment = async (note: string) => {
    const momentId = await createMoment({
      eventId: event._id,
      startsAt: Date.now(),
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
      blocks: [{ type: "note", text: note }],
    });
    setText("");
    setPlan(null);
    enrichMoment(enrich, momentId, []);
    toast.success("Moment added");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((!said && files.length === 0 && picked.length === 0) || busy) return;
    setProblem(null);
    setPlan(null);
    setPhase("reading");
    try {
      // Photos already in the trip become one moment. The words are its note,
      // unless new files are going out too, in which case the words go with them.
      if (picked.length > 0) {
        const momentId = await createMoment({
          eventId: event._id,
          startsAt: Date.now(),
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
          blocks: blocksForShelf(picked, files.length > 0 ? "" : said),
        });
        enrichMoment(enrich, momentId, []);
        setPicked([]);
        setShelfOpen(false);
        if (files.length === 0) {
          setText("");
          toast.success("Moment added");
          return;
        }
      }
      // New files: they become moments, and the words say what they are.
      // Nothing to read or approve, so no plan.
      if (files.length > 0) {
        const made = await addPhotos({
          event,
          files,
          note: said,
          token: () => latestToken.current ?? undefined,
          createMoment,
          enrich,
        });
        if (made) {
          setFiles([]);
          setText("");
        }
        return;
      }
      const out = await trackAi(
        "box",
        propose({
          eventId: event._id,
          text: said,
          openMomentId,
          zone: -new Date().getTimezoneOffset(),
        }),
        (proposal) => proposal.kind,
      );
      if (out.kind === "new") {
        await addAsMoment(said);
        return;
      }
      const open = moments?.find((m) => m._id === openMomentId)?.geo;
      setPlan({ summary: out.summary, needs: out.needs, ops: await pin(out.ops, open) });
    } catch (error) {
      // The words stay in the box, so they can be sent again or saved as a moment.
      setProblem(errorMessage(error));
    } finally {
      setPhase("idle");
    }
  };

  const applyPlan = async () => {
    if (plan === null || plan.ops.length === 0 || busy) return;
    setPhase("applying");
    try {
      const done = await apply({ eventId: event._id, ops: plan.ops });
      track("ai_plan_applied", { changes: plan.ops.length });
      // Photos that went with a stop or a moment are cleared from storage too.
      if (token) await deletePhotos(done.removedMediaIds, token);
      for (const id of done.created) enrichMoment(enrich, id, []);
      toast.success(done.summary.charAt(0).toUpperCase() + done.summary.slice(1), {
        description: plan.summary || undefined,
      });
      setPlan(null);
      setText("");
    } catch (error) {
      // Nothing was changed; the plan stays, to try again or cancel.
      setProblem(errorMessage(error));
    } finally {
      setPhase("idle");
    }
  };

  // Applying is always deliberate: a click, or ⌘/Ctrl+Enter. Plain Enter only
  // ever reads a request, and focus never jumps to Apply on its own, so an
  // extra Enter can't apply a plan nobody has looked at yet.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && (plan !== null || problem !== null)) {
      e.stopPropagation();
      cancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && plan !== null) {
      e.preventDefault();
      void applyPlan();
    }
  };

  return (
    <div className="space-y-2" onKeyDown={onKeyDown}>
      <form
        onSubmit={(e) => void submit(e)}
        className="flex items-center gap-0.5 rounded-2xl border bg-background py-1 pr-1 pl-3 shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
        aria-label="Add or change something"
      >
        <SparklesIcon aria-hidden className="mr-1.5 size-4 shrink-0 text-muted-foreground" />
        <Input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (plan !== null) setPlan(null);
          }}
          placeholder="What happened, or what should change?"
          aria-label="What happened, or what should change?"
          title={moments !== undefined && moments.length > 0 ? undefined : "Press / to write here"}
          maxLength={MAX_COMMAND_CHARS}
          disabled={busy}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy || !token}
          aria-label="Attach photos or videos"
          title="Attach photos or videos"
          onClick={() => picker.current?.click()}
        >
          <ImagePlusIcon aria-hidden />
        </Button>
        {(shelf ?? []).length > 0 && (
          <Button
            type="button"
            size="icon-sm"
            variant={shelfOpen ? "secondary" : "ghost"}
            disabled={busy}
            aria-expanded={shelfOpen}
            aria-label="Photos already in this trip"
            title="Photos already in this trip"
            onClick={() => setShelfOpen((open) => !open)}
          >
            <ImagesIcon aria-hidden />
          </Button>
        )}
        {/* The words are spliced onto what is already there. */}
        <VoiceButton
          quiet
          disabled={busy}
          onText={(spoken) => setText((now) => (now.trim() ? `${now.trim()} ${spoken}` : spoken))}
        />
        <Button
          type="submit"
          size="icon-sm"
          className="ml-0.5 rounded-full"
          disabled={(!said && files.length === 0 && picked.length === 0) || busy}
          aria-label={
            phase === "reading"
              ? files.length > 0 || picked.length > 0
                ? "Adding"
                : "Reading"
              : "Go"
          }
          title="Go"
        >
          {phase === "reading" ? (
            <LoaderCircleIcon aria-hidden className="animate-spin" />
          ) : (
            <ArrowUpIcon aria-hidden />
          )}
        </Button>
      </form>
      <input
        ref={picker}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        tabIndex={-1}
        // Visually hidden rather than display:none: some browsers won't click those.
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          setFiles((now) => [...now, ...picked]);
          setPlan(null);
          // Cleared, so picking the same files again still fires.
          e.target.value = "";
        }}
      />

      {shelfOpen && (shelf ?? []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Already in this trip, and not on a moment yet.
          </p>
          <ul
            className="flex gap-1.5 overflow-x-auto pb-1"
            aria-label="Photos already in this trip"
          >
            {(shelf ?? []).map((item, i) => {
              const on = picked.some((chosen) => chosen.mediaId === item.mediaId);
              const video = item.mime.startsWith("video/");
              return (
                <li key={item.mediaId} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={video ? `Video ${i + 1}` : `Photo ${i + 1}`}
                    disabled={busy}
                    onClick={() => toggleShelf(item)}
                    className={cn(
                      "grid size-14 place-items-center overflow-hidden rounded-md border bg-muted",
                      on && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                    )}
                  >
                    {video ? (
                      <PlayIcon aria-hidden className="size-5" />
                    ) : (
                      <AuthImage
                        mediaId={item.mediaId}
                        alt=""
                        width={56}
                        height={56}
                        sizes="56px"
                        className="size-full rounded-none aspect-square"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {picked.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {picked.length} from this trip ·{" "}
            {files.length > 0
              ? "they'll be their own moment"
              : said
                ? "they'll be one moment, with your words as the note"
                : "they'll be one moment"}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Clear the photos from this trip"
            disabled={busy}
            onClick={() => setPicked([])}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      )}

      {files.length > 0 && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-label="Attached files"
        >
          <ul className="flex -space-x-1.5">
            {previews.map(({ name, url }, i) => (
              <li
                key={`${name}-${i}`}
                className="size-8 overflow-hidden rounded-md border bg-muted ring-2 ring-background"
              >
                {url ? (
                  <img src={url} alt="" className="size-full object-cover" />
                ) : (
                  <ImagePlusIcon aria-hidden className="m-2 size-4" />
                )}
              </li>
            ))}
          </ul>
          <span>
            {plural(files.length, "file")} ·{" "}
            {said
              ? "they'll be moments, with your words as the note"
              : "they'll be added as moments"}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Remove the attached files"
            disabled={busy}
            onClick={() => setFiles([])}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      )}

      <p role="status" className="sr-only">
        {phase === "reading"
          ? "Reading your request"
          : phase === "applying"
            ? "Applying the changes"
            : ""}
      </p>

      {problem !== null && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p>{problem}</p>
          <div className="flex gap-2">
            {plan === null && (
              <Button
                size="sm"
                variant="outline"
                disabled={!said || busy}
                onClick={() => {
                  setProblem(null);
                  setPhase("applying");
                  addAsMoment(said)
                    .catch((error: unknown) => setProblem(errorMessage(error)))
                    .finally(() => setPhase("idle"));
                }}
              >
                Add as a moment
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={cancel}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {plan !== null && (
        <section
          aria-label="Proposed changes"
          className="space-y-3 rounded-xl border bg-card p-3 text-sm"
        >
          {plan.summary && <p className="font-medium text-balance">{plan.summary}</p>}
          {lines.length > 0 && (
            <ul className="space-y-2">
              {lines.map((line, i) => (
                <li key={i} className={cn("space-y-0.5", line.destructive && "text-destructive")}>
                  <p className="flex items-center gap-1.5 font-medium">
                    {line.destructive && <Trash2Icon aria-hidden className="size-3.5 shrink-0" />}
                    {line.heading}
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground marker:text-border">
                    {line.changes.map((change) => (
                      <li
                        key={change}
                        className={line.destructive ? "text-destructive" : undefined}
                      >
                        {change}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {plan.needs && <p className="text-muted-foreground">{plan.needs}</p>}
          <div className="flex gap-2">
            {plan.ops.length > 0 && (
              <Button
                size="sm"
                variant={destructive ? "destructive" : "default"}
                disabled={busy}
                title="Apply (⌘ or Ctrl + Enter)"
                onClick={() => void applyPlan()}
              >
                {phase === "applying" ? "Applying…" : destructive ? "Apply and delete" : "Apply"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
              {plan.ops.length > 0 ? "Cancel" : "Close"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};
