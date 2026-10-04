import { useMutation } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";

const schema = z.object({
  displayName: z.string().max(60, "Keep it under 60 characters"),
  username: z
    .string()
    .refine((v) => v === "" || /^[a-zA-Z0-9_]{3,20}$/.test(v.trim()), "Use 3 to 20 letters, numbers or underscores"),
  email: z
    .string()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), "Enter a valid email address"),
});

export function ProfileForm({
  user,
}: {
  user: { displayName?: string; username?: string; email?: string };
}) {
  const update = useMutation(api.users.updateSettings);
  const form = useForm({
    defaultValues: {
      displayName: user.displayName ?? "",
      username: user.username ?? "",
      email: user.email ?? "",
    },
    validators: { onChange: schema },
    onSubmit: async ({ value, formApi }) => {
      try {
        // Empty strings are sent as-is: the server treats "" as "clear".
        await update(value);
        // The saved values become the new baseline, so Save disables again.
        formApi.reset(value);
        toast.success("Profile saved");
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  });

  return (
    <form
      className="max-w-lg space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="displayName">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="displayName">Display name (optional)</FieldLabel>
              <Input id="displayName" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              <FieldDescription>Only shown to people you share with. Leave empty to stay anonymous.</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="username">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="username">Username (optional)</FieldLabel>
              <Input id="username" autoComplete="username" placeholder="sara_01" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              <FieldDescription>Unique. Lowercase letters, numbers and underscores, 3 to 20 characters.</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="email">Email (optional)</FieldLabel>
              <Input id="email" type="email" autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              <FieldDescription>Not verified and never used to sign you in. Leave empty to share nothing.</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <form.Subscribe selector={(state) => [state.isDirty, state.isSubmitting, state.canSubmit] as const}>
        {([isDirty, isSubmitting, canSubmit]) => (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!isDirty || isSubmitting || !canSubmit}>
              Save changes
            </Button>
            {isDirty && !isSubmitting && (
              <Button type="button" variant="ghost" onClick={() => form.reset()}>
                Reset
              </Button>
            )}
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
