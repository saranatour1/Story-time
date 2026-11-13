import { useMutation } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { useId } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
import { localDay, localMidnight } from "@/components/event/event-dates";
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

const localMidnightOrNull = (day: string) => (day ? localMidnight(day) : null);
const localDayOrEmpty = (ms?: number) => (ms ? localDay(ms) : "");

export const EventDetailsForm = ({ event, onDone }: { event: EventView; onDone?: () => void }) => {
  const update = useMutation(api.events.update);
  const id = useId();
  const form = useForm({
    defaultValues: {
      title: event.status === "draft" ? "" : event.title,
      description: event.description ?? "",
      startsAt: localDayOrEmpty(event.startsAt),
      endsAt: localDayOrEmpty(event.endsAt),
    },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      try {
        await update({
          eventId: event._id,
          title: value.title.trim(),
          description: value.description,
          startsAt: localMidnightOrNull(value.startsAt),
          endsAt: localMidnightOrNull(value.endsAt),
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
              <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
              <Input
                id={`${id}-title`}
                autoFocus
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
              <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
              <Textarea
                id={`${id}-description`}
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
                <FieldLabel htmlFor={`${id}-startsAt`}>Starts</FieldLabel>
                <Input
                  id={`${id}-startsAt`}
                  type="date"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="endsAt">
            {(f) => (
              <Field data-invalid={f.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={`${id}-endsAt`}>Ends</FieldLabel>
                <Input
                  id={`${id}-endsAt`}
                  type="date"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
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
};
