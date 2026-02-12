export function elapsedMinutes(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60000;
}

export function isWithinSlaMinutes(start: Date, end: Date, thresholdMinutes: number): boolean {
  return elapsedMinutes(start, end) <= thresholdMinutes;
}
