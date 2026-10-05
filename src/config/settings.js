import { store } from './util.js';

const CFG = Object.assign({ teamId:"mcl", drvIdx:0, trackId:"monaco", lapsIdx:1, diff:1,
  tyre:"medium", weather:"auto", line:1, damage:1, sc:1, grid:1, mode:"quick", fx:1, detail:1 }, store("cfg") || {});

const OPTS = {
  laps:[["Sprint", 0], ["Feature", 1], ["Full", 2]],
  diff:[["Rookie", 0], ["Pro", 1], ["Ace", 2], ["Legend", 3]],
  tyre:[["Soft", "soft"], ["Medium", "medium"], ["Hard", "hard"]],
  weather:[["Dry", "dry"], ["Likely", "auto"], ["Wet", "wet"]],
  line:[["Line on", 1], ["Line off", 0]],
  damage:[["Damage on", 1], ["Damage off", 0]],
  sc:[["Safety car on", 1], ["Safety car off", 0]],
  grid:[["Pole", 0], ["Midfield", 1], ["Back row", 2]],
  fx:[["Effects on", 1], ["Effects off", 0]],
  detail:[["Full detail", 1], ["Lite", 0]],
};
// the rivals' cornering pace against the limit of the line (1 = a perfect lap):
// Rookie gives up ~6%, Pro ~1.5%, Ace drives the perfect lap, Legend finds more
const AI_SCALE = [0.895, 0.955, 0.98, 1.0];
// how hard the field races you, by difficulty: chance to defend, appetite for a move,
// the extra push when chasing a place back, and how far they will lunge
const COMBAT = [
  { defend:0.35, aggr:0.75, push:0.006, lunge:0.90 },
  { defend:0.80, aggr:1.10, push:0.018, lunge:1.15 },
  { defend:0.95, aggr:1.25, push:0.026, lunge:1.30 },
  { defend:1.00, aggr:1.40, push:0.034, lunge:1.40 },
];


export { AI_SCALE, CFG, COMBAT, OPTS };
