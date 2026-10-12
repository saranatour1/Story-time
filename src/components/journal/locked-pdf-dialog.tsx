import { useAuthToken } from "@convex-dev/auth/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { CopyIcon, LoaderCircleIcon, LockKeyholeIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { deleteMedia, uploadJournalPdf } from "@/lib/upload";
import { lockPdf, newPassword } from "./locked-pdf";
import { FONTS } from "./look";

// The whole journal as a PDF that opens only with a password, put on the
// share link. The browser prints and locks it; the server keeps the file
// encrypted and the password under the experience's key, for its owner.
export function LockedPdfDialog({
  event,
  pages,
  open,
  onOpenChange,
  print,
}: {
  event: EventView;
  pages: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The whole book as an unlocked PDF, printed by the journal.
  print: () => Promise<Blob>;
}) {
  const current = useQuery(api.pdf.get, open ? { eventId: event._id } : "skip");
  const link = useQuery(api.share.link, open ? { eventId: event._id } : "skip");
  const setPdf = useMutation(api.pdf.set);
  const dropPdf = useMutation(api.pdf.drop);
  const token = useAuthToken();
  const [password, setPassword] = useState(newPassword);
  const [step, setStep] = useState<string | null>(null);

  const copy = (text: string) =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success("Password copied"),
      () => toast.error("Couldn't copy it. Select it and copy it yourself."),
    );

  async function make() {
    if (!token) return;
    try {
      setStep("Printing the pages…");
      const pdf = await print();
      setStep("Locking it…");
      const locked = await lockPdf(pdf, password);
      setStep("Putting it on the link…");
      const mediaId = await uploadJournalPdf(locked, event._id, token);
      const replaced = await setPdf({ eventId: event._id, mediaId: mediaId as Id<"media">, password, pages });
      if (replaced) await deleteMedia(replaced, token);
      toast.success("The locked PDF is on the share link. Send the password separately.");
      setPassword(newPassword());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStep(null);
    }
  }

  async function stop() {
    if (!token) return;
    try {
      const old = await dropPdf({ eventId: event._id });
      if (old) await deleteMedia(old, token);
      toast.success("The PDF is off the share link and deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => step === null && onOpenChange(next)}>
      <DialogContent className="paper-scope max-w-md bg-[#f6efe0] text-[#1f1a16]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: FONTS.hand, fontSize: 30, fontWeight: 400 }}>A locked PDF</DialogTitle>
          <DialogDescription className="text-stone-600">
            The whole journal ({pages} {pages === 1 ? "page" : "pages"}) as one PDF that opens only with a password. Anyone with the share link can download it; send the password another way, in a message.
          </DialogDescription>
        </DialogHeader>

        {current && (
          <div className="space-y-2 rounded-md border border-stone-300 bg-white/70 p-3 text-sm">
            <p>
              On the share link since {new Date(current.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}, {current.pages}{" "}
              {current.pages === 1 ? "page" : "pages"}.
            </p>
            {current.password && (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-[#efe6d2] px-2 py-1 font-mono">{current.password}</code>
                <Button size="sm" variant="outline" onClick={() => copy(current.password!)}>
                  <CopyIcon aria-hidden /> Copy
                </Button>
              </div>
            )}
            <Button size="sm" variant="ghost" className="text-[#a3402a]" disabled={step !== null} onClick={() => void stop()}>
              Take it off the link
            </Button>
          </div>
        )}

        {link === null && (
          <p className="text-sm text-stone-600">
            The share link is off, so nobody can download it yet.{" "}
            <Link to="/e/$id/shared" params={{ id: event._id }} className="underline">
              Switch it on in Shared
            </Link>
            .
          </p>
        )}

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void make();
          }}
        >
          <label className="block text-sm font-medium" htmlFor="locked-pdf-password">
            {current ? "Password for a new one" : "Password"}
          </label>
          <div className="flex gap-2">
            <Input
              id="locked-pdf-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              className="bg-white/80 font-mono"
            />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setPassword(newPassword())}>
              New
            </Button>
          </div>
          <Button type="submit" className="w-full" disabled={step !== null || password.length < 8 || pages === 0}>
            {step ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <LockKeyholeIcon aria-hidden />} {step ?? (current ? "Replace it with a new locked PDF" : "Make the locked PDF")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
