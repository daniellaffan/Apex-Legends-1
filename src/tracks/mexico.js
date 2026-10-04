import { MEXGEO } from './survey/mexico.js';

/* Mexico City (Autódromo Hermanos Rodríguez). The lap is the game's own layout string,
   run clockwise as the real circuit is; how it differs from the real shape is in
   NOTES.md (not changed here). The heights, the pit lane, the stands and the stadiums
   are from the real place. Right-handers are + on this lap, so the outside of a right is
   l (-1) and the outside of a left is r (+1). Corners on this layout (lap fractions):
   T1 .294, T2 .327, T3 .341, T4 .485, T5 .502, the esses .593-.689, into the Foro Sol
   (T12) .764, T13 .808, T14 .820, T15 .829, the Peraltada T16 .860 and T17 .901. */
const mexico =
  { id:"mexico", name:"Mexico City", loc:"Autódromo Hermanos Rodríguez", laps:[4,9,16], len:4304, width:14.9, night:false, sun:1.0, rain:0.20,
    facade:"concrete",
    pal:{ skyA:"#3E86C8", skyB:"#E6DCC8", ground:"#5E7A46", grass:"#4E6A38", road:"#54575D", kerbA:"#2E8B45", kerbB:"#D8352A",
          wall:"#B4BAC0", line:"#EFEFEF", accent:"#2E8B45", water:"#4C7A96" },
    // the sports city, the stadiums and the city round them are built by worlds/mex.js
    world:"mexico",
    layout:"S1074 R113/31 S59 L78/33 R95/28 S220 R46/95 S168 L60/54 R74/39 S286 L53/53 R43/83 L56/48 S110 L47/67 R28/87 S208 R114/40 S112 L68/23 R72/25 L47/27 S89 R64/38 S83 R70/70 S309",
    // the real range (8 m) on the terrain models' long trend, corner by corner (survey/mexico.js, NOTES.md)
    elev:u => MEXGEO.elev(u),
    /* The pit lane, as mapped: on the right, in from the inside of the Peraltada, the garages
       along the main straight, out onto the straight well before Turn 1. */
    pit:{ side:1, in:0.884, out:0.082, box:0.975, gap:4 },
    noPitArmco:true,
    barrier:"armco", runoff:12,
    /* Run-off: grass behind the kerbs, tarmac outside Turn 1 to 3 and round the stadium, gravel
       outside the Peraltada and the esses. Corner by corner this is my reading, not survey. */
    runoffSurf:"grass", runoffAstro:0,
    runoffZones:[ { a:0.280, b:0.350, ls:"asphalt", l:26, rs:"asphalt", r:16, n:"Turns 1 to 3" },
                  { a:0.478, b:0.510, rs:"asphalt", r:16, ls:"asphalt", l:14, n:"Turns 4 and 5" },
                  { a:0.585, b:0.695, rs:"mix", rt:5, r:16, ls:"mix", lt:5, l:16, n:"the esses" },
                  { a:0.755, b:0.835, ls:"asphalt", l:14, rs:"asphalt", r:14, n:"the stadium" },
                  { a:0.850, b:0.915, ls:"mix", lt:6, l:20, n:"the Peraltada" } ],
    zones:{ main:[0.915, 0.27], t1:0.294, esses:[0.585, 0.695], stadium:[0.755, 0.835], peraltada:[0.85, 0.915] },
    // thin, clear high-altitude air with a brown haze low over the city
    atmo:{ near:-60, k:0.9, tint:"#D9CDB4" },
    // the 2D renderer's ground (the 3D world lays its own)
    land:[ {t:"blob", n:78, near:15, far:105, size:[9,24], col:"#5E7A46"},
           {t:"blob", n:58, near:24, far:145, size:[10,26], col:"#6E8A50"},
           {t:"blob", n:52, near:20, far:125, size:[8,22], col:"#9A8A64"},
           {t:"parcel", n:34, near:18, far:95, size:[11,30], col:"#8E9298", angle:0.75, jitter:0.09},
           {t:"parcel", n:96, near:120, far:450, size:[13,34], col:"#B08A6E", angle:0.75, jitter:0.07},
           {t:"parcel", n:76, near:190, far:620, size:[15,40], col:"#9E7C62", angle:0.75, jitter:0.07},
           {t:"parcel", n:52, near:290, far:900, size:[20,52], col:"#8C6E58", angle:0.75, jitter:0.07},
           {t:"parcel", n:34, near:420, far:1200, size:[28,76], col:"#7E6250", angle:0.75, jitter:0.07} ],
    // only2d: the 3D world builds its own stadiums, stands, pits, trees and city; the 2D view keeps these
    scene:[ {t:"stadium", n:1, a:0.8, b:0.8, side:0, off:0, h:[16,16], col:"#B9BFC6", only2d:true},
            {t:"lm", k:"baseball", n:1, a:0.8, b:0.8, side:"in", off:70, h:[10,10], col:"#5E8A46", only2d:true},
            {t:"lm", k:"pitbuilding", n:1, a:0.975, b:0.975, side:1, off:42, h:[24,24], col:"#AEB5BC", only2d:true},
            {t:"grandstand", n:1, a:0.05, b:0.05, side:-1, off:30, h:[16,16], col:"#AEB5BC", wid:200, only2d:true},
            {t:"grandstand", n:1, a:0.12, b:0.12, side:-1, off:30, h:[16,16], col:"#AEB5BC", wid:200, only2d:true},
            {t:"grandstand", n:1, a:0.2, b:0.2, side:-1, off:30, h:[16,16], col:"#AEB5BC", wid:200, only2d:true},
            {t:"grandstand", n:1, a:0.3, b:0.3, side:-1, off:30, h:[15,15], col:"#AEB5BC", wid:120, only2d:true},
            {t:"tree", n:110, a:0, b:1, side:1, off:42, h:[8,16], col:"#3E6B33", only2d:true},
            {t:"tree", n:70, a:0, b:1, side:-1, off:46, h:[8,16], col:"#3E6B33", only2d:true},
            {t:"billboard", n:14, a:0, b:1, side:-1, off:24, h:[11,16], col:"#2E8B45", only2d:true},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#2E8B45"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:22, h:[3,3], col:"#D8DCE0", only2d:true} ] };

export default mexico;
