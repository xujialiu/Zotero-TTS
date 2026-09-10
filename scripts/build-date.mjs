/**
 * The date and the time stamped into a build, as the About section of the
 * settings pane shows them. Local, not UTC: they answer "when did I build
 * this", asked by whoever is sitting at the machine that built it.
 */
const pad = (n) => String(n).padStart(2, '0');

export function buildDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 24-hour and to the second, with the offset the building machine was on: two builds of the same version are told apart by it. */
export function buildTimeString(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${timeZoneString(date)}`;
}

/** `UTC+8`, `UTC+5:30`, `UTC-3:30`, `UTC+0` — the whole hours bare, the odd half hour spelled out. */
export function timeZoneString(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `UTC${offset < 0 ? '-' : '+'}${hours}${minutes ? `:${pad(minutes)}` : ''}`;
}
