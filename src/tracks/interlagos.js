import { elevPW } from './shared.js';

const interlagos =
  { id:"interlagos", name:"São Paulo", loc:"Autódromo José Carlos Pace", laps:[4,9,16], len:4309, width:14.2, night:false, sun:1.7, rain:0.45,
    facade:"favela",
    pal:{ skyA:"#86B4D4", skyB:"#E8E4D6", ground:"#4F7A36", grass:"#42692D", road:"#4D5056", kerbA:"#D8C93A", kerbB:"#2E8B45",
          wall:"#B0B7BE", line:"#EFEFEF", accent:"#2E8B45", water:"#3F7A9A" },
    barrier:"armco", runoff:11,
    // Interlagos: a bowl above the Guarapiranga reservoir, low-rise housing
    // packed right up against the fences
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
    layout:"S156 L93/37 R69/36 S57 L72/93 S598 L90/43 S81 L55/60 S217 R50/90 S45 R60/55 S123 L95/29 S190 R100/24 S64 L80/50 S205 L93/37 S181 L42/223 S510 L20/290",
    elev:elevPW([[0,34],[0.05,30],[0.09,12],[0.13,4],[0.30,0],[0.35,-4],[0.45,-8],[0.55,-10],[0.62,-6],[0.70,-4],[0.77,4],[0.90,24],[1,34]]),
    scene:[ {t:"lm", k:"pitbuilding", n:1, a:0.985, b:0.985, side:-1, off:42, h:[24,24], col:"#B0B8C0"},
            {t:"tower", n:1, a:0.995, b:0.995, side:-1, off:70, h:[44,44], col:"#C2C8CE"},
            {t:"grandstand", n:1, a:0.98, b:0.98, side:"out", off:24, h:[20,20], col:"#B0B8C0", wid:260},
            {t:"grandstand", n:1, a:0.03, b:0.03, side:"out", off:24, h:[18,18], col:"#B0B8C0", wid:160},
            {t:"grandstand", n:1, a:0.06, b:0.06, side:"out", off:24, h:[15,15], col:"#B0B8C0", wid:120},
            {t:"grandstand", n:1, a:0.7, b:0.7, side:"out", off:24, h:[12,12], col:"#B0B8C0", wid:80},
            {t:"grandstand", n:1, a:0.3, b:0.3, side:"out", off:24, h:[12,12], col:"#B0B8C0", wid:80},
            {t:"hotel", n:30, a:0, b:1, side:"in", off:56, h:[10,26], col:"#C9A27A"},
            {t:"hotel", n:14, a:0.36, b:0.75, side:"out", off:60, h:[10,22], col:"#B88A66"},
            {t:"tree", n:90, a:0, b:1, side:1, off:40, h:[9,17], col:"#356E2E"},
            {t:"tree", n:50, a:0, b:1, side:-1, off:44, h:[9,17], col:"#356E2E"},
            {t:"billboard", n:14, a:0, b:1, side:-1, off:24, h:[11,15], col:"#2E8B45"},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#2E8B45"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:22, h:[3,3], col:"#D8DCE0"} ] };

export default interlagos;
