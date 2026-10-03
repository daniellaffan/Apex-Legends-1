import { TAU } from '../config/util.js';

const monza =
  { id:"monza", name:"Monza", loc:"Autodromo Nazionale Monza", laps:[4,8,14], len:5793, width:15.1, night:false, sun:1.1, rain:0.15,
    facade:"stucco",
    pal:{ skyA:"#4F97D2", skyB:"#E6E8DC", ground:"#547A3E", grass:"#456B33", road:"#55585E", kerbA:"#D8352A", kerbB:"#EDEDED",
          wall:"#B2B8BE", line:"#EFEFEF", accent:"#C8102E", water:"#4C7A96" },
    barrier:"armco", runoff:14,
    // Monza: the royal park — mature woodland, formal lawns, gravel avenues
    land:[ {t:"blob", n:92, near:16, far:115, size:[9,26], col:"#2F4F2C"},
           {t:"blob", n:70, near:26, far:165, size:[11,30], col:"#28462A"},
           {t:"blob", n:44, near:65, far:330, size:[24,66], col:"#223D25"},
           {t:"blob", n:26, near:140, far:640, size:[55,150], col:"#254128"},
           {t:"blob", n:52, near:15, far:105, size:[8,22], col:"#6B8A46"},
           {t:"parcel", n:38, near:22, far:135, size:[11,32], col:"#7E9A52", angle:0.25, jitter:0.09},
           {t:"parcel", n:30, near:14, far:76, size:[6,16], col:"#B2A78C", angle:0.25, jitter:0.32},
           {t:"blob", n:18, near:55, far:280, size:[20,54], col:"#8E9A6E"} ],
    layout:"S620 R65/17 L70/20 S258 R90/242 S300 L64/23 R55/27 S416 R80/50 S145 R75/40 S554 L20/400 S303 L55/50 R70/50 L50/61 S920 R170/88 S553",
    elev:u => 2 * Math.sin(u * TAU * 3) + 1,
    scene:[ {t:"banking", n:6, a:0.17, b:0.27, side:"out", off:84, h:[10,12], col:"#9E9384"},
            {t:"banking", n:5, a:0.72, b:0.83, side:"out", off:92, h:[10,12], col:"#9E9384"},
            {t:"lm", k:"villareale", n:1, a:0.55, b:0.55, side:"in", off:520, h:[24,24], col:"#E4CFA4"},
            {t:"lm", k:"pitbuilding", n:1, a:0.99, b:0.99, side:-1, off:42, h:[24,24], col:"#ADB4BB"},
            {t:"grandstand", n:1, a:0.97, b:0.97, side:"out", off:24, h:[16,16], col:"#ADB4BB", wid:220},
            {t:"grandstand", n:1, a:0.87, b:0.87, side:"out", off:24, h:[15,15], col:"#ADB4BB", wid:120},
            {t:"grandstand", n:1, a:0.65, b:0.65, side:"out", off:24, h:[13,13], col:"#ADB4BB", wid:90},
            {t:"grandstand", n:1, a:0.42, b:0.42, side:"out", off:24, h:[12,12], col:"#ADB4BB", wid:80},
            {t:"grandstand", n:1, a:0.12, b:0.12, side:"out", off:24, h:[13,13], col:"#ADB4BB", wid:90},
            {t:"tree", n:220, a:0, b:1, side:1, off:42, h:[16,26], col:"#2F5228"},
            {t:"tree", n:170, a:0, b:1, side:-1, off:46, h:[16,26], col:"#2F5228"},
            {t:"billboard", n:18, a:0, b:1, side:-1, off:24, h:[12,17], col:"#C8102E"},
            {t:"arch", n:2, a:0, b:0.45, side:0, off:0, h:[9,9], col:"#C8102E"},
            {t:"marshal", n:10, a:0, b:1, side:1, off:26, h:[3,3], col:"#D8DCE0"} ] };

export default monza;
