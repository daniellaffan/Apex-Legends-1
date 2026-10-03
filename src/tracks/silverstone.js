import { SGEO } from './survey/silverstone.js';

const silverstone =
  { id:"silverstone", name:"Silverstone", loc:"Silverstone Circuit", laps:[3,7,12], len:5891, width:15.6, night:false, sun:1.9, rain:0.40,
    facade:"concrete",
    pal:{ skyA:"#8FA6BE", skyB:"#C8D1D9", ground:"#6E8A4E", grass:"#5C7D40", road:"#53565C", kerbA:"#D8352A", kerbB:"#EDEDED",
          wall:"#B6BCC2", line:"#EFEFEF", accent:"#1B5E20", water:"#4C7A96" },
    barrier:"armco", runoff:7,
    // the real circuit: the surveyed OpenStreetMap lap, with the farmland, the old
    // airfield, the Wing and the grandstands built from the same survey
    world:"silverstone", survey:true, path:() => SGEO.pathRaw(), smooth:2,
    // the International pit lane, as mapped: in on the inside of Club, out after Farm
    pit:{ side:1, in:0.865, out:0.088, box:0.993 },
    elev:u => SGEO.elev(u), zScale:1.0,
    /* Run-off, corner by corner, with what it is made of. Right-handers are + on
       this lap, so the outside of a right is l and of a left is r. s is the
       surface: asphalt, gravel, grass, astro, or mix (t metres of asphalt, then
       gravel). Elsewhere it is def.runoff of grass with a strip of artificial
       grass along the kerb. Confidence is my own, noted per corner. */
    runoffSurf:"grass", runoffAstro:2.2,
    runoffZones:[
      { a:0.028, b:0.060, l:26, ls:"asphalt", r:9, rs:"astro", n:"Abbey: wide tarmac outside (fairly sure)" },
      { a:0.075, b:0.104, r:18, rs:"asphalt", n:"Farm: tarmac outside (not sure)" },
      { a:0.112, b:0.140, l:30, ls:"asphalt", r:10, rs:"astro", n:"Village: big tarmac apron outside (fairly sure)" },
      { a:0.140, b:0.170, r:24, rs:"asphalt", l:9, ls:"astro", n:"The Loop: tarmac outside (fairly sure)" },
      { a:0.176, b:0.200, r:16, rs:"asphalt", n:"Aintree: tarmac (a guess)" },
      { a:0.300, b:0.333, r:30, rs:"mix", rt:9, n:"Brooklands: tarmac, then gravel (fairly sure)" },
      { a:0.333, b:0.372, l:26, ls:"asphalt", r:9, rs:"astro", n:"Luffield: wide tarmac outside (fairly sure)" },
      { a:0.380, b:0.425, l:16, ls:"asphalt", n:"Woodcote: tarmac (not sure)" },
      { a:0.476, b:0.520, l:34, ls:"mix", lt:13, n:"Copse: tarmac, then a gravel trap (fairly sure)" },
      { a:0.568, b:0.596, r:20, rs:"gravel", n:"Maggotts: gravel outside (not sure)" },
      { a:0.596, b:0.630, l:28, ls:"mix", lt:6, n:"Becketts: gravel outside the right (fairly sure)" },
      { a:0.630, b:0.668, r:24, rs:"mix", rt:6, n:"Becketts, the left: gravel (fairly sure)" },
      { a:0.675, b:0.705, r:18, rs:"asphalt", n:"Chapel: tarmac onto the Hangar Straight (a guess)" },
      { a:0.808, b:0.848, l:34, ls:"mix", lt:16, n:"Stowe: tarmac, then gravel (fairly sure)" },
      { a:0.895, b:0.926, r:24, rs:"mix", rt:4, l:7, ls:"astro", n:"Vale: gravel outside (sources say so)" },
      { a:0.938, b:0.975, l:24, ls:"asphalt", n:"Club: tarmac outside (fairly sure)" },
    ],
    // Silverstone: a wartime airfield dropped into Northamptonshire farmland —
    // hedged parcels, ploughed ground, old runway concrete
    land:[ {t:"parcel", n:78, near:34, far:210, size:[20,56], col:"#6B8A46", angle:0.4, jitter:0.05},
           {t:"parcel", n:62, near:44, far:250, size:[22,60], col:"#7C9550", angle:0.4, jitter:0.05},
           {t:"parcel", n:44, near:54, far:290, size:[20,54], col:"#8E7A4E", angle:0.4, jitter:0.05},
           {t:"parcel", n:34, near:64, far:330, size:[18,50], col:"#A08A58", angle:0.4, jitter:0.05},
           {t:"parcel", n:28, near:90, far:440, size:[28,76], col:"#5C7D40", angle:0.4, jitter:0.05},
           {t:"parcel", n:22, near:150, far:640, size:[50,130], col:"#74904A", angle:0.4, jitter:0.05},
           {t:"parcel", n:26, near:26, far:140, size:[16,44], col:"#B9B4A6", angle:1.97, jitter:0.03},
           {t:"parcel", n:18, near:22, far:105, size:[11,30], col:"#8A8F92", angle:1.97, jitter:0.03},
           {t:"blob", n:60, near:26, far:190, size:[7,18], col:"#3F5E2E"},
           {t:"blob", n:26, near:90, far:420, size:[20,54], col:"#41612F"},
           {t:"parcel", n:22, near:16, far:66, size:[8,22], col:"#9AA0A6"} ],
    // the old stylised layout, kept for reference; the surveyed path above is what is built
    layout:"S214 R62/92 S74 L40/137 S121 R110/27 S73 L150/19 S52 L38/64 S671 L80/46 S59 R161/34 S113 R29/165 S322 R93/81 S330 L47/120 R73/82 L55/57 R50/98 S881 R110/54 S198 L56/34 S46 R110/50 S255",
    scene:[ {only2d:true, t:"lm", k:"wing", n:1, a:0.975, b:0.975, side:-1, off:48, h:[30,30], col:"#DCE1E6"},
            {only2d:true, t:"lm", k:"brdc", n:1, a:0.45, b:0.45, side:"in", off:36, h:[22,22], col:"#EDEBE4"},
            {only2d:true, t:"lm", k:"hangar", n:3, a:0.72, b:0.8, side:"in", off:120, h:[16,16], col:"#8C939A"},
            {only2d:true, t:"lm", k:"chalet", n:1, a:0.08, b:0.08, side:"out", off:90, h:[11,11], col:"#8E5A46"},
            {only2d:true, t:"grandstand", n:1, a:0.5, b:0.5, side:"out", off:24, h:[15,15], col:"#5E6A76", wid:120},
            {only2d:true, t:"grandstand", n:1, a:0.62, b:0.62, side:"out", off:24, h:[15,15], col:"#5E6A76", wid:140},
            {only2d:true, t:"grandstand", n:1, a:0.84, b:0.84, side:"out", off:24, h:[14,14], col:"#5E6A76", wid:120},
            {only2d:true, t:"grandstand", n:1, a:0.93, b:0.93, side:"out", off:24, h:[14,14], col:"#5E6A76", wid:100},
            {only2d:true, t:"grandstand", n:1, a:0.36, b:0.36, side:"out", off:24, h:[14,14], col:"#5E6A76", wid:100},
            {only2d:true, t:"grandstand", n:1, a:0.05, b:0.05, side:"out", off:24, h:[13,13], col:"#5E6A76", wid:90},
            {only2d:true, t:"grandstand", n:1, a:0.13, b:0.13, side:"out", off:24, h:[13,13], col:"#5E6A76", wid:90},
            {only2d:true, t:"grandstand", n:1, a:0.985, b:0.985, side:"out", off:24, h:[15,15], col:"#5E6A76", wid:220},
            {only2d:true, t:"tree", n:70, a:0, b:1, side:1, off:60, h:[8,15], col:"#3C6B33"},
            {only2d:true, t:"tree", n:50, a:0, b:1, side:-1, off:64, h:[8,14], col:"#3C6B33"},
            {only2d:true, t:"fence", n:22, a:0, b:1, side:-1, off:26, h:[6,6], col:"#9AA3AC"},
            {only2d:true, t:"pylon", n:26, a:0, b:1, side:1, off:26, h:[9,12], col:"#8C939A"},
            {only2d:true, t:"billboard", n:16, a:0, b:1, side:-1, off:22, h:[12,16], col:"#1B5E20"},
            {only2d:true, t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#C8102E"},
            {only2d:true, t:"marshal", n:12, a:0, b:1, side:1, off:24, h:[3,3], col:"#D8DCE0"} ] };

export default silverstone;
