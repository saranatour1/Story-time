import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type Region = "us" | "eu" | "au" | "ca";

const REGIONS: Array<{ value: Region; label: string; hint: string }> = [
  { value: "us", label: "United States", hint: "Closest for the Americas. The default." },
  { value: "eu", label: "Europe", hint: "Ireland. Closest for Europe, the Middle East and Africa." },
  { value: "au", label: "Australia", hint: "Sydney. Closest for Australia and Oceania." },
  { value: "ca", label: "Canada", hint: "Central. Keeps data in Canada." },
];

export function RegionForm({ region }: { region: Region }) {
  const update = useMutation(api.users.updateSettings);
  const [saved, setSaved] = useState<Region>(region);
  const [value, setValue] = useState<Region>(region);
  const [saving, setSaving] = useState(false);
  const dirty = value !== saved;

  async function save() {
    setSaving(true);
    try {
      await update({ region: value });
      setSaved(value);
      toast.success("Region saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <fieldset className="space-y-3">
        <legend className="sr-only">Data region</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {REGIONS.map((r) => (
            <label key={r.value} className="cursor-pointer">
              <input
                type="radio"
                name="region"
                value={r.value}
                checked={value === r.value}
                onChange={() => setValue(r.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "block h-full rounded-lg border p-4 transition-colors hover:bg-accent",
                  "peer-checked:border-primary peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                )}
              >
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Where new experiences are stored. Existing ones stay where they were created.
        </p>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          Save changes
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setValue(saved)} disabled={saving}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
