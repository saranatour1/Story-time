export type CalendarView = "month" | "week" | "day" | "agenda";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: EventColor;
  location?: string;
  // Story-time: an event the viewer may open but not drag to new dates.
  readOnly?: boolean;
}

export type EventColor = "sky" | "amber" | "violet" | "rose" | "emerald" | "orange";
