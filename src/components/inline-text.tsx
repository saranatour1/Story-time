import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export const InlineText = ({
  value,
  onSave,
  label,
  multiline = false,
  disabled = false,
  placeholder = "",
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  label: string;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const savedOrCancelled = useRef(false);

  if (!editing) {
    if (disabled) {
      return value ? <div className={cn("whitespace-pre-wrap", className)}>{value}</div> : null;
    }
    return (
      <button
        type="button"
        aria-label={`Edit ${label}`}
        onClick={() => {
          savedOrCancelled.current = false;
          setDraft(value);
          setEditing(true);
        }}
        className={cn(
          "-mx-1.5 block w-full cursor-text rounded-md px-1.5 text-left whitespace-pre-wrap hover:bg-accent/60",
          className,
        )}
      >
        {value || <span className="text-muted-foreground/70">{placeholder}</span>}
      </button>
    );
  }

  const commit = async () => {
    if (savedOrCancelled.current) return;
    savedOrCancelled.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next === value.trim()) return;
    try {
      await onSave(next);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const shared = {
    autoFocus: true,
    value: draft,
    "aria-label": label,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => void commit(),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        savedOrCancelled.current = true;
        setEditing(false);
      } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void commit();
      }
    },
  };

  return multiline ? (
    <Textarea rows={3} className={className} {...shared} />
  ) : (
    <Input className={cn("h-auto py-1", className)} {...shared} />
  );
};
