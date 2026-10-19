// The dice tray's shadow-DOM stylesheet. The colours come from the app's theme
// (index.css @theme), which custom properties carry into the shadow root; the
// fallbacks are the same values, for the tray on a page without the theme.
// Flat bordered panels, 8px controls, 44px touch targets, like components/styles.ts.
export const DICE_ROLLER_CSS = `
:host{
  --dr-table:var(--color-table,#14161B); --dr-panel:var(--color-panel,#1D2027); --dr-line:var(--color-line,#2C3039);
  --dr-ink:var(--color-parchment,#ECE6D8); --dr-muted:var(--color-dim,#A9A397);
  --dr-accent:var(--color-candle,#E0AD4F); --dr-accent-strong:var(--color-candle-strong,#F0C46E); --dr-accent-ink:var(--dr-table);
  --dr-tray:var(--dr-table); --dr-danger:#F28B82;
  --dr-spark:#F8E2AE; --dr-spark-glow:rgba(240,196,110,.9); --dr-doom:rgba(230,40,56,.55); --dr-doom-deep:rgba(140,0,20,.35);
  --dr-glory:rgba(240,196,110,.5); --dr-glory-deep:rgba(224,173,79,.22);
  --dr-radius:12px; --dr-control-radius:8px;
  --dr-numerals:"Avenir Next Condensed","Bahnschrift","DIN Condensed","Roboto Condensed","sans-serif-condensed","Arial Narrow",system-ui,sans-serif;
  display:block; color:var(--dr-ink); line-height:1.5; color-scheme:dark;
  -webkit-font-smoothing:antialiased; -webkit-tap-highlight-color:transparent;
}
:host([hidden]){display:none}
*,*::before,*::after{box-sizing:border-box}
:focus-visible{outline:2px solid var(--dr-accent); outline-offset:2px}

.wrap{container:dr/inline-size; background:var(--dr-panel); border:1px solid var(--dr-line); border-radius:var(--dr-radius); padding:16px; display:flex; flex-direction:column; gap:12px}
/* Inside a dialog that already is the panel */
:host([bare]) .wrap{background:none; border:0; border-radius:0; padding:0}

.tray{position:relative; border-radius:var(--dr-control-radius); background:var(--dr-tray); border:1px solid var(--dr-line); padding:12px 16px 16px; display:flex; flex-direction:column; min-height:228px;
  box-shadow:inset 0 2px 12px rgba(0,0,0,.35)}
/* Candlelight falling on the table from above */
.tray::before{content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; background:radial-gradient(120% 70% at 50% 0%,color-mix(in srgb,var(--dr-accent) 6%,transparent),transparent 62%)}

.dice{position:relative; flex:1; display:flex; flex-wrap:wrap; align-content:center; justify-content:center; gap:16px 12px; padding:16px 0 20px; min-height:144px; --die:64px}
.dice.has-drops{row-gap:32px}
.empty{position:absolute; inset:0; display:grid; place-items:center; margin:0; padding:0 16px; text-align:center; color:var(--dr-muted); font-size:15px; line-height:1.45; pointer-events:none; transition:opacity .2s .18s}
.empty.off{opacity:0; transition-delay:0s}

.die{all:unset; position:relative; display:block; width:var(--die); height:var(--die); cursor:pointer; touch-action:manipulation}
.die:focus-visible{outline:2px solid var(--dr-accent); outline-offset:6px; border-radius:var(--dr-radius)}
.shadow{position:absolute; left:12%; right:12%; bottom:-6px; height:12px; border-radius:50%; pointer-events:none; background:radial-gradient(closest-side,rgba(0,0,0,.55),transparent)}
.tumble{position:absolute; inset:0; display:block}
.tumble svg{display:block; width:100%; height:100%; overflow:visible}
.num{font-family:var(--dr-numerals); font-weight:700; font-stretch:condensed; stroke-width:3px; paint-order:stroke; stroke-linejoin:round}
.die.idle .num{opacity:.75; stroke-width:0}
.rm{position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%; display:grid; place-items:center; font-size:14px; line-height:1;
  background:var(--dr-ink); color:var(--dr-table); opacity:0; transform:scale(.5); transition:opacity .15s, transform .15s; pointer-events:none}
@media (hover:hover){ .die:hover .rm{opacity:1; transform:scale(1)} }
.die:focus-visible .rm{opacity:1; transform:scale(1)}
.tray.busy .rm{display:none}
.tray.busy .die{cursor:default}
.drop{position:absolute; left:50%; bottom:-24px; transform:translateX(-50%); padding:0 7px; border-radius:9px; white-space:nowrap;
  font:700 13px/18px var(--dr-numerals); color:var(--dr-muted); text-decoration:line-through; background:color-mix(in srgb,var(--dr-panel) 80%,transparent); opacity:0; transition:opacity .25s}
.drop.on{opacity:1}
.die.crit,.die.fumble{z-index:2}
.die.crit .tumble{filter:drop-shadow(0 0 2px var(--dr-accent)) drop-shadow(0 0 10px var(--dr-accent))}
.burst{position:absolute; left:50%; top:50%; width:0; height:0; pointer-events:none}
.burst i,.burst b{position:absolute; left:0; top:0; opacity:0}
.burst i{border-radius:50%; background:var(--dr-spark); box-shadow:0 0 4px 1px var(--dr-spark-glow), 0 0 12px 3px var(--dr-spark-glow)}
.burst i.ray{border-radius:3px}
.burst b{width:var(--die); height:var(--die); margin:calc(var(--die) / -2) 0 0 calc(var(--die) / -2); border-radius:50%;
  border:3px solid var(--dr-spark); box-shadow:0 0 14px var(--dr-spark-glow), inset 0 0 14px var(--dr-spark-glow)}

/* Natural 20: a warm candle glow breathes underneath the die.
   Natural 1: the die goes cold and a red glow throbs underneath it. */
.aura{position:absolute; inset:-38%; border-radius:50%; pointer-events:none; opacity:0; --fx:var(--dr-doom); --fx-deep:var(--dr-doom-deep);
  background:radial-gradient(closest-side, var(--fx) 52%, var(--fx-deep) 74%, transparent)}
.die.crit .aura{--fx:var(--dr-glory); --fx-deep:var(--dr-glory-deep); opacity:1; animation:glory 2.6s ease-in-out .3s infinite}
@keyframes glory{0%,100%{opacity:.55; transform:scale(.9)} 50%{opacity:1; transform:scale(1.1)}}
.die.fumble .aura{opacity:1; animation:doom 1.9s cubic-bezier(.45,0,.55,1) .25s infinite}
@keyframes doom{0%,100%{opacity:.45; transform:scale(.86)} 18%{opacity:1; transform:scale(1.12)} 34%{opacity:.7; transform:scale(1)} 48%{opacity:.95; transform:scale(1.07)}}
.die.fumble .tumble{filter:drop-shadow(0 0 2px var(--dr-doom)) drop-shadow(0 0 8px var(--dr-doom))}
.die.fumble svg > polygon:first-child{fill:#121317}
.die.fumble svg > polygon:last-of-type{stroke:#6E1220}
.die.fumble .num{fill:#FF4B5C; stroke:rgba(60,0,8,.7)}
.tray::after{content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; opacity:0;
  box-shadow:inset 0 0 70px 6px var(--fx, transparent)}
.tray.doom::after{--fx:var(--dr-doom); animation:vignette 2.2s ease-out .1s}
.tray.glory::after{--fx:var(--dr-glory); animation:vignette 2.2s ease-out .1s}
@keyframes vignette{0%{opacity:0} 22%{opacity:.9} 100%{opacity:0}}

.result{position:relative; display:flex; align-items:flex-end; gap:12px; min-height:58px}
.readout{flex:1; min-width:0}
.msg{min-height:20px; font-size:14px; line-height:20px; font-weight:600; color:var(--dr-muted)}
.msg.crit{color:var(--dr-accent)}
.msg.fumble{color:var(--dr-danger)}
.expr{font-size:15px; line-height:1.45; overflow-wrap:anywhere}
.expr .vals{color:var(--dr-muted)}
.expr s, .h-vals s{opacity:.7}
.total{font-weight:600; font-size:56px; line-height:.9; letter-spacing:-.02em;
  font-variant-numeric:tabular-nums; text-align:right; min-width:1.2ch; transform-origin:100% 80%}
.total.stale{color:var(--dr-muted); opacity:.45}

.picker{display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px}
@container dr (max-width:300px){ .picker{grid-template-columns:repeat(4,minmax(0,1fr))} }
.pick{all:unset; position:relative; display:flex; flex-direction:column; align-items:center; gap:3px; padding:9px 0 7px; border-radius:var(--dr-control-radius); cursor:pointer;
  border:1px solid var(--dr-line); transition:border-color .15s, background-color .15s}
@media (hover:hover){ .pick:hover:not(:disabled){border-color:var(--dr-accent)} }
.pick:active:not(:disabled){background:color-mix(in srgb,var(--dr-accent) 10%,transparent)}
.pick:focus-visible{outline:2px solid var(--dr-accent); outline-offset:2px}
.pick:disabled{opacity:.6; cursor:not-allowed}
.pick svg{width:32px; height:32px; overflow:visible; transition:transform .22s cubic-bezier(.3,1.6,.5,1)}
@media (hover:hover){ .pick:hover:not(:disabled) svg{transform:translateY(-2px) rotate(-8deg)} }
.lbl{font-size:13px; line-height:16px; color:var(--dr-muted)}
.badge{position:absolute; top:-8px; right:-5px; min-width:22px; height:22px; padding:0 6px; border-radius:11px; text-align:center;
  font-size:12px; font-weight:600; line-height:22px; font-variant-numeric:tabular-nums; background:var(--dr-accent); color:var(--dr-accent-ink); box-shadow:0 0 0 2px var(--dr-panel);
  transform:scale(0); transition:transform .22s cubic-bezier(.3,1.7,.5,1)}
.badge.on{transform:scale(1)}

.row{display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px}
.stepper,.seg{display:flex; align-items:center; padding:3px; border-radius:var(--dr-control-radius); border:1px solid var(--dr-line)}
.steplabel{padding:0 6px 0 9px; font-size:14px; color:var(--dr-muted)}
.stepper button{all:unset; width:38px; height:38px; display:grid; place-items:center; border-radius:6px; cursor:pointer; font-size:21px; line-height:1; color:var(--dr-muted); transition:color .15s, background-color .15s}
.stepper button:focus-visible,.seg button:focus-visible{outline:2px solid var(--dr-accent); outline-offset:-2px}
@media (hover:hover){ .stepper button:hover{color:var(--dr-ink); background:color-mix(in srgb,var(--dr-ink) 7%,transparent)} }
.stepper output{min-width:3ch; text-align:center; font-size:18px; font-weight:600; line-height:1; font-variant-numeric:tabular-nums}
.seg{position:relative; transition:opacity .2s}
.seg.dim{opacity:.55}
.seg button{all:unset; position:relative; z-index:1; padding:9px 12px; border-radius:6px; cursor:pointer; font-size:14px; color:var(--dr-muted); transition:color .2s}
@media (hover:hover){ .seg button:hover:not(:disabled){color:var(--dr-ink)} }
.seg button[aria-pressed="true"],.seg button[aria-pressed="true"]:hover{color:var(--dr-accent)}
.seg button:disabled{cursor:default}
/* The selected option reads like the editor's picked tool: candle border on a faint candle wash */
.thumb{position:absolute; top:3px; bottom:3px; left:3px; width:0; border-radius:6px; border:1px solid var(--dr-accent); background:color-mix(in srgb,var(--dr-accent) 15%,transparent);
  transition:left .28s cubic-bezier(.3,1.25,.5,1), width .28s cubic-bezier(.3,1.25,.5,1)}

.actions{display:flex; gap:10px}
.btn{all:unset; box-sizing:border-box; min-height:44px; padding:8px 16px; border-radius:var(--dr-control-radius); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px;
  transition:border-color .15s, background-color .15s}
.btn:focus-visible{outline:2px solid var(--dr-accent); outline-offset:2px}
.clear{border:1px solid var(--dr-line); color:var(--dr-ink)}
@media (hover:hover){ .clear:hover:not(:disabled){border-color:var(--dr-accent)} }
.roll{flex:1; font-weight:600; background:var(--dr-accent); color:var(--dr-accent-ink)}
@media (hover:hover){ .roll:hover:not(:disabled){background:var(--dr-accent-strong)} }
.roll:active:not(:disabled){background:var(--dr-accent-strong)}
.btn:disabled{opacity:.6; cursor:default}

.history{border-top:1px solid var(--dr-line); padding-top:4px}
.history summary{display:flex; align-items:center; gap:8px; min-height:36px; padding:4px; cursor:pointer; list-style:none;
  font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--dr-muted)}
.history summary::-webkit-details-marker{display:none}
.history summary::after{content:""; width:7px; height:7px; margin-left:auto; border-right:2px solid; border-bottom:2px solid; transform:translateY(-2px) rotate(45deg); transition:transform .2s}
@media (hover:hover){ .history summary:hover{color:var(--dr-ink)} }
.history[open] summary::after{transform:translateY(1px) rotate(-135deg)}
.history summary:focus-visible{outline:2px solid var(--dr-accent); outline-offset:2px; border-radius:6px}
.history ol{list-style:none; margin:4px 0 0; padding:0}
.history li{display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:12px; padding:10px 4px; border-top:1px solid var(--dr-line)}
.history li:first-child{border-top:0}
.history li.none{display:block; color:var(--dr-muted); font-size:14px}
.h-expr{font-size:15px; font-weight:600}
.h-mode{font-weight:400; color:var(--dr-muted)}
.h-vals{font-size:13px; color:var(--dr-muted); overflow-wrap:anywhere}
.h-total{font-size:26px; font-weight:600; line-height:1; font-variant-numeric:tabular-nums}
.again{all:unset; padding:6px 12px; border-radius:var(--dr-control-radius); cursor:pointer; font-size:14px; color:var(--dr-ink); border:1px solid var(--dr-line); white-space:nowrap; transition:border-color .15s}
@media (hover:hover){ .again:hover{border-color:var(--dr-accent)} }
.again:focus-visible{outline:2px solid var(--dr-accent); outline-offset:2px}

.sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
@keyframes doom-still{0%,100%{opacity:.4} 25%{opacity:1} 50%{opacity:.75}}
@keyframes glory-still{0%,100%{opacity:.5} 50%{opacity:1}}
@media (prefers-reduced-motion:reduce){ *{transition:none !important}
  .die.fumble .aura{animation:doom-still 2.4s ease-in-out infinite} .die.crit .aura{animation:glory-still 3s ease-in-out infinite} }
`
