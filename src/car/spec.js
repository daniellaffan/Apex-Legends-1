/* ---------- the car's dimensions: one source for the 3D and the 2D car ------
   Real-world metres, then scaled into the game. CAR_SCALE puts the 2026 maximum
   wheelbase (3.40 m) on the game's 3.13 m between axles, so the axles stay
   exactly where physics has always had them. LATERAL_EXAG widens the car a
   touch so it reads from the overhead camera; 1.90 m becomes 1.96 m, inside
   the old 2.16 m footprint.
   Confidence: H = 2026 technical regulations, M = typical of a modern F1 car,
   K = my own estimate. The blueprint sheet could not be opened here, so every
   shape dimension is K until it can be measured. The model is visual only:
   nothing in physics, collision, AI or the pit box reads this. */
const CAR_SCALE = 0.92, LATERAL_EXAG = 1.12;
const CAR_SPEC = (() => {
  const S = CAR_SCALE, LX = LATERAL_EXAG;
  const R = {
    wheelbase:3.40, width:1.90, mass:768,                            // H
    length:5.50, ohF:1.05, ohR:1.05,                                 // M
    tyreWF:0.28, tyreWR:0.375, tyreDF:0.71, tyreDR:0.73,             // M
    haloTop:0.955, rwTop:0.92, rwSpan:0.96, fwSpan:1.80,             // M
    noseTipZ:0.19, fwZ:0.085, floorZ:0.03,                           // K
  };
  R.trackF = R.width - R.tyreWF;                                     // 1.62, derived
  R.trackR = R.width - R.tyreWR;                                     // 1.525, derived
  const rearAxle = -1.58, frontAxle = rearAxle + R.wheelbase * S;    // 1.548: the game's own axles
  // a point given as metres behind the front axle (d), metres out (y) and up (z)
  const X = d => frontAxle - d * S, Y = y => y * S * LX, Z = z => z * S;
  return {
    S, LX, R, X, Y, Z, rearAxle, frontAxle,
    wheelbase:R.wheelbase * S,
    // wheel centres and tyres, in game metres
    front:{ x:frontAxle, y:Y(R.trackF / 2), r:Z(R.tyreDF / 2), w:Y(R.tyreWF) },
    rear: { x:rearAxle,  y:Y(R.trackR / 2), r:Z(R.tyreDR / 2), w:Y(R.tyreWR) },
    width:Y(R.width), length:(R.ohF + R.wheelbase + R.ohR) * S,
    nose:{ tip:X(-0.98), z:Z(R.noseTipZ) },
    // front wing: leading edge, trailing edge of the last flap, span, main plane height
    fw:{ le:X(-R.ohF), te:X(-0.50), span:Y(R.fwSpan), z:Z(R.fwZ) },
    // rear wing: main plane leading edge, flap trailing edge, span, top
    rw:{ le:X(3.93), te:X(R.wheelbase + R.ohR), span:Y(R.rwSpan), top:Z(R.rwTop) },
    halo:{ d:1.00, top:Z(R.haloTop) },
    helmet:{ x:X(1.34), z:Z(0.78) },
  };
})();


export { CAR_SPEC };
