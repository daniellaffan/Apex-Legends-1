import { elevPW } from './shared.js';

const cota =
  { id:"cota", name:"Austin", loc:"Circuit of the Americas", laps:[3,7,12], len:5513, width:15.8, night:false, sun:1.4, rain:0.20,
    facade:"glass",
    pal:{ skyA:"#3C8FD8", skyB:"#F0EAD8", ground:"#7E8A4E", grass:"#6C7A40", road:"#52555B", kerbA:"#D8352A", kerbB:"#2B4C9B",
          wall:"#B4BAC0", line:"#EFEFEF", accent:"#2B4C9B", water:"#4C7A96" },
    barrier:"armco", runoff:18,
    // Austin: hill-country ranch land — dry grass, scrub oak, bare limestone
    // and acres of gravel parking
    land:[ {t:"blob", n:86, near:22, far:145, size:[11,30], col:"#8A9450"},
           {t:"blob", n:66, near:32, far:200, size:[13,36], col:"#9A9A58"},
           {t:"blob", n:42, near:75, far:430, size:[30,84], col:"#A8A066"},
           {t:"blob", n:26, near:150, far:720, size:[65,170], col:"#9E9C5E"},
           {t:"blob", n:72, near:17, far:125, size:[7,20], col:"#4A6B34"},
           {t:"blob", n:42, near:36, far:240, size:[13,34], col:"#3E5E2E"},
           {t:"blob", n:30, near:48, far:280, size:[16,44], col:"#BDB08A"},
           {t:"parcel", n:32, near:22, far:135, size:[15,42], col:"#9A9288", angle:0.6, jitter:0.07} ],
    layout:"S300 L104/23 S121 R45/102 L50/62 R44/55 L46/47 R47/62 S120 L38/41 R75/50 L30/90 S197 L45/55 S273 L106/22 S874 L100/20 S98 R95/35 L29/65 R94/36 S101 L27/69 L33/72 L29/88 S188 L53/36 S344 L69/39 S448",
    // Real range 133 ft = 40.5 m, with the Turn 1 climb about 85 ft = 26 m: the line sits 26 m under the Turn 1 apex.
    // The rest of the lap sits between those; the shape is from the old profile, rescaled.
    elev:elevPW([[0,14.5],[0.075,40.5],[0.16,10],[0.22,14],[0.30,6],[0.38,4],[0.62,0],[0.70,5],[0.80,4],[1,14.5]]),
    scene:[ {t:"lm", k:"cotatower", n:1, a:0.71, b:0.71, side:"in", off:92, h:[77,77], col:"#E8ECF0"},
            {t:"lm", k:"amphitheatre", n:1, a:0.745, b:0.745, side:"in", off:160, h:[26,26], col:"#F0F2F4"},
            {t:"lm", k:"pitbuilding", n:1, a:0.985, b:0.985, side:-1, off:42, h:[24,24], col:"#C2C8CE"},
            {t:"grandstand", n:1, a:0.07, b:0.07, side:"out", off:24, h:[24,24], col:"#5E6A76", wid:170},
            {t:"grandstand", n:1, a:0.045, b:0.045, side:"out", off:24, h:[14,14], col:"#5E6A76", wid:100},
            {t:"grandstand", n:1, a:0.97, b:0.97, side:"out", off:24, h:[17,17], col:"#5E6A76", wid:240},
            {t:"grandstand", n:1, a:0.7, b:0.7, side:"out", off:24, h:[14,14], col:"#5E6A76", wid:100},
            {t:"grandstand", n:1, a:0.607, b:0.607, side:"out", off:24, h:[12,12], col:"#5E6A76", wid:80},
            {t:"grandstand", n:1, a:0.377, b:0.377, side:"out", off:24, h:[12,12], col:"#5E6A76", wid:80},
            {t:"tree", n:60, a:0, b:1, side:1, off:52, h:[7,13], col:"#4A7038"},
            {t:"tree", n:40, a:0, b:1, side:-1, off:56, h:[7,13], col:"#4A7038"},
            {t:"billboard", n:14, a:0, b:1, side:-1, off:28, h:[12,17], col:"#2B4C9B"},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[10,10], col:"#2B4C9B"},
            {t:"pylon", n:30, a:0, b:1, side:1, off:26, h:[10,13], col:"#8A9199"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:26, h:[3,3], col:"#D8DCE0"} ] };

export default cota;
