export type ActiveToolbarPopover = "compress" | "redact" | "mergeSplit" | "watermark" | "pageNumbers" | "more" | null;

export function toggleToolbarPopover(
  current: ActiveToolbarPopover,
  next: Exclude<ActiveToolbarPopover, null>,
): ActiveToolbarPopover {
  return current === next ? null : next;
}
