import type { Backdrop } from '../components/SheetCard'

/** The alcove every character card's portrait stands in (public/campaign/). */
export const CHARACTER_BACKDROP: Backdrop = {
  src: '/campaign/character-backdrop-1024.webp',
  srcSet:
    '/campaign/character-backdrop-512.webp 512w, /campaign/character-backdrop-1024.webp 1024w',
  sizes: '(min-width: 1024px) 270px, (min-width: 640px) 33vw, 50vw',
}
