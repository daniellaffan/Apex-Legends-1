import { clamp } from '../../config/util.js';

/* ---------- Spa-Francorchamps, surveyed heights ---------------------------
   Baked once at dev time; the game never fetches any of it (see NOTES.md).

   The lap is still the game's own layout string. Its heights come from the
   real circuit: the OpenStreetMap raceway lap (6,972 m), sampled every 20 m
   from two terrain models (EU-DEM 25 m and SRTM 30 m, mean, median-filtered,
   smoothed), then carried onto the game lap corner by corner: each game apex
   is pinned to the same real apex (ANCHORS, metres from the game's line ->
   metres from the real La Source entry) and the distance in between is
   shared out evenly.

   The game's sections are not the real lengths (the Kemmel straight is far
   too long, sector 2 too short), so carried across as they are the grades
   would be wrong where a section is squeezed. They are capped: 18.5 % on
   Raidillon (published 17 % and "over 18 %"), 12 % everywhere else (the real
   lap's steepest outside Raidillon is about 13 % on a 40 m baseline). Then
   the whole profile is scaled to the published 102.2 m range (the terrain
   models give 105.5 m, the rest is trees).

   elev   metres above the lowest point of the lap (Courbe Paul Frere), at
          400 equal steps of lap fraction from the line; periodic, so the
          end of the lap meets the start exactly. */
const SPA_DATA = {
  range:102.2,
  anchors:[[210,30],[651,685],[728,795],[812,925],[2618,2050],[2695,2135],[2765,2290],[3143,2705],[3444,2925],[3696,3475],[4396,4130],[4480,4280],[4907,4570],[5264,4775],[6223,5655],[6755,6340],[6797,6420]],
  elev:[
    51.0,51.1,51.3,51.7,52.2,53.3,54.8,56.6,58.4,59.8,60.7,60.8,60.4,59.1,57.4,55.8,54.4,53.3,52.3,51.3,
    50.2,49.3,48.3,46.4,44.4,42.4,40.3,38.5,37.4,36.1,34.6,33.0,31.3,29.7,28.4,27.4,26.5,26.0,25.8,26.2,
    27.5,29.7,32.4,35.3,38.3,41.5,44.6,47.0,48.4,49.7,51.0,52.3,53.5,54.7,55.7,56.7,57.5,58.4,59.0,59.7,
    60.3,61.0,61.7,62.4,63.2,64.0,64.8,65.7,66.5,67.3,68.1,68.9,69.6,70.2,70.8,71.2,71.6,71.9,72.0,72.1,
    72.1,72.1,72.0,72.0,71.9,71.9,72.0,72.2,72.4,72.8,73.2,73.7,74.2,74.7,75.2,75.6,75.9,76.2,76.4,76.6,
    76.9,77.2,77.5,77.9,78.4,78.9,79.4,79.9,80.4,80.8,81.3,81.8,82.3,82.9,83.5,84.3,85.0,85.8,86.4,87.0,
    87.3,87.6,87.7,87.8,87.8,87.8,87.9,87.9,87.9,88.0,88.1,88.3,88.5,88.9,89.3,89.8,90.4,91.0,91.5,92.0,
    92.5,92.9,93.3,93.7,94.0,94.3,94.6,94.9,95.0,95.1,95.0,94.7,94.2,93.7,94.3,96.3,98.3,100.4,102.1,102.2,
    102.0,101.7,101.1,100.4,99.5,98.5,97.5,96.7,95.9,95.2,94.7,94.2,93.7,92.9,91.9,90.5,88.9,87.2,85.2,83.2,
    81.7,80.6,79.8,79.3,78.9,78.8,78.7,78.7,78.6,78.6,78.5,77.9,75.8,73.8,71.8,69.7,67.7,65.7,63.6,61.6,
    59.5,57.5,55.5,53.4,51.4,49.4,47.3,45.3,43.2,41.2,39.2,37.1,35.1,33.1,31.0,29.0,26.9,24.9,22.9,20.9,
    19.6,18.5,17.6,16.9,16.1,15.4,14.6,13.9,13.2,12.7,12.2,11.9,11.6,11.4,11.2,11.0,10.9,10.8,10.9,11.1,
    11.5,12.0,12.6,13.2,13.8,14.4,14.9,15.3,15.6,15.7,15.6,15.3,14.5,13.1,11.7,10.6,10.1,9.9,9.8,9.8,
    9.8,9.8,9.9,10.0,10.0,10.1,10.1,10.2,10.2,10.2,10.3,10.3,10.3,10.4,10.4,10.4,10.4,10.4,10.3,10.1,
    9.7,9.3,8.7,8.1,7.4,6.7,5.9,5.1,4.3,3.5,2.9,2.2,1.6,1.1,0.7,0.3,0.1,0.0,0.1,0.1,
    0.5,1.1,2.1,3.4,4.7,5.8,6.7,7.4,7.8,8.3,8.6,8.9,9.0,8.9,8.8,8.7,8.8,9.0,9.6,10.4,
    11.3,12.3,13.3,14.2,15.1,15.8,16.6,17.3,18.0,18.6,19.1,19.6,20.1,20.4,20.6,20.7,20.8,20.8,21.0,21.2,
    21.6,22.2,22.8,23.4,24.1,24.7,25.4,26.1,26.9,27.6,28.2,28.7,29.2,29.8,30.5,31.1,31.7,31.9,31.8,31.3,
    30.8,30.3,30.0,30.3,31.2,32.8,34.8,36.6,37.9,38.5,38.9,39.3,39.9,40.6,41.2,41.8,42.6,43.9,45.3,46.7,
    47.6,48.0,48.1,47.7,47.2,46.3,44.2,42.2,40.1,40.0,40.8,42.1,43.6,45.1,46.7,48.2,49.6,50.5,50.9,51.0
  ],
};

const SPAGEO = {
  get DATA(){ return SPA_DATA; },
  // the height at lap fraction u, eased between the samples
  elev(u){
    const s = SPA_DATA.elev, n = s.length, f = ((u % 1) + 1) % 1 * n, i = Math.floor(f), t = f - i;
    const k = 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
    return s[i % n] + (s[(i + 1) % n] - s[i % n]) * k;
  },
};

export { SPAGEO };
