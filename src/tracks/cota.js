import { elevSpline } from './shared.js';

const cota =
  { id:"cota", name:"Austin", loc:"Circuit of the Americas", laps:[3,7,12], len:5513, width:15.8, night:false, sun:1.4, sunH:0.62, rain:0.20,
    facade:"glass", world:"cota",
    // Texas in spring: dusty gold and sage, pale limestone, a big blue sky
    pal:{ skyA:"#3C8FD8", skyB:"#F2E6C8", ground:"#B2A464", grass:"#9C9A56", road:"#55565A", kerbA:"#D8352A", kerbB:"#F2F0EA",
          wall:"#B4BAC0", line:"#EFEFEF", accent:"#C8442A", water:"#5E8A92" },
    barrier:"armco", runoff:14,
    // heat haze low on the horizon: starts close to the bottom of the frame, a warm tint
    atmo:{ near:-40, k:1.45, tint:"#F0E4C6" },
    /* Real range 133 ft = 40.5 m (Jalopnik, F1 pages). The climb to the Turn 1 apex is about 26 m
       (85 ft), about 11% where it is steepest, and Turn 1 is the highest point of the lap. The
       profile is a closed spline with a continuous gradient, so the lap closes exactly at the line
       (height and slope both wrap). Where the lowest point really is I could not confirm; it is on
       the back straight / Turn 12 here, as before. Everything between is my reading of the shape:
       the Esses roll downhill from the Turn 1 crest, the infield is flat, the back straight is
       low and the run from Turn 20 climbs to the line. */
    elev:elevSpline([[0,14.5],[0.020,15.6],[0.040,21.0],[0.060,31.5],[0.072,38.5],[0.079,40.5],[0.088,39.6],[0.100,34.0],
                     [0.115,26.4],[0.136,15.7],[0.150,11.1],[0.170,10.0],[0.183,10.3],[0.220,14.0],[0.250,12.5],
                     [0.300,6.0],[0.340,4.5],[0.383,4.0],[0.450,2.5],[0.520,1.0],[0.600,0.0],[0.630,0.6],
                     [0.670,2.7],[0.710,5.0],[0.780,4.1],[0.830,5.5],[0.872,7.0],[0.920,10.0],[0.960,12.5]]),
    /* The pit lane runs down the left (inside) of the front straight: in at Turn 20, out
       straight into the Turn 1 apex (Jalopnik; no box count found, so the shared default is kept). */
    pit:{ side:-1, in:0.885, out:0.075 },
    /* Left-handers wind this lap, so the outside of every corner is the right (+) side. My reading
       of the real mix, because I found no published run-off map (see NOTES.md): big tarmac at Turn 1,
       tarmac along the back straight, turf-trimmed verges at T6 and T13-15. */
    runoffSurf:"grass",
    runoffZones:[ { a:0.060, b:0.108, r:36, rs:"asphalt", l:10, ls:"grass", n:"Turn 1: huge tarmac outside (fairly sure)" },
                  { a:0.112, b:0.186, l:11, ls:"asphalt", r:11, rs:"asphalt", n:"Esses: narrow tarmac (not sure)" },
                  { a:0.206, b:0.252, r:20, rs:"asphalt", l:12, ls:"asphalt", n:"Turns 7 to 9: tarmac (guess)" },
                  { a:0.290, b:0.318, r:22, rs:"mix", rt:9, n:"Turn 10: tarmac then gravel (guess)" },
                  { a:0.368, b:0.402, r:34, rs:"mix", rt:12, l:12, ls:"asphalt", n:"Turn 11 hairpin: tarmac, a gravel strip (guess)" },
                  { a:0.402, b:0.596, r:20, rs:"asphalt", l:20, ls:"asphalt", n:"Back straight: tarmac both sides (fairly sure)" },
                  { a:0.596, b:0.630, r:36, rs:"mix", rt:14, l:12, ls:"grass", n:"Turn 12: big tarmac, gravel beyond (fairly sure)" },
                  { a:0.634, b:0.684, r:12, rs:"asphalt", l:12, ls:"asphalt", n:"Turns 13 to 15: verges trimmed back to turf (sourced)" },
                  { a:0.696, b:0.738, r:26, rs:"mix", rt:10, n:"Turns 16 to 18 (guess)" },
                  { a:0.768, b:0.800, r:22, rs:"mix", rt:8, n:"Turn 19 (guess)" },
                  { a:0.860, b:0.900, r:30, rs:"asphalt", n:"Turn 20 (guess)" } ],
    // lap-fraction zones for the plan (planting, paddock, stands)
    zones:{ main:[0.93, 0.095], tower:{ u:0.716, side:1, off:70 }, back:[0.40, 0.60], hill:[0.045, 0.10],
            stadium:[0.765, 0.80], infield:[0.30, 0.38] },
    // Texas hill country: dry grass and limestone; the 2D renderer's ground (the 3D world lays its own)
    land:[ {t:"blob", n:86, near:22, far:145, size:[11,30], col:"#A8A25A"},
           {t:"blob", n:66, near:32, far:200, size:[13,36], col:"#B4A862"},
           {t:"blob", n:42, near:75, far:430, size:[30,84], col:"#BDB070"},
           {t:"blob", n:26, near:150, far:720, size:[65,170], col:"#A8A468"},
           {t:"blob", n:72, near:17, far:125, size:[7,20], col:"#5E7A3C"},
           {t:"blob", n:42, near:36, far:240, size:[13,34], col:"#4E6E34"},
           {t:"blob", n:30, near:48, far:280, size:[16,44], col:"#D8CFB0"},
           {t:"parcel", n:32, near:22, far:135, size:[15,42], col:"#A89880", angle:0.6, jitter:0.07} ],
    /* The stands, the tower, the amphitheatre and the paddock are built by worlds/cota.js (only2d here:
       the 2D renderer keeps these). The pits are on the left (-1); the main grandstand faces them. */
    scene:[ {t:"lm", k:"cotatower", n:1, a:0.716, b:0.716, side:1, off:70, h:[77,77], col:"#E8ECF0", only2d:true},
            {t:"lm", k:"amphitheatre", n:1, a:0.745, b:0.745, side:"in", off:160, h:[26,26], col:"#F0F2F4", only2d:true},
            {t:"lm", k:"pitbuilding", n:1, a:0.985, b:0.985, side:-1, off:42, h:[24,24], col:"#C2C8CE", only2d:true},
            {t:"grandstand", n:1, a:0.07, b:0.07, side:"out", off:24, h:[24,24], col:"#5E6A76", wid:170, only2d:true},
            {t:"grandstand", n:1, a:0.97, b:0.97, side:"out", off:24, h:[17,17], col:"#5E6A76", wid:240, only2d:true},
            {t:"tree", n:60, a:0, b:1, side:1, off:52, h:[7,13], col:"#4A7038", only2d:true},
            {t:"tree", n:40, a:0, b:1, side:-1, off:56, h:[7,13], col:"#4A7038", only2d:true},
            {t:"billboard", n:26, a:0, b:1, side:1, off:26, h:[12,17], col:"#C8442A"},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[10,10], col:"#2B4C9B"},
            {t:"pylon", n:30, a:0, b:1, side:1, off:26, h:[10,13], col:"#8A9199"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:26, h:[3,3], col:"#D8DCE0"} ],
    layout:"S300 L104/23 S121 R45/102 L50/62 R44/55 L46/47 R47/62 S120 L38/41 R75/50 L30/90 S197 L45/55 S273 L106/22 S874 L100/20 S98 R95/35 L29/65 R94/36 S101 L27/69 L33/72 L29/88 S188 L53/36 S344 L69/39 S448" };

export default cota;
