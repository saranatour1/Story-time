import { useMutation } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";

const schema = z
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

export function EventDetailsForm({ event, onDone }: { event: EventView; onDone?: () => void }) {
  const update = useMutation(api.events.update);
  const form = useForm({
    defaultValues: {
      // A new draft starts with a placeholder title; show an empty field instead.
      title: event.status === "draft" ? "" : event.title,
      description: event.description ?? "",
      startsAt: fromDate(event.startsAt),
      endsAt: fromDate(event.endsAt),
    },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      try {
        await update({
          eventId: event._id,
          title: value.title.trim(),
          description: value.description,
          startsAt: toDate(value.startsAt),
          endsAt: toDate(value.endsAt),
        });
        toast.success("Details saved");
        onDone?.();
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
              <Input id="title" autoFocus placeholder="Lisbon, summer 2026" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} />
              {f.state.meta.isTouched && <FieldError errors={f.state.meta.errors} />}
            </Field>
          )}
        </form.Field>
        <form.Field name="description">
          {(f) => (
            <Field data-invalid={f.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea id="description" rows={4} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} />
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
        Save details
      </Button>
    </form>
  );
}
