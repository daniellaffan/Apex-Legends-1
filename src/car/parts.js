/* Components that can fail. grip/power/brake/top are multipliers applied while broken;
   fix is the extra time in the pit box to replace the part.                          */
const PARTS = {
  wing:    { id:"wing",    label:"FRONT WING", name:"Front wing",   grip:0.84, top:0.97, fix:6.5,  where:"front" },
  floor:   { id:"floor",   label:"FLOOR",      name:"Floor",        grip:0.87, top:0.99, fix:9.0,  where:"any" },
  rear:    { id:"rear",    label:"REAR WING",  name:"Rear wing",    grip:0.93, top:0.90, fix:6.0,  where:"rear", noBoost:true },
  susp:    { id:"susp",    label:"SUSPENSION", name:"Suspension",   grip:0.80, top:0.96, fix:8.5,  where:"side", pull:true },
  brakes:  { id:"brakes",  label:"BRAKES",     name:"Brakes",       brake:0.72, fix:5.0,  where:"any" },
  gearbox: { id:"gearbox", label:"GEARBOX",    name:"Gearbox",      power:0.86, fix:10.0, where:"any" },
  engine:  { id:"engine",  label:"POWER UNIT", name:"Power unit",   power:0.76, top:0.93, fix:12.0, where:"any" },
  punct:   { id:"punct",   label:"PUNCTURE",   name:"Puncture",     grip:0.66, top:0.88, fix:0,    where:"side", tyre:true },
};
const PART_KEYS = Object.keys(PARTS);

const TYRES = {
  soft:   { key:"soft",   label:"S", name:"Soft",   col:"#FF4B3E", grip:1.045, wear:1.95, warm:0.9 },
  medium: { key:"medium", label:"M", name:"Medium", col:"#F2C230", grip:1.000, wear:1.25, warm:1.0 },
  hard:   { key:"hard",   label:"H", name:"Hard",   col:"#E8EDF3", grip:0.965, wear:0.82, warm:1.15 },
  wet:    { key:"wet",    label:"W", name:"Wet",    col:"#37D6E8", grip:0.905, wear:1.05, warm:1.0 },
};



export { PARTS, PART_KEYS, TYRES };
