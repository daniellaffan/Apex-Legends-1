import { ILGGEO } from './survey/interlagos.js';

/* Interlagos (Autódromo José Carlos Pace). The lap is the game's own layout string,
   run anticlockwise as the real circuit is; how it differs from the real shape is in
   NOTES.md (not changed here). The heights, the pit lane and the stands are from the
   real circuit. Left-handers are - on this lap, so the outside of a left is r (+1) and
   the outside of a right is l (-1). Corners on this layout (lap fractions):
   Senna S T1 .052, T2 .068, Curva do Sol .102, Descida do Lago T4 .312 and T5 .354,
   Ferradura .438, Laranjinha .472, Pinheirinho .524, Bico de Pato .594, Mergulho .630,
   Junção .709, Subida dos Boxes .808. */
const interlagos =
  { id:"interlagos", name:"São Paulo", loc:"Autódromo José Carlos Pace", laps:[4,9,16], len:4309, width:14.2, night:false, sun:1.7, rain:0.45,
    facade:"favela",
    pal:{ skyA:"#86B4D4", skyB:"#E8E4D6", ground:"#4F7A36", grass:"#42692D", road:"#4D5056", kerbA:"#D8C93A", kerbB:"#2E8B45",
          wall:"#B0B7BE", line:"#EFEFEF", accent:"#2E8B45", water:"#3F7A9A" },
    // the bowl, the lake, the stands and the city round it are built by worlds/ilg.js
    world:"interlagos",
    layout:"S156 L93/37 R69/36 S57 L72/93 S598 L90/43 S81 L55/60 S217 R50/90 S45 R60/55 S123 L95/29 S190 R100/24 S64 L80/50 S205 L93/37 S181 L42/223 S510 L20/290",
    // the real heights (SRTM), carried onto this lap corner by corner (survey/interlagos.js, NOTES.md)
    elev:u => ILGGEO.elev(u),
    /* The pit lane, as mapped: on the left, in on the run up to the pit straight, boxes along
       the straight, and out on the left at the start of the back straight (the real exit road runs
       inside the Senna S: 1,372 m in all). */
    pit:{ side:-1, in:0.853, out:0.217, box:0.955, gap:4 },
    // the garages face the lane, so no Armco is drawn along it (drawing only)
    noPitArmco:true,
    barrier:"armco", runoff:11,
    /* Run-off: grass behind the kerbs, tarmac in the Senna S and at Bico de Pato, gravel at the
       Descida do Lago and Junção. Corner by corner this is my reading, not survey (NOTES.md). */
    runoffSurf:"grass", runoffAstro:0,
    runoffZones:[ { a:0.040, b:0.115, rs:"asphalt", r:26, ls:"asphalt", l:18, n:"Senna S and Curva do Sol" },
                  { a:0.300, b:0.370, rs:"mix", rt:6, r:22, n:"Descida do Lago" },
                  { a:0.580, b:0.606, ls:"asphalt", l:16, n:"Bico de Pato" },
                  { a:0.695, b:0.725, rs:"mix", rt:5, r:18, n:"Junção" } ],
    // where things are on the lap, for the world (lap fractions on this layout)
    zones:{ senna:[0.040, 0.075], sol:0.102, reta:[0.12, 0.30], lago:[0.30, 0.36], ferradura:0.438, laranjinha:0.472,
            pinheirinho:0.524, bico:0.594, mergulho:0.630, juncao:0.709, subida:[0.73, 0.85], main:[0.88, 0.02] },
    // a warm, wet haze
    atmo:{ near:-110, k:0.55, tint:"#C9C6BA" },
    // the 2D renderer's ground (the 3D world lays its own)
    land:[ {t:"blob", n:5, side:"out", near:430, far:820, size:[300,440], col:"#3E6B7E", clear:true, drop:5},
           {t:"blob", n:4, side:"out", near:260, far:430, size:[150,230], col:"#47798E", clear:true, drop:4, a:0.12, b:0.36},
           {t:"blob", n:6, side:"out", near:170, far:280, size:[70,130], col:"#7E8A66", clear:true, a:0.12, b:0.36},
           {t:"parcel", n:130, side:"in", near:18, far:105, size:[6,16], col:"#A8785C"},
           {t:"parcel", n:104, side:"in", near:26, far:145, size:[6,16], col:"#96674F"},
           {t:"parcel", n:74, side:"in", near:45, far:250, size:[8,22], col:"#8A6552"},
           {t:"parcel", n:44, side:"in", near:110, far:470, size:[15,42], col:"#94705A"},
           {t:"parcel", n:76, side:"out", near:16, far:100, size:[6,16], col:"#9E7458", a:0, b:0.56},
           {t:"parcel", n:46, side:"out", near:28, far:175, size:[8,22], col:"#8A6552", a:0, b:0.56},
           {t:"blob", n:54, near:15, far:92, size:[7,20], col:"#5E7A46"},
           {t:"blob", n:24, near:48, far:240, size:[18,52], col:"#4E6A3C"} ],
    /* only2d: the 3D world builds its own pit building, stands, housing and trees; the 2D
       view keeps these. The stands are on the outside of the straight, across from the pits,
       and round the Senna S, as mapped. */
    scene:[ {t:"lm", k:"pitbuilding", n:1, a:0.955, b:0.955, side:-1, off:42, h:[24,24], col:"#B0B8C0", only2d:true},
            {t:"tower", n:1, a:0.975, b:0.975, side:-1, off:70, h:[44,44], col:"#C2C8CE", only2d:true},
            {t:"grandstand", n:1, a:0.95, b:0.95, side:1, off:30, h:[20,20], col:"#B0B8C0", wid:260, only2d:true},
            {t:"grandstand", n:1, a:0.03, b:0.03, side:1, off:30, h:[18,18], col:"#B0B8C0", wid:160, only2d:true},
            {t:"grandstand", n:1, a:0.07, b:0.07, side:1, off:30, h:[15,15], col:"#B0B8C0", wid:120, only2d:true},
            {t:"grandstand", n:1, a:0.7, b:0.7, side:1, off:30, h:[12,12], col:"#B0B8C0", wid:80, only2d:true},
            {t:"grandstand", n:1, a:0.3, b:0.3, side:1, off:30, h:[12,12], col:"#B0B8C0", wid:80, only2d:true},
            {t:"hotel", n:30, a:0, b:1, side:"in", off:56, h:[10,26], col:"#C9A27A", only2d:true},
            {t:"hotel", n:14, a:0.36, b:0.75, side:"out", off:60, h:[10,22], col:"#B88A66", only2d:true},
            {t:"tree", n:90, a:0, b:1, side:1, off:40, h:[9,17], col:"#356E2E", only2d:true},
            {t:"tree", n:50, a:0, b:1, side:-1, off:44, h:[9,17], col:"#356E2E", only2d:true},
            {t:"billboard", n:14, a:0, b:1, side:-1, off:24, h:[11,15], col:"#2E8B45", only2d:true},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#2E8B45"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:22, h:[3,3], col:"#D8DCE0", only2d:true} ] };

export default interlagos;
