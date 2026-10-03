import { TAU } from '../config/util.js';
import { bumpU } from './shared.js';

const singapore =
  { id:"singapore", name:"Singapore", loc:"Marina Bay Street Circuit", laps:[4,9,16], len:4940, width:13.8, night:true, sun:0.4, rain:0.30,
    facade:"glass",
    pal:{ skyA:"#140B2A", skyB:"#4A2660", ground:"#231A36", grass:"#2B3A2E", road:"#3A3742", kerbA:"#E03C31", kerbB:"#F0F0F0",
          wall:"#48405C", line:"#F4F4F4", accent:"#FF7A00", water:"#1B2E52" },
    barrier:"wall", runoff:3.4,
    // Marina Bay at night: black water off the promenade, lit CBD blocks
    // behind it, the gardens planted between them
    land:[ {t:"blob", n:4, side:"in", near:420, far:760, size:[290,420], col:"#121A2E", clear:true, drop:4},
           {t:"blob", n:3, side:"in", near:240, far:420, size:[150,220], col:"#16233D", clear:true, drop:3, a:0.52, b:0.92},
           {t:"blob", n:6, side:"in", near:150, far:260, size:[60,110], col:"#2E2A44", clear:true, a:0.52, b:0.94},
           {t:"parcel", n:120, side:"in", near:16, far:95, size:[9,24], col:"#2A2740"},
           {t:"parcel", n:90, side:"in", near:24, far:140, size:[10,26], col:"#332E4C"},
           {t:"parcel", n:60, side:"in", near:40, far:230, size:[14,36], col:"#3A3550"},
           {t:"parcel", n:60, side:"out", near:18, far:105, size:[9,24], col:"#2A2740", a:0.56, b:1},
           {t:"parcel", n:40, side:"out", near:30, far:180, size:[11,28], col:"#332E4C", a:0.56, b:1},
           {t:"blob", n:54, near:20, far:120, size:[8,22], col:"#1E3A33"},
           {t:"blob", n:24, near:70, far:260, size:[22,60], col:"#203A32"},
           {t:"parcel", n:44, near:14, far:62, size:[7,16], col:"#3E3858"} ],
    layout:"S257 L82/26 R76/24 L78/25 S584 L80/43 S420 L88/29 S375 R100/22 S123 L91/22 S146 R35/50 S227 L99/18 S34 R38/57 S21 L146/10 S232 R88/27 S305 L31/84 S135 L84/22 R103/22 S60 L26/50 S39 L58/30 S220",
    elev:u => 1.5 * Math.sin(u * TAU * 3) + (bumpU(u, 0.664, 0.012) * 3),
    scene:[ {t:"lm", k:"mbs", n:1, a:0.3, b:0.3, side:"in", off:430, h:[200,200], col:"#C8CDD6"},
            {t:"lm", k:"artscience", n:1, a:0.36, b:0.36, side:"in", off:380, h:[50,50], col:"#E8ECF0"},
            {t:"ferris", n:1, a:0.22, b:0.22, side:"in", off:130, h:[165,165], col:"#F2F2F2"},
            {t:"lm", k:"esplanade", n:1, a:0.7, b:0.7, side:"in", off:62, h:[34,34], col:"#8A9AA8"},
            {t:"lm", k:"fullerton", n:1, a:0.655, b:0.655, side:"out", off:44, h:[36,36], col:"#EEEBE2"},
            {t:"lm", k:"merlion", n:1, a:0.685, b:0.685, side:"in", off:26, h:[9,9], col:"#F0F0EC"},
            {t:"lm", k:"floatstand", n:1, a:0.8, b:0.8, side:"in", off:56, h:[28,28], col:"#3B3550"},
            {t:"lm", k:"pitbuilding", n:1, a:0.98, b:0.98, side:-1, off:42, h:[24,24], col:"#3A3550"},
            {t:"tower", n:22, a:0.52, b:0.78, side:"out", off:44, h:[60,140], col:"#4A4270"},
            {t:"tower", n:14, a:0, b:0.12, side:"out", off:40, h:[50,120], col:"#3B3560"},
            {t:"tower", n:16, a:0.86, b:1, side:"out", off:46, h:[46,110], col:"#4A4270"},
            {t:"hotel", n:18, a:0.12, b:0.5, side:"out", off:34, h:[24,60], col:"#3A3550"},
            {t:"neon", n:18, a:0, b:1, side:1, off:24, h:[18,34], col:"#FF7A00"},
            {t:"billboard", n:14, a:0, b:1, side:-1, off:19, h:[11,15], col:"#E03C31"},
            {t:"arch", n:4, a:0.06, b:0.1, side:0, off:0, h:[9,9], col:"#8A9199"},
            {t:"arch", n:2, a:0.4, b:0.9, side:0, off:0, h:[9,9], col:"#FF7A00"},
            {t:"grandstand", n:1, a:0.14, b:0.14, side:"out", off:24, h:[13,13], col:"#3B3550", wid:90},
            {t:"grandstand", n:1, a:0.3, b:0.3, side:"out", off:24, h:[13,13], col:"#3B3550", wid:80},
            {t:"grandstand", n:1, a:0.88, b:0.88, side:"out", off:24, h:[14,14], col:"#3B3550", wid:120},
            {t:"palm", n:30, a:0.5, b:0.95, side:"in", off:18, h:[9,14], col:"#2E7D4F"},
            {t:"pylon", n:52, a:0, b:1, side:1, off:15, h:[16,20], col:"#6E6880"},
            {t:"marshal", n:14, a:0, b:1, side:1, off:14, h:[3,3], col:"#D8DCE0"} ] };

export default singapore;
