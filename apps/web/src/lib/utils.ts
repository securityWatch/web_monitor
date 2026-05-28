import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUptime(v?: number | null) {
  if (v == null) return '—';
  return `${v.toFixed(2)}%`;
}

export function formatMs(v?: number | null) {
  if (v == null) return '—';
  return `${v}ms`;
}

export function greetingKey(hour: number) {
  if (hour < 12) return 'greeting';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}
