/**
 * Shared, purely presentational helpers for tasks.
 * No data access here — labels, emoji and badge tones only.
 */

export const TASK_STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_progress: "In progress",
  submitted: "Submitted",
  needs_review: "Needs review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_EMOJI: Record<string, string> = {
  unassigned: "🆕",
  assigned: "📌",
  in_progress: "🧹",
  submitted: "📤",
  needs_review: "🔎",
  completed: "✅",
  cancelled: "🚫",
};

export function taskStatusLabel(status: string) {
  return TASK_STATUS_LABEL[status] ?? status;
}

export function taskStatusEmoji(status: string) {
  return TASK_STATUS_EMOJI[status] ?? "•";
}

export function taskStatusTone(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "secondary";
  if (status === "needs_review") return "destructive";
  if (status === "in_progress" || status === "submitted") return "default";
  return "outline";
}

/** Local-midnight key so calendar grouping never drifts across timezones. */
export function dayKey(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday-start week containing `from`. */
export function weekDays(from: Date): Date[] {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function timeLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
