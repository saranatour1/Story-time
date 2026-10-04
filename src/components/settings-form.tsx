import { useMutation } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";

export type Region = "us" | "eu" | "au" | "ca";

const REGIONS: Array<{ value: Region; label: string }> = [
  { value: "us", label: "United States" },
  { value: "eu", label: "Europe (Ireland)" },
  { value: "au", label: "Australia (Sydney)" },
  { value: "ca", label: "Canada (Central)" },
];

const schema = z.object({
  displayName: z.string().max(60, "Keep it under 60 characters"),
  region: z.enum(["us", "eu", "au", "ca"]),
});

// Shared by the footer modal and the /settings page.
export function SettingsForm({
  user,
  onSaved,
}: {
  user: { displayName?: string; region: Region };
  onSaved?: () => void;
}) {
  const update = useMutation(api.users.updateSettings);
  const form = useForm({
    defaultValues: { displayName: user.displayName ?? "", region: user.region },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      try {
        await update({
          displayName: value.displayName.trim() || undefined,
          region: value.region,
        });
        toast.success("Settings saved");
        onSaved?.();
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
        <form.Field name="displayName">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="displayName">Display name (optional)</FieldLabel>
              <Input
                id="displayName"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldDescription>
                Only shown to people you share with. Leave empty to stay anonymous.
              </FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="region">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="region">Data region</FieldLabel>
              <select
                id="region"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as Region)}
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                Where new experiences are stored. Existing ones stay where they were
                created. Defaults to the United States.
              </FieldDescription>
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <Button type="submit" disabled={form.state.isSubmitting}>
        Save
      </Button>
    </form>
  );
}
