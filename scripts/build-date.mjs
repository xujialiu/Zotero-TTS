/**
 * The date stamped into a build, as the Build section of the settings pane
 * shows it. Local time, not UTC: it answers "when did I build this", asked by
 * whoever is sitting at the machine that built it.
 */
export function buildDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
