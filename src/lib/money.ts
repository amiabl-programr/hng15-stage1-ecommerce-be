/**
 * Currency and date formatting utilities for Nigerian Naira and local time.
 * Pure functions with zero external dependencies (no clsx, no tailwind).
 */

export function formatCurrency(amount: number | string): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numeric)) return '₦0';

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function formatDateTime(isoString: string | Date): string {
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
