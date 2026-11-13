import { useDroppable } from "@dnd-kit/core";

import { useCalendarDnd } from "@/components/ui/event-calendar";
import { cn } from "@/lib/utils";

interface DroppableCellProps {
  id: string;
  date: Date;
  hourOfDay?: number;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function DroppableCell({
  id,
  date,
  hourOfDay,
  children,
  className,
  onClick,
}: DroppableCellProps) {
  const { activeEvent } = useCalendarDnd();

  const { setNodeRef, isOver } = useDroppable({
    data: {
      date,
      hourOfDay,
    },
    id,
  });

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden px-0.5 py-1 data-dragging:bg-accent sm:px-1",
        className,
      )}
      data-dragging={isOver && activeEvent ? true : undefined}
      onClick={onClick}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}
