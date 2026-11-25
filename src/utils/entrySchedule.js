const MANILA_TIME_ZONE = 'Asia/Manila';

export function getEntrySchedule(entryStartAt, entryEndAt, now = Date.now()) {
  if (!entryStartAt && !entryEndAt) {
    return { state: 'unscheduled', isOpen: true, target: null };
  }

  const start = Date.parse(entryStartAt);
  const end = Date.parse(entryEndAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { state: 'invalid', isOpen: false, target: null };
  }
  if (now < start) return { state: 'upcoming', isOpen: false, target: start };
  if (now >= end) return { state: 'ended', isOpen: false, target: null };
  return { state: 'open', isOpen: true, target: end };
}

export function getCountdownParts(target, now = Date.now()) {
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

export function toManilaDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: MANILA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).map(({ type, value: partValue }) => [type, partValue])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function fromManilaDateTimeInput(value) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return '';
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || toManilaDateTimeInput(date.toISOString()) !== value) return '';
  return date.toISOString();
}

export function formatManilaDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}
