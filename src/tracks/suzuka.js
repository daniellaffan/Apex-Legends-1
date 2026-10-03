import { SZGEO } from './survey/suzuka.js';

const suzuka =
  { id:"suzuka", name:"Suzuka", loc:"Suzuka International Racing Course", laps:[3,7,12], len:5807, width:14.6, night:false, sun:1.3, rain:0.30,
    facade:"concrete",
    pal:{ skyA:"#4D93D2", skyB:"#E4ECF2", ground:"#5E7F46", grass:"#4E6F3A", road:"#51545A", kerbA:"#D8352A", kerbB:"#F0F0F0",
          wall:"#B4BAC0", line:"#EFEFEF", accent:"#D8352A", water:"#4C7A96" },
    barrier:"armco", runoff:14,
    // the real circuit: the surveyed OpenStreetMap lap, run clockwise, with the GSI
    // heights along it. The back straight goes over the Degner-to-Hairpin link because
    // it is the higher road there. The wooded hills, the park and the planting are
    // built by worlds/suzuka.js.
    world:"suzuka", path:() => SZGEO.pathRaw(), smooth:3,
    elev:u => SZGEO.elev(u),
    // the pit lane, as mapped: in on the right just after the chicane, out at Turn 1
    pit:{ side:1, in:0.9227, out:0.077 },
    /* The run-off keeps the grip the circuit always had ("plain"); only the gravel
       traps outside the corners are different. Right-handers are + on this lap, so
       the outside of a right is l and of a left is r. Which corners have gravel at
       the real circuit is my reading of it, not survey (see NOTES.md). */
    runoffSurf:"plain",
    runoffZones:[ { a:0.074, b:0.132, ls:"mix", lt:6, n:"Turn 1 and 2" },
                  { a:0.262, b:0.330, rs:"gravel", n:"Dunlop" },
                  { a:0.360, b:0.400, ls:"gravel", n:"Degner 1 and 2" },
                  { a:0.620, b:0.672, rs:"gravel", n:"Spoon" },
                  { a:0.834, b:0.862, rs:"mix", rt:7, n:"130R" } ],
    // where things are on the lap, for the planting and the park (lap fractions from the line)
    zones:{ main:[0.943, 0.077], park:[0.92, 0.04], tight:[0.62, 0.87], infield:[0.10, 0.26],
            back:[0.68, 0.80], spoon:[0.615, 0.675], r130:[0.82, 0.87],
            towers:[0.185, 0.29, 0.38, 0.475, 0.645, 0.845, 0.905],
            // the Ferris wheel, where OpenStreetMap has it
            wheel:{ u:0.959, side:-1, off:88 } },
    // Suzuka: wooded hills above terraced rice paddies, with the fairground's
    // car parks on the near side (the 2D renderer's ground; the 3D world lays its own)
    land:[ {t:"blob", n:70, near:26, far:180, size:[13,36], col:"#33502C"},
           {t:"blob", n:40, near:85, far:470, size:[36,100], col:"#2B4527"},
           {t:"parcel", n:104, near:18, far:120, size:[9,24], col:"#7BA352", angle:0.9, jitter:0.04},
           {t:"parcel", n:80, near:26, far:170, size:[10,26], col:"#8FB65E", angle:0.9, jitter:0.04},
           {t:"parcel", n:52, near:36, far:230, size:[11,28], col:"#6E8A73", angle:0.9, jitter:0.04},
           {t:"parcel", n:34, near:85, far:420, size:[20,54], col:"#84AC58", angle:0.9, jitter:0.04},
           {t:"parcel", n:34, near:14, far:78, size:[8,22], col:"#9AA0A6", angle:0.9, jitter:0.38},
           {t:"blob", n:40, near:17, far:115, size:[8,22], col:"#4E6F3A"} ],
    // the old stylised layout and its heights, kept for reference; the surveyed path above is what is built
    layoutDSL:"S410 R60/101 R69/45 S70 L40/56 R47/54 L64/59 R49/63 L95/64 S194 R59/42 S47 R93/29 S210 L22/125 L177/16 S165 R36/178 S293 L60/85 S47 L84/56 S694 L53/131 S236 R58/16 L69/18 S100 R95/56 S180",
    // only2d: the 3D world builds its own Ferris wheel, park and trees; the 2D
    // fallback keeps these. The pits are on the right (+1); the main grandstand, the
    // wheel and the park are across the main straight from them (-1), as they are at
    // the real circuit. The other stands sit on the outside of their corners.
    scene:[ {t:"ferris", n:1, a:0.959, b:0.959, side:-1, off:88, h:[60,60], col:"#D8352A", only2d:true},
            {t:"lm", k:"funfair", n:1, a:0.94, b:0.94, side:-1, off:170, h:[40,40], col:"#E8377F", only2d:true},
            {t:"lm", k:"pitbuilding", n:1, a:0.985, b:0.985, side:1, off:42, h:[24,24], col:"#AEB5BC"},
            {t:"grandstand", n:1, a:0.975, b:0.975, side:-1, off:30, h:[18,18], col:"#AEB5BC", wid:200},
            {t:"grandstand", n:1, a:0.025, b:0.025, side:-1, off:30, h:[15,15], col:"#AEB5BC", wid:140},
            {t:"grandstand", n:1, a:0.105, b:0.105, side:-1, off:30, h:[13,13], col:"#AEB5BC", wid:110},
            {t:"grandstand", n:1, a:0.17, b:0.17, side:1, off:30, h:[12,12], col:"#AEB5BC", wid:80},
            {t:"grandstand", n:1, a:0.475, b:0.475, side:1, off:30, h:[12,12], col:"#AEB5BC", wid:70},
            {t:"grandstand", n:1, a:0.645, b:0.645, side:1, off:30, h:[12,12], col:"#AEB5BC", wid:80},
            {t:"grandstand", n:1, a:0.875, b:0.875, side:1, off:30, h:[13,13], col:"#AEB5BC", wid:90},
            {t:"hotel", n:1, a:0.93, b:0.93, side:-1, off:260, h:[40,40], col:"#E4E0D6"},
            {t:"tree", n:150, a:0, b:1, side:1, off:46, h:[10,20], col:"#33502C", only2d:true},
            {t:"tree", n:110, a:0, b:1, side:-1, off:50, h:[10,18], col:"#33502C", only2d:true},
            {t:"billboard", n:16, a:0, b:1, side:-1, off:26, h:[11,16], col:"#D8352A"},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#D8352A"},
            {t:"pylon", n:34, a:0, b:1, side:1, off:24, h:[10,14], col:"#8A9199"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:24, h:[3,3], col:"#D8DCE0"} ] };

export default suzuka;
