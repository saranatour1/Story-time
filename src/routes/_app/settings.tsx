import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

const REGIONS = [
  { value: "us", label: "United States" },
  { value: "eu", label: "Europe (Ireland)" },
  { value: "au", label: "Australia (Sydney)" },
  { value: "ca", label: "Canada (Central)" },
] as const;

const schema = z.object({
  displayName: z.string().max(60, "Keep it under 60 characters"),
  region: z.enum(["us", "eu", "au", "ca"]),
});

function Settings() {
  const user = useQuery(api.users.getCurrentUser);
  if (user === undefined) return <Skeleton className="h-64 max-w-md" />;
  if (user === null) return null;
  return <SettingsForm user={user} />;
}

function SettingsForm({
  user,
}: {
  user: { displayName?: string; region: "us" | "eu" | "au" | "ca" };
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
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  });

  return (
    <form
      className="max-w-md space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
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
                Only shown to people you share with. Leave empty to stay
                anonymous.
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
                onChange={(e) =>
                  field.handleChange(e.target.value as typeof field.state.value)
                }
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                Where new experiences are stored. Existing ones stay where they
                were created. Defaults to the United States.
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
