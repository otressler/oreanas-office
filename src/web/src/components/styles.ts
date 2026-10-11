// Shared Tailwind classes for controls. Touch targets are at least 44 px high and
// inputs use 16 px text, so iOS doesn't zoom into them.

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-candle font-semibold text-table hover:bg-candle-strong disabled:opacity-60',
  secondary: 'border border-line text-parchment hover:border-candle disabled:opacity-60',
  quiet: 'text-dim hover:text-parchment disabled:opacity-60',
}

export function buttonClass(variant: ButtonVariant = 'secondary', extra = ''): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base ${buttonVariants[variant]} ${extra}`
}

export const inputClass =
  'min-h-11 w-full rounded-lg border border-line bg-table px-3 py-2 text-base text-parchment placeholder:text-dim/60 focus:border-candle focus:outline-none aria-[invalid=true]:border-red-400'
