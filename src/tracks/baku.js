import { elevPW } from './shared.js';

const baku =
  { id:"baku", name:"Baku", loc:"Baku City Circuit", laps:[4,8,14], len:6003, width:14.3, night:false, sun:0.9, rain:0.10,
    facade:"sand",
    pal:{ skyA:"#4E9FD6", skyB:"#E4E2D4", ground:"#CDBE9E", grass:"#9AA86E", road:"#4C4F54", kerbA:"#1C6FC0", kerbB:"#EDEDED",
          wall:"#CBBB9C", line:"#EFEFEF", accent:"#1C6FC0", water:"#2F7FB8" },
    barrier:"wall", runoff:3.4,
    // Baku: the Caspian along the seafront half of the lap, boulevard lawns on
    // its edge, sandstone old town packed up behind
    land:[ {t:"blob", n:5, side:"out", near:480, far:900, size:[320,460], col:"#2F7FB8", clear:true, drop:6},
           {t:"blob", n:4, side:"out", near:280, far:470, size:[160,240], col:"#3C93C8", clear:true, drop:5, a:0.84, b:1.12},
           {t:"blob", n:6, side:"out", near:180, far:300, size:[70,130], col:"#D8C9A8", clear:true, drop:1, a:0.84, b:1.12},
           {t:"blob", n:8, side:"out", near:90, far:190, size:[40,90], col:"#5E8C4A", clear:true, a:0.84, b:1.12},
           {t:"parcel", n:120, side:"in", near:16, far:92, size:[8,22], col:"#D8C7A4"},
           {t:"parcel", n:92, side:"in", near:24, far:135, size:[9,24], col:"#C6B291"},
           {t:"parcel", n:64, side:"in", near:40, far:210, size:[13,34], col:"#B4A487"},
           {t:"parcel", n:40, side:"in", near:90, far:350, size:[20,56], col:"#C2AE8E"},
           {t:"parcel", n:70, side:"out", near:18, far:110, size:[9,24], col:"#D8C7A4", a:0, b:0.5},
           {t:"parcel", n:48, side:"out", near:30, far:190, size:[11,30], col:"#B4A487", a:0, b:0.5},
           {t:"blob", n:40, side:"in", near:20, far:120, size:[9,24], col:"#6E8C52"} ],
    layout:"S600 L77/26 S280 L77/38 S462 L77/38 S350 R103/38 S448 L43/43 S252 L34/50 S210 L51/33 S92 L95/10 S42 R47/27 S36 R47/27 S54 L35/29 S66 L35/29 S78 R94/21 S280 L23/75 S184 L46/48 S156 L81/32 S180 R21/112 S132 L29/112 S156 R13/160 S120 L17/160 S600",
    elev:elevPW([[0,0],[0.3,0],[0.43,8],[0.53,26],[0.58,30],[0.66,22],[0.76,6],[0.84,0],[1,0]]),
    scene:[ {t:"lm", k:"flame", n:1, a:0.62, b:0.62, side:"in", off:380, h:[190,190], col:"#4F7FB0"},
            {t:"lm", k:"maiden", n:1, a:0.545, b:0.545, side:"in", off:30, h:[28,28], col:"#CDB994"},
            {t:"lm", k:"citywall", n:5, a:0.5, b:0.6, side:"in", off:24, h:[9,9], col:"#D3C09C"},
            {t:"lm", k:"govhouse", n:1, a:0.73, b:0.73, side:"out", off:64, h:[30,30], col:"#D9C9A5"},
            {t:"lm", k:"carpet", n:1, a:0.95, b:0.95, side:"out", off:96, h:[24,24], col:"#C8A25A"},
            {t:"lm", k:"pitbuilding", n:1, a:0.985, b:0.985, side:-1, off:42, h:[24,24], col:"#B7B0A0"},
            {t:"tower", n:8, a:0, b:0.1, side:"out", off:48, h:[60,150], col:"#5E8FB8"},
            {t:"tower", n:6, a:0.86, b:1, side:"out", off:52, h:[50,120], col:"#5E8FB8"},
            {t:"hotel", n:26, a:0.3, b:0.62, side:"in", off:26, h:[14,30], col:"#D8C7A4"},
            {t:"hotel", n:14, a:0.62, b:0.86, side:"in", off:30, h:[16,32], col:"#C6B291"},
            {t:"hotel", n:10, a:0.12, b:0.3, side:"in", off:34, h:[18,36], col:"#D8C7A4"},
            {t:"palm", n:34, a:0.84, b:1, side:"out", off:18, h:[10,15], col:"#3E7D4F"},
            {t:"palm", n:16, a:0, b:0.11, side:"out", off:18, h:[10,15], col:"#3E7D4F"},
            {t:"grandstand", n:1, a:0.97, b:0.97, side:"out", off:24, h:[13,13], col:"#B7B0A0", wid:140},
            {t:"grandstand", n:1, a:0.02, b:0.02, side:"out", off:24, h:[12,12], col:"#B7B0A0", wid:100},
            {t:"grandstand", n:1, a:0.33, b:0.33, side:"out", off:24, h:[11,11], col:"#B7B0A0", wid:70},
            {t:"billboard", n:14, a:0, b:1, side:-1, off:18, h:[11,15], col:"#1C6FC0"},
            {t:"arch", n:2, a:0, b:0.5, side:0, off:0, h:[9,9], col:"#1C6FC0"},
            {t:"marshal", n:14, a:0, b:1, side:1, off:14, h:[3,3], col:"#D8DCE0"} ] };

export default baku;
