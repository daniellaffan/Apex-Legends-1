import { TAU } from '../config/util.js';

const mexico =
  { id:"mexico", name:"Mexico City", loc:"Autódromo Hermanos Rodríguez", laps:[4,9,16], len:4304, width:14.9, night:false, sun:1.0, rain:0.20,
    facade:"concrete",
    pal:{ skyA:"#3E86C8", skyB:"#E6DCC8", ground:"#5E7A46", grass:"#4E6A38", road:"#54575D", kerbA:"#2E8B45", kerbB:"#D8352A",
          wall:"#B4BAC0", line:"#EFEFEF", accent:"#2E8B45", water:"#4C7A96" },
    pit:{ side:1 },
    barrier:"armco", runoff:12,
    // Mexico City: the Magdalena Mixhuca sports park, and then one of the
    // densest cities on earth in every direction
    land:[ {t:"blob", n:78, near:15, far:105, size:[9,24], col:"#5E7A46"},
           {t:"blob", n:58, near:24, far:145, size:[10,26], col:"#6E8A50"},
           {t:"blob", n:52, near:20, far:125, size:[8,22], col:"#9A8A64"},
           {t:"parcel", n:34, near:18, far:95, size:[11,30], col:"#8E9298", angle:0.75, jitter:0.09},
           {t:"parcel", n:96, near:120, far:450, size:[13,34], col:"#B08A6E", angle:0.75, jitter:0.07},
           {t:"parcel", n:76, near:190, far:620, size:[15,40], col:"#9E7C62", angle:0.75, jitter:0.07},
           {t:"parcel", n:52, near:290, far:900, size:[20,52], col:"#8C6E58", angle:0.75, jitter:0.07},
           {t:"parcel", n:34, near:420, far:1200, size:[28,76], col:"#7E6250", angle:0.75, jitter:0.07} ],
    layout:"S1074 R113/31 S59 L78/33 R95/28 S220 R46/95 S168 L60/54 R74/39 S286 L53/53 R43/83 L56/48 S110 L47/67 R28/87 S208 R114/40 S112 L68/23 R72/25 L47/27 S89 R64/38 S83 R70/70 S309",
    elev:u => 1.2 * Math.sin(u * TAU * 2),
    scene:[ {t:"stadium", n:1, a:0.8, b:0.8, side:0, off:0, h:[16,16], col:"#B9BFC6"},
            {t:"lm", k:"baseball", n:1, a:0.8, b:0.8, side:"in", off:70, h:[10,10], col:"#5E8A46"},
            {t:"lm", k:"pitbuilding", n:1, a:0.975, b:0.975, side:1, off:42, h:[24,24], col:"#AEB5BC"},
            {t:"grandstand", n:1, a:0.05, b:0.05, side:"out", off:24, h:[16,16], col:"#AEB5BC", wid:200},
            {t:"grandstand", n:1, a:0.12, b:0.12, side:"out", off:24, h:[16,16], col:"#AEB5BC", wid:200},
            {t:"grandstand", n:1, a:0.2, b:0.2, side:"out", off:24, h:[16,16], col:"#AEB5BC", wid:200},
            {t:"grandstand", n:1, a:0.27, b:0.27, side:"out", off:24, h:[16,16], col:"#AEB5BC", wid:160},
            {t:"grandstand", n:1, a:0.1, b:0.1, side:"in", off:24, h:[14,14], col:"#AEB5BC", wid:160},
            {t:"grandstand", n:1, a:0.2, b:0.2, side:"in", off:24, h:[14,14], col:"#AEB5BC", wid:160},
            {t:"grandstand", n:1, a:0.31, b:0.31, side:"out", off:24, h:[15,15], col:"#AEB5BC", wid:120},
            {t:"grandstand", n:1, a:0.42, b:0.42, side:"out", off:24, h:[12,12], col:"#AEB5BC", wid:80},
            {t:"tree", n:110, a:0, b:1, side:1, off:42, h:[8,16], col:"#3E6B33"},
            {t:"tree", n:70, a:0, b:1, side:-1, off:46, h:[8,16], col:"#3E6B33"},
            {t:"billboard", n:14, a:0, b:1, side:-1, off:24, h:[11,16], col:"#2E8B45"},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#2E8B45"},
            {t:"marshal", n:12, a:0, b:1, side:1, off:22, h:[3,3], col:"#D8DCE0"} ] };

export default mexico;
