import { elevPW } from './shared.js';

const suzuka =
  { id:"suzuka", name:"Suzuka", loc:"Suzuka International Racing Course", laps:[3,7,12], len:5807, width:14.6, night:false, sun:1.3, rain:0.30,
    facade:"concrete",
    pal:{ skyA:"#4D93D2", skyB:"#E4ECF2", ground:"#5E7F46", grass:"#4E6F3A", road:"#51545A", kerbA:"#D8352A", kerbB:"#F0F0F0",
          wall:"#B4BAC0", line:"#EFEFEF", accent:"#D8352A", water:"#4C7A96" },
    barrier:"armco", runoff:14,
    // Suzuka: wooded hills above terraced rice paddies, with the fairground's
    // car parks on the near side
    land:[ {t:"blob", n:70, near:26, far:180, size:[13,36], col:"#33502C"},
           {t:"blob", n:40, near:85, far:470, size:[36,100], col:"#2B4527"},
           {t:"parcel", n:104, near:18, far:120, size:[9,24], col:"#7BA352", angle:0.9, jitter:0.04},
           {t:"parcel", n:80, near:26, far:170, size:[10,26], col:"#8FB65E", angle:0.9, jitter:0.04},
           {t:"parcel", n:52, near:36, far:230, size:[11,28], col:"#6E8A73", angle:0.9, jitter:0.04},
           {t:"parcel", n:34, near:85, far:420, size:[20,54], col:"#84AC58", angle:0.9, jitter:0.04},
           {t:"parcel", n:34, near:14, far:78, size:[8,22], col:"#9AA0A6", angle:0.9, jitter:0.38},
           {t:"blob", n:40, near:17, far:115, size:[8,22], col:"#4E6F3A"} ],
    layout:"S410 R60/101 R69/45 S70 L40/56 R47/54 L64/59 R49/63 L95/64 S194 R59/42 S47 R93/29 S210 L22/125 L177/16 S165 R36/178 S293 L60/85 S47 L84/56 S694 L53/131 S236 R58/16 L69/18 S100 R95/56 S180",
    elev:elevPW([[0,6],[0.11,2],[0.15,4],[0.22,22],[0.30,28],[0.33,24],[0.40,4],[0.46,6],[0.56,12],[0.60,14],[0.70,26],[0.80,16],[0.90,8],[1,6]]),
    scene:[ {t:"ferris", n:1, a:0.035, b:0.035, side:-1, off:170, h:[100,100], col:"#D8352A"},
            {t:"lm", k:"funfair", n:1, a:0.07, b:0.07, side:-1, off:210, h:[40,40], col:"#E8377F"},
            {t:"lm", k:"pitbuilding", n:1, a:0.985, b:0.985, side:-1, off:42, h:[24,24], col:"#AEB5BC"},
            {t:"grandstand", n:1, a:0.97, b:0.97, side:"out", off:24, h:[18,18], col:"#AEB5BC", wid:240},
            {t:"grandstand", n:1, a:0.02, b:0.02, side:"out", off:24, h:[15,15], col:"#AEB5BC", wid:140},
            {t:"grandstand", n:1, a:0.4, b:0.4, side:"out", off:24, h:[13,13], col:"#AEB5BC", wid:90},
            {t:"grandstand", n:1, a:0.58, b:0.58, side:"out", off:24, h:[12,12], col:"#AEB5BC", wid:80},
            {t:"grandstand", n:1, a:0.8, b:0.8, side:"out", off:24, h:[13,13], col:"#AEB5BC", wid:90},
            {t:"grandstand", n:1, a:0.9, b:0.9, side:"out", off:24, h:[12,12], col:"#AEB5BC", wid:80},
            {t:"hotel", n:1, a:0.95, b:0.95, side:-1, off:120, h:[40,40], col:"#E4E0D6"},
            {t:"tree", n:150, a:0, b:1, side:1, off:46, h:[10,20], col:"#33502C"},
            {t:"tree", n:110, a:0, b:1, side:-1, off:50, h:[10,18], col:"#33502C"},
            {t:"billboard", n:16, a:0, b:1, side:-1, off:26, h:[11,16], col:"#D8352A"},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#D8352A"},
            {t:"pylon", n:34, a:0, b:1, side:1, off:24, h:[10,14], col:"#8A9199"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:24, h:[3,3], col:"#D8DCE0"} ] };

export default suzuka;
