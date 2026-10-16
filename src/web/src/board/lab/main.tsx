// Dev-only harness for looking at <Board> without the backend: /board-lab.html in
// `npx vite`, never part of the production build (that bundles index.html only).
//
// Query parameters:
//   fixture=gorge-crossing | crypt | river-ford | open-field (default gorge-crossing)
//   select=<token label>   draws that token as selected
//   highlight=free         shades every free walkable cell, like the setup screen
//   arrow=<label>:<x>,<y>  someone else's move preview of that token; repeatable
//   move=<label>:<x>,<y>   puts that token on another cell first, e.g. to stack tokens; repeatable
//   handlers=1             passes onCellTap/onTokenTap and logs the taps
//   header=1               puts the board under a 56 px bar, as on the app's pages
//   statuses=1             puts 0–5 sample statuses (letters, one with a level) on the tokens
//   inset=<px>             covers the board's bottom like the docked token card
// Double tap pings and double tap and drag draws an arrow (as "Mira"); the first
// character is Mira's, for "Meine Figur".
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import { Lab } from './Lab'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
