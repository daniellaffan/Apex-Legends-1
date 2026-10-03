import { elevPW } from './shared.js';

const spa =
  { id:"spa", name:"Spa-Francorchamps", loc:"Circuit de Spa-Francorchamps", laps:[3,6,10], len:7004, width:16.1, night:false, sun:2.4, rain:0.55,
    facade:"concrete",
    pal:{ skyA:"#6F8194", skyB:"#C9D1D6", ground:"#4C6B3C", grass:"#3E5C31", road:"#4E5157", kerbA:"#D8352A", kerbB:"#EDEDED",
          wall:"#AEB5BB", line:"#EFEFEF", accent:"#2E5A2A", water:"#3F6478" },
    barrier:"armco", runoff:18,
    // Spa: a public road through the Ardennes — conifer on every side, meadow
    // wherever the valley opens out
    land:[ {t:"blob", n:96, near:18, far:125, size:[9,26], col:"#2C4A2A"},
           {t:"blob", n:74, near:26, far:175, size:[11,30], col:"#254124"},
           {t:"blob", n:50, near:55, far:320, size:[22,60], col:"#1F3820"},
           {t:"blob", n:30, near:120, far:640, size:[55,160], col:"#22401F"},
           {t:"blob", n:58, near:17, far:115, size:[8,22], col:"#5E7D3E"},
           {t:"blob", n:36, near:36, far:220, size:[14,40], col:"#6E8C46"},
           {t:"parcel", n:26, near:40, far:230, size:[16,46], col:"#7E9A52", angle:1.1, jitter:0.16},
           {t:"blob", n:20, near:80, far:420, size:[28,76], col:"#4A6B34"} ],
    layout:"S123 R170/14 S250 L30/75 R45/69 L25/120 S1122 R90/40 L51/46 R40/68 S183 R155/27 S133 L44/79 S112 L108/90 S277 R70/55 L48/60 S195 R104/50 S179 R29/150 S427 L48/220 S318 R60/16 L60/14 S136",
    elev:elevPW([[0,52],[0.035,54],[0.10,22],[0.14,52],[0.25,66],[0.37,70],[0.44,58],[0.54,36],[0.62,30],[0.69,14],[0.75,12],[0.86,36],[0.96,50],[1,52]]),
    scene:[ {t:"lm", k:"pitbuilding", n:1, a:0.985, b:0.985, side:-1, off:42, h:[24,24], col:"#A9B0B7"},
            {t:"grandstand", n:1, a:0.115, b:0.115, side:"out", off:24, h:[22,22], col:"#A9B0B7", wid:130},
            {t:"grandstand", n:1, a:0.03, b:0.03, side:"out", off:24, h:[14,14], col:"#A9B0B7", wid:80},
            {t:"grandstand", n:1, a:0.44, b:0.44, side:"out", off:24, h:[12,12], col:"#A9B0B7", wid:70},
            {t:"grandstand", n:1, a:0.96, b:0.96, side:"out", off:24, h:[13,13], col:"#A9B0B7", wid:90},
            {t:"lm", k:"chalet", n:8, a:0.65, b:0.73, side:"out", off:110, h:[12,12], col:"#6E6258"},
            {t:"lm", k:"chalet", n:4, a:0.35, b:0.39, side:"out", off:90, h:[12,12], col:"#6E6258"},
            {t:"lm", k:"chalet", n:3, a:0.02, b:0.05, side:"in", off:120, h:[12,12], col:"#7A6A5C"},
            {t:"tree", n:180, a:0, b:1, side:1, off:48, h:[14,26], col:"#2C4A2A"},
            {t:"tree", n:140, a:0, b:1, side:-1, off:52, h:[14,24], col:"#264725"},
            {t:"arch", n:2, a:0.22, b:0.6, side:0, off:0, h:[10,10], col:"#D8352A"},
            {t:"billboard", n:12, a:0, b:1, side:-1, off:28, h:[12,16], col:"#2E5A2A"},
            {t:"marshal", n:14, a:0, b:1, side:1, off:26, h:[3,3], col:"#D8DCE0"} ] };

export default spa;
