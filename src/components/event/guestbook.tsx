import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";

// A short note from someone invited. The owner sees it on Activity as well.
export const Guestbook = ({ eventId, archived }: { eventId: Id<"events">; archived: boolean }) => {
  const { data: notes } = useQuery(queries.guestNotes.list({ eventId }));
  const leave = useMutation(api.guestNotes.leave);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSending(true);
    try {
      await leave({ eventId, text });
      setText("");
      toast.success("Note left");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-label="Guestbook" className="mx-auto w-full max-w-xl space-y-3 px-4 pb-10">
      <h2 className="font-semibold">Guestbook</h2>
      <p className="text-sm text-muted-foreground">Leave a short note. The owner sees it in Activity.</p>
      {notes?.map((note) => (
        <p key={note._id} className="text-sm">
          <span className="font-medium">{note.authorName ?? "Someone"}</span>
          <span className="text-muted-foreground"> · </span>
          {note.text}
        </p>
      ))}
      {!archived && (
        <form onSubmit={(e) => void submit(e)} className="space-y-2">
          <Textarea
            aria-label="Guestbook note"
            value={text}
            maxLength={500}
            placeholder="A line for the book"
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={sending || text.trim() === ""}>
            Leave a note
          </Button>
        </form>
      )}
    </section>
  );
};
