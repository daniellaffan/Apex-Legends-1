import { SPAGEO } from './survey/spa.js';

/* Spa-Francorchamps. The lap is the game's own layout string, run clockwise as the
   real circuit is; how it differs from the real shape is in NOTES.md (it is not
   changed here). Everything else is from the real circuit where it could be found:
   the heights (survey/spa.js), the pit lane, the gravel traps and the stands.
   Right-handers are + on this lap, so the outside of a right is l (-1) and the
   outside of a left is r (+1). Lap fractions of the corners on this layout:
   La Source .022-.039, Eau Rouge .088, Raidillon .099-.124, Les Combes .364-.390,
   Malmedy .391-.403, Rivage .437-.460, the left after it .483-.500, Pouhon .521-.562,
   Fagnes .618-.648, Campus .686-.711, Paul Frere .747-.764, Blanchimont .857-.897,
   Bus Stop .961-.976. */
const spa =
  { id:"spa", name:"Spa-Francorchamps", loc:"Circuit de Spa-Francorchamps", laps:[3,6,10], len:7004, width:16.1, night:false, sun:2.4, rain:0.55,
    facade:"concrete",
    pal:{ skyA:"#6F8194", skyB:"#C9D1D6", ground:"#4C6B3C", grass:"#3E5C31", road:"#4E5157", kerbA:"#D8352A", kerbB:"#EDEDED",
          wall:"#AEB5BB", line:"#EFEFEF", accent:"#2E5A2A", water:"#3F6478" },
    // the Ardennes valley, its forest, stream, villages and stands are built by worlds/spa.js
    world:"spa",
    layout:"S123 R170/14 S250 L30/75 R45/69 L25/120 S1122 R90/40 L51/46 R40/68 S183 R155/27 S133 L44/79 S112 L108/90 S277 R70/55 L48/60 S195 R104/50 S179 R29/150 S427 L48/220 S318 R60/16 L60/14 S136",
    // the real heights, carried onto this lap corner by corner (survey/spa.js, NOTES.md)
    elev:u => SPAGEO.elev(u),
    /* The pit lane, as mapped: on the right of the start straight, in from the middle of
       the Bus Stop, out on the right just after La Source. The boxes line the straight. */
    pit:{ side:1, in:0.967, out:0.048, box:0.999, gap:4 },
    // the pit building faces the lane, so no Armco is drawn along it (drawing only; the wall the cars feel is unchanged)
    noPitArmco:true,
    barrier:"armco", runoff:9,
    /* Run-off: grass behind a strip of artificial grass, with the 2022 gravel traps at
       La Source, Raidillon, Les Combes, Stavelot (Paul Frere) and Blanchimont, and the
       one added at the Bus Stop. Tarmac first and then gravel where a corner has both.
       The tarmac at Malmedy, Rivage, Pouhon and Fagnes is my reading, not survey. */
    runoffSurf:"grass", runoffAstro:0,
    runoffZones:[ { a:0.016, b:0.044, ls:"mix", lt:9, l:24, n:"La Source" },
                  { a:0.084, b:0.128, ls:"mix", lt:6, l:24, rs:"mix", rt:6, r:24, n:"Eau Rouge and Raidillon" },
                  { a:0.358, b:0.392, ls:"gravel", l:24, n:"Les Combes, outside the right" },
                  { a:0.378, b:0.394, rs:"gravel", r:16, n:"Les Combes, outside the left" },
                  { a:0.391, b:0.408, ls:"asphalt", l:15, n:"Malmedy" },
                  { a:0.432, b:0.466, ls:"asphalt", l:20, n:"Rivage" },
                  { a:0.515, b:0.568, rs:"mix", rt:8, r:24, n:"Pouhon" },
                  { a:0.612, b:0.652, ls:"asphalt", l:14, n:"Fagnes" },
                  { a:0.680, b:0.716, ls:"asphalt", l:16, n:"Campus" },
                  { a:0.740, b:0.772, ls:"gravel", l:22, n:"Stavelot (Paul Frere)" },
                  { a:0.848, b:0.902, rs:"gravel", r:24, n:"Blanchimont" },
                  { a:0.956, b:0.980, ls:"mix", lt:6, l:20, n:"Bus Stop" } ],
    // where things are on the lap, for the world (lap fractions on this layout)
    zones:{ lasource:0.030, oldpits:[0.045, 0.080], eaurouge:0.092, raidillon:[0.099, 0.124], kemmel:[0.13, 0.355],
            lescombes:0.374, malmedy:0.397, rivage:0.449, pouhon:[0.521, 0.562], fagnes:0.632, campus:0.700,
            stavelot:0.755, blanchimont:[0.857, 0.897], busstop:0.967, main:[0.93, 0.02],
            // the stream crosses under the track at the bottom of Eau Rouge
            stream:0.090 },
    // Ardennes mist: the forest fades out early, in a cool grey-green
    // (the camera stands 700 m back, so near is an offset from that: negative = the haze starts in front of the car)
    atmo:{ near:-130, k:0.3, tint:"#B7C2C4" },
    // the 2D renderer's ground (the 3D world lays its own)
    land:[ {t:"blob", n:96, near:18, far:125, size:[9,26], col:"#2C4A2A"},
           {t:"blob", n:74, near:26, far:175, size:[11,30], col:"#254124"},
           {t:"blob", n:50, near:55, far:320, size:[22,60], col:"#1F3820"},
           {t:"blob", n:30, near:120, far:640, size:[55,160], col:"#22401F"},
           {t:"blob", n:58, near:17, far:115, size:[8,22], col:"#5E7D3E"},
           {t:"blob", n:36, near:36, far:220, size:[14,40], col:"#6E8C46"},
           {t:"parcel", n:26, near:40, far:230, size:[16,46], col:"#7E9A52", angle:1.1, jitter:0.16},
           {t:"blob", n:20, near:80, far:420, size:[28,76], col:"#4A6B34"} ],
    /* The stands where they really are: the main one across the straight from the pits,
       La Source's outside, Silver and Endurance down the hill to Eau Rouge, Raidillon at
       the top of the climb on the left, then the outsides of Les Combes, Pouhon, Stavelot
       and Blanchimont. only2d: the 3D world builds its own (covered, tiered, with crowds),
       its forest, chalets and pit building; the 2D view keeps these. */
    scene:[ {t:"lm", k:"pitbuilding", n:1, a:0.990, b:0.990, side:1, off:42, h:[24,24], col:"#A9B0B7", only2d:true},
            {t:"grandstand", n:1, a:0.982, b:0.982, side:-1, off:30, h:[18,18], col:"#A9B0B7", wid:150, only2d:true},
            {t:"grandstand", n:1, a:0.030, b:0.030, side:-1, off:34, h:[14,14], col:"#A9B0B7", wid:80, only2d:true},
            {t:"grandstand", n:1, a:0.062, b:0.062, side:-1, off:30, h:[12,12], col:"#A9B0B7", wid:90, only2d:true},
            {t:"grandstand", n:1, a:0.118, b:0.118, side:-1, off:34, h:[16,16], col:"#A9B0B7", wid:110, only2d:true},
            {t:"grandstand", n:1, a:0.372, b:0.372, side:-1, off:38, h:[12,12], col:"#A9B0B7", wid:70, only2d:true},
            {t:"grandstand", n:1, a:0.540, b:0.540, side:1, off:38, h:[12,12], col:"#A9B0B7", wid:80, only2d:true},
            {t:"grandstand", n:1, a:0.756, b:0.756, side:-1, off:36, h:[11,11], col:"#A9B0B7", wid:60, only2d:true},
            {t:"grandstand", n:1, a:0.880, b:0.880, side:1, off:38, h:[12,12], col:"#A9B0B7", wid:80, only2d:true},
            {t:"lm", k:"chalet", n:8, a:0.65, b:0.73, side:"out", off:110, h:[12,12], col:"#6E6258", only2d:true},
            {t:"lm", k:"chalet", n:4, a:0.35, b:0.39, side:"out", off:90, h:[12,12], col:"#6E6258", only2d:true},
            {t:"lm", k:"chalet", n:3, a:0.02, b:0.05, side:"in", off:120, h:[12,12], col:"#7A6A5C", only2d:true},
            {t:"tree", n:260, a:0, b:1, side:1, off:42, h:[14,28], col:"#2C4A2A", only2d:true},
            {t:"tree", n:220, a:0, b:1, side:-1, off:44, h:[14,26], col:"#264725", only2d:true},
            {t:"tree", n:120, a:0.08, b:0.2, side:"out", off:30, h:[16,28], col:"#22401F", only2d:true},
            {t:"tree", n:120, a:0.48, b:0.9, side:"in", off:60, h:[14,24], col:"#2A4728", only2d:true},
            {t:"arch", n:2, a:0.22, b:0.6, side:0, off:0, h:[10,10], col:"#D8352A"},
            {t:"billboard", n:12, a:0, b:1, side:-1, off:28, h:[12,16], col:"#2E5A2A", only2d:true},
            {t:"marshal", n:14, a:0, b:1, side:1, off:26, h:[3,3], col:"#D8DCE0", only2d:true} ] };

export default spa;
