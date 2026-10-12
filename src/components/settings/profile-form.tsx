import { useMutation } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { useId } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
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

function emailHint(user: { email?: string; pendingEmail?: string; emailVerified: boolean }): string {
  if (user.pendingEmail) {
    return user.emailVerified
      ? "Check your inbox to confirm this address. Until then, the confirmed one stays in use."
      : "Check your inbox. This address isn't used until you confirm it.";
  }
  if (user.emailVerified) {
    return "Confirmed. Replies to mail you send come here, and a memory reminder can too. Never used to sign you in.";
  }
  return "Not used until you confirm it. Never used to sign you in.";
}

export function ProfileForm({
  user,
}: {
  user: { displayName?: string; username?: string; email?: string; pendingEmail?: string; emailVerified: boolean };
}) {
  const update = useMutation(api.users.updateSettings);
  const resend = useMutation(api.users.resendEmailVerification);
  // Unique ids, so labels stay tied to their inputs wherever this renders.
  const id = useId();
  const form = useForm({
    defaultValues: {
      displayName: user.displayName ?? "",
      username: user.username ?? "",
      email: user.pendingEmail ?? user.email ?? "",
    },
    validators: { onChange: schema },
    onSubmit: async ({ value, formApi }) => {
      try {
        // Empty strings are sent as-is: the server treats "" as "clear".
        const saved = await update(value);
        // The saved values become the new baseline, so Save disables again.
        formApi.reset(value);
        toast.success(
          saved.emailStatus === "sent"
            ? "Check your inbox to confirm that address"
            : saved.emailStatus === "waiting"
              ? "Saved. Email isn't set up, so that address isn't confirmed yet"
              : "Profile saved",
        );
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
              <FieldLabel htmlFor={`${id}-displayName`}>Display name (optional)</FieldLabel>
              <Input id={`${id}-displayName`} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              <FieldDescription>Only shown to people you share with. Leave empty to stay anonymous.</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="username">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={`${id}-username`}>Username (optional)</FieldLabel>
              <Input id={`${id}-username`} autoComplete="username" placeholder="sara_01" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              <FieldDescription>Unique. Lowercase letters, numbers and underscores, 3 to 20 characters.</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={`${id}-email`}>Email (optional)</FieldLabel>
              <Input id={`${id}-email`} type="email" autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
              <FieldDescription>{emailHint(user)}</FieldDescription>
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
            {user.pendingEmail && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void resend({})
                    .then((r) => {
                      toast.success(r.emailed ? "Confirmation sent" : "Email isn't set up, so nothing was sent");
                    })
                    .catch((e: unknown) => toast.error(errorMessage(e)));
                }}
              >
                Send the confirmation again
              </Button>
            )}
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
