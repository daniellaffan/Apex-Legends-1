import { store } from './util.js';

const CFG = Object.assign({ teamId:"mcl", drvIdx:0, trackId:"monaco", lapsIdx:1, diff:1,
  tyre:"medium", weather:"auto", line:1, damage:1, grid:1, mode:"quick", fx:1, detail:1 }, store("cfg") || {});

const OPTS = {
  laps:[["Sprint", 0], ["Feature", 1], ["Full", 2]],
  diff:[["Rookie", 0], ["Pro", 1], ["Ace", 2], ["Legend", 3]],
  tyre:[["Soft", "soft"], ["Medium", "medium"], ["Hard", "hard"]],
  weather:[["Dry", "dry"], ["Likely", "auto"], ["Wet", "wet"]],
  line:[["Line on", 1], ["Line off", 0]],
  damage:[["Damage on", 1], ["Damage off", 0]],
  grid:[["Pole", 0], ["Midfield", 1], ["Back row", 2]],
  fx:[["Effects on", 1], ["Effects off", 0]],
  detail:[["Full detail", 1], ["Lite", 0]],
};
const AI_SCALE = [0.945, 0.975, 0.995, 1.012];
// how hard the field races you, by difficulty: chance to defend, appetite for a move,
// the extra push when chasing a place back, and how far they will lunge
const COMBAT = [
  { defend:0.22, aggr:0.55, push:0.000, lunge:0.75 },
  { defend:0.55, aggr:0.85, push:0.008, lunge:1.00 },
  { defend:0.80, aggr:1.05, push:0.016, lunge:1.15 },
  { defend:0.96, aggr:1.22, push:0.026, lunge:1.30 },
];


export { AI_SCALE, CFG, COMBAT, OPTS };
