import * as THREE from 'three';
import { TAU } from '../config/util.js';

/* ---------- 9d. the hoardings ---------------------------------------------
   Every brand along the walls is invented. They are painted to canvas at load
   and shared as a small set of materials, so a hundred panels round the lap
   cost a handful of textures and one draw call per colour after the bake.
   At night they are backlit: emissive, but only just — enough to read and to
   catch a little bloom, not enough to compete with the Sphere.
   ------------------------------------------------------------------------- */
const ADS = {
  W:512, H:160,
  mats:new Map(), texs:[],
  // name, tagline, panel, ink, logo mark, and the shape the mark is drawn as
  get VEGAS(){ return this._vegas || (this._vegas = this.LIST); },
  LIST:[
    ["UNDERCUT",      "Tastes like a fresh set of softs", "#0E1A3C", "#4CE0FF", "#4CE0FF", "bolt"],
    ["BOX BOX PIZZA", "We'll be there in one lap",        "#B8121A", "#FFE9C4", "#FFC23A", "wheel"],
    ["LUCKY LUKE'S",  "Drive-thru vows under 2.9s",       "#2A0B3E", "#FF74C8", "#FF74C8", "ring"],
    ["DIRTY AIR",     "Air fresheners in Tyre Smoke",     "#1D3226", "#9BE88A", "#9BE88A", "leaf"],
    ["BUFFET PALACE", "Downforce not included",           "#7A1540", "#FFD9A0", "#FFB43A", "fork"],
    ["DRS PLUMBING",  "When your pipes need an overtake", "#06324E", "#7FD4FF", "#7FD4FF", "arrow"],
    ["MR. BLUE FLAG", "Surprisingly legal pawn shop",     "#0B2C6B", "#FFFFFF", "#3E86FF", "flag"],
    ["GRAVEL TRAP",   "Beach resort, opening Turn 1",     "#8A6A22", "#FFF0C4", "#FFDC7A", "umbrella"],
    ["APEX DENTAL",   "We'll straighten your chicane",    "#0F3F3A", "#B8FFF0", "#5FE8CC", "tooth"],
    ["PORPOISE INN",  "The bounciest beds on the Strip",  "#123A6B", "#CFE4FF", "#7FB4FF", "wave"],
    ["SAFETY CAR",    "Rentals — nought to sixty, slowly","#C46A08", "#FFF1D2", "#FFD24A", "cone"],
    ["MARBLES",       "Off-line snack co. Best cold",     "#3A1430", "#FFC8E8", "#FF66B8", "dots"],
    ["BLUE FLAG BBQ", "You're being lapped. Eat anyway",  "#4A1008", "#FFD0A0", "#FF7A2A", "fire"],
    ["THE PIT WALL",  "Sports bar. Nobody listens here",  "#1A1D28", "#E8ECF4", "#FF3D62", "screen"],
    ["DOUBLE STACK",  "Pancakes. Two at once. Sorry",     "#6A3A08", "#FFE2B0", "#FFC048", "stack"],
    ["TYRE CLIFF",    "Adventure climbs, sudden drops",   "#2A2A2E", "#DCE2EA", "#8A93A0", "mountain"],
    ["SLIPSTREAM",    "Dry cleaning while you tow",       "#0C3A2A", "#C8FFE4", "#48E8A0", "wind"],
    ["FORMATION LAP", "Wedding cars. We go round twice",  "#3E0E2A", "#FFD4E8", "#FF4A9E", "ring"],
    ["PARC FERME",    "Storage units. Nobody may touch",  "#243A16", "#DCF0B4", "#A8E05A", "lock"],
    ["OVERSTEER",     "Barbers. Ask for the snap",        "#141822", "#FFFFFF", "#E8221A", "scissors"],
  ],
  /* Monaco's set: invented brands, Riviera colours, and the jokes are about
     money, yachts and how little room there is on this circuit */
  LISTS:{},
  MONACO:[
    ["ZERO OVERTAKE",    "Insurance for the place you're keeping", "#0E2A5A", "#F4E4B0", "#D4AF5A", "lock"],
    ["STERN-TO VALET",   "We park yachts. Mind the paintwork",      "#F4F2EA", "#0E2A5A", "#1E6FA8", "wave"],
    ["HAIRPIN ESPRESSO", "Fastest thing at Turn 6",                 "#3A1E12", "#F4E0C0", "#E8A040", "fire"],
    ["OFFSHORE MINTS",   "Refreshingly undeclared",                 "#0C4A44", "#E0FFF6", "#5FE8C8", "dots"],
    ["SECOND YACHT",     "Therapy for the owner of the smaller one","#1A2A4A", "#FFFFFF", "#6AB4F0", "arrow"],
    ["BARRIER KISS",     "Lip balm. Gentle contact only",           "#B8203A", "#FFE4EA", "#FF8AA0", "ring"],
    ["TABAC TAILORS",    "Suits cut inches from the wall",          "#141820", "#E8E4DA", "#C8A45A", "scissors"],
    ["CASINO CRESTS",    "Hats for going over the top",             "#2E1A4A", "#F4E8FF", "#C89AF0", "mountain"],
    ["LOW TIDE LOANS",   "Because the harbour never is",            "#1E6FA8", "#FFFFFF", "#F4D48A", "wave"],
    ["TUNNEL TANS",      "Instant bronze, no sunlight involved",    "#6A3A12", "#FFE8C8", "#FFB45A", "bolt"],
    ["PIT LANE PASTA",   "Al dente in 2.4 seconds",                 "#F4EEE0", "#A0201E", "#2E8C4A", "fork"],
    ["CHICANE CHIRO",    "Left, right, and back into line",         "#0E3A2E", "#DCFFEE", "#6AE8A8", "wind"],
    ["ROCK VIEW REALTY", "Studios from one modest fortune",         "#E8D8B8", "#3A2A14", "#B8683E", "stack"],
    ["POLITE APPLAUSE",  "Gloves for the grandstand",               "#1A1C24", "#F2F2F2", "#E8C04A", "screen"],
    ["QUAYSIDE QUICHE",  "Moored daily at Rascasse",                "#F6E6C8", "#6A3A1A", "#E8903A", "umbrella"],
    ["HELIPAD HAIRCUTS", "Lands on your head in minutes",           "#0A1E3A", "#E8F2FF", "#4AA8FF", "cone"],
    ["PARADE LAP LOAFERS","Lead the procession in comfort",         "#4A2A14", "#F8E8D0", "#D8A060", "flag"],
    ["BLIND PORTIER",    "Opticians. We'll see you round it",       "#123A6A", "#FFFFFF", "#8AC8FF", "tooth"],
    ["PARKING ACADEMY",  "Reversing into a berth since 1929",       "#2A3A1A", "#EEF6DC", "#A8D860", "leaf"],
    ["FULL LOCK FRITES", "Crisp through the tightest turn",         "#D8A020", "#2A1A06", "#F4F0E0", "wheel"],
  ],
  /* Silverstone's set: made-up British brands, and the jokes are about the
     weather, queues, tea, gravel and the A43 */
  SILVERSTONE:[
    ["DRIZZLE™ UMBRELLAS",  "Fits all weather. Especially this one",     "#1C3A5E", "#E8F0F8", "#7FB8E8", "umbrella"],
    ["MIND THE GAP INSURANCE","Becketts edition. Terms apply at 300 km/h", "#0E2A4A", "#FFFFFF", "#E8242C", "arrow"],
    ["PROPER TEA RACING",    "Pit stop in 2.0s. Brewing takes four minutes","#F2EAD8", "#2A3A1A", "#5A8A3A", "stack"],
    ["QUEUE SYSTEMS LTD",    "Because you're already in one",             "#2E2A3A", "#F2F2F2", "#F2C230", "dots"],
    ["GRAVEL TRAP GARDENS",  "Plants. Pebbles. Panic.",                   "#5A6A2A", "#FFF6D8", "#E8D07A", "leaf"],
    ["ROUNDABOUT TYRE CO.",  "Going round in circles since 1948",         "#141418", "#F2F2F2", "#E8242C", "wheel"],
    ["SAUSAGE ROLL ENERGY",  "Now with 20% more pastry",                  "#C8781E", "#FFF2D8", "#7A3A0E", "bolt"],
    ["POTHOLE REPAIR CO.",   "We know a track that doesn't need us",      "#2A2C30", "#F2D23A", "#F2D23A", "cone"],
    ["A43 PATIENCE CLINIC",  "Now seeing Sunday's traffic. Book Friday",  "#0E3A2E", "#DCFFEE", "#6AE8A8", "lock"],
    ["DAMP SQUIB FIREWORKS", "Reliably British since forever",            "#3A1430", "#FFC8E8", "#FF66B8", "fire"],
    ["BRAKING NEWS",         "Vale's hardest stop, delivered daily",      "#B8121A", "#FFFFFF", "#FFD24A", "screen"],
    ["HEDGEROW HOLIDAYS",    "Northamptonshire: mostly fields, all heart", "#3E6A2A", "#F4FFE8", "#C8E87A", "leaf"],
    ["WELLY WAREHOUSE",      "For the walk back to the car park",         "#1E5A2A", "#F2F2F2", "#F2C230", "mountain"],
    ["SCONE ZONE",           "Jam first? We'll race you for it",          "#F4E4C8", "#7A1A2A", "#C8323A", "dots"],
    ["FOUR SEASONS CAGOULES","Sun, rain, hail and Stowe, all in one lap", "#0C2A5A", "#E8F2FF", "#4AA8FF", "wind"],
    ["MAGGOTTS PEST CONTROL","Genuinely the name of a corner",            "#2A1A0E", "#FFE8C8", "#E8A040", "scissors"],
    ["BISCUIT DUNKERS FC",   "Sponsoring the long run since teatime",     "#5A2A12", "#FFE2B0", "#FFC048", "ring"],
    ["CLUB CORNER CARAVANS", "Pitch up. Get stuck. Love it",              "#E8E4D8", "#1A3A5A", "#3E86C8", "flag"],
  ],
  /* Zandvoort's set: made-up Dutch brands; the jokes are about cheese, bikes,
     wind, sand, banking and the colour orange */
  ZANDVOORT:[
    ["STROOPWAFEL RACING FUEL", "Now with extra caramel",                  "#8A4A12", "#FFE2B0", "#FFC048", "stack"],
    ["WINDMILL ENERGY",        "We were turning before it was cool",      "#1E5AA8", "#FFFFFF", "#9AD0FF", "wind"],
    ["BANKED UP INSURANCE",    "Eighteen degrees of cover",               "#0E2A4A", "#FFFFFF", "#FF7A00", "arrow"],
    ["BIKE LANE AUTHORITY",    "This is not a runway. Ring ring",         "#C8302A", "#FFFFFF", "#FFE0D8", "wheel"],
    ["KAAS & ZOON",            "Gouda grip, aged for one race weekend",   "#F2C230", "#3A2A06", "#C8781E", "dots"],
    ["SAND IN YOUR SANDWICH",  "Beach deli. Crunch included free",        "#E8D8AA", "#6A4A1A", "#C8902E", "umbrella"],
    ["ORANGE CRUSH TYRES",     "Now with 100% more orange",               "#FF7A00", "#FFFFFF", "#1A1C20", "wheel"],
    ["TULIP & CO CONCRETE",    "Dune-proof since 1948",                   "#A8A8A2", "#1A1C20", "#E8242C", "leaf"],
    ["HERRING EXPRESS",        "Raw, with onions, under 2.4 seconds",     "#2A5A7A", "#E8F2FF", "#9AC8E8", "fork"],
    ["DIKE & DAM PLUMBING",    "Holding back the sea since forever",      "#1E3A6A", "#E8F0FF", "#6AA8E0", "wave"],
    ["GEZELLIG CARAVANS",      "Pitch up at Hugenholtz. Stay a week",     "#F4EEE0", "#2A4A2A", "#5A9A4A", "flag"],
    ["CLOGWORKS",              "Safety footwear for the pit lane",        "#E8A020", "#2A1A06", "#8A4A12", "lock"],
    ["DUTCH COURAGE COFFEE",   "Brewed strong enough for Scheivlak",      "#3A1E12", "#F4E0C0", "#E8A040", "fire"],
    ["FLAT COUNTRY GYMS",      "Our only hill is Hunserug",               "#141820", "#F2F2F2", "#FF7A00", "mountain"],
    ["BITTERBAL BOX",          "Six for the grid, six for the parade",    "#B8681E", "#FFF2D8", "#7A3A0E", "dots"],
    ["NORTH SEA BREEZE MINTS", "Crosswind at Hunserug, now in your mouth","#0E4A44", "#E0FFF6", "#5FE8C8", "wind"],
    ["POLDER PARKING",         "Below sea level, above expectations",     "#2E3A2A", "#E8F2DC", "#A8D860", "screen"],
    ["HAGELSLAG HOLDINGS",     "Sprinkles on everything. No questions",   "#1A1410", "#FFE8F0", "#FF8AC0", "dots"],
  ],
  /* Spa's set: made-up Belgian brands; the jokes are about chocolate, waffles, beer,
     fries, cyclists, rain and the climb up Raidillon */
  SPA:[
    ["COCOA BRAKES",      "Pralines. Stops you dead at La Source",   "#3A1E12", "#F4E0C0", "#C8864A", "stack"],
    ["WAFFLE WIZARD",     "Dough not slow",                          "#E8B33A", "#3A2410", "#7A4A1A", "dots"],
    ["RAIDILLON RELISH",  "Tastes better flat out",                  "#B8121A", "#FFE9C4", "#FFC23A", "mountain"],
    ["DOUBLE FRITES",     "Fried twice, like Pouhon",                "#F4D23A", "#1E1E22", "#D8352A", "fork"],
    ["ABBEY ALE",         "Brewed by monks who never brake",         "#4A2A14", "#F8E8D0", "#E8A040", "fire"],
    ["PELOTON POTATOES",  "Mayonnaise sold by the climb",            "#0E3A2A", "#E0FFE8", "#6AE8A8", "wheel"],
    ["DRIZZLE INSURANCE", "It's sunny at Les Combes. Not here",      "#2A3A4E", "#DCE6F0", "#7FB4FF", "umbrella"],
    ["EAU ROUGE SPRINGS", "Mineral water. Slightly iron. Very fast", "#7A1E16", "#FFE4DA", "#FF8A6A", "wave"],
    ["BUS STOP BAKERY",   "Last stop before the line",               "#E8E0D0", "#3A2410", "#C0392B", "cone"],
    ["ARDENNES HAM CO.",  "Cured in fog since forever",              "#5A2E22", "#F4E0C8", "#E8A07A", "leaf"],
    ["KEMMEL KAYAKS",     "We know a straight when we see one",      "#0B2C6B", "#FFFFFF", "#3E86FF", "arrow"],
    ["MUSSEL MEMORY",     "Moules frites, every lap, same line",     "#14324A", "#E8F2FF", "#F4C04A", "ring"],
    ["SPECULOOS SLICKS",  "Crunchy compound. Dunk at your own risk", "#8A4A1E", "#FFF0D8", "#F4C890", "bolt"],
    ["COBBLE COMFORT",    "Saddles for people who chose cobbles",    "#1A1D28", "#E8ECF4", "#E8C04A", "flag"],
    ["FOUR SEASONS LAP",  "Weather tours. Bring all your tyres",     "#3E5A48", "#E8F4EE", "#A8E05A", "wind"],
    ["BLANCHIMONT BEDS",  "Mattresses you take flat out",            "#F2F2EE", "#1E3E6E", "#2F78B8", "screen"],
    ["PRALINE PIT CREW",  "Two seconds, one box of chocolates",      "#2E1A12", "#F4D8B0", "#D8A060", "lock"],
    ["TRIPLE HOP TAXI",   "Designated drivers for Stavelot",         "#0E1A3C", "#FFE08A", "#FFC23A", "tooth"],
    ["MAYO MAYOR",        "Elected on the fries vote",               "#F4F0E0", "#B8121A", "#E8B33A", "scissors"],
    ["DAMP SOCKS DEPOT",  "Camping at Spa? You will need us",        "#2A2A2E", "#DCE2EA", "#8A93A0", "umbrella"],
  ],
  /* Austin's set: made-up Texan brands; the jokes are about brisket, boots, hats,
     tacos, rodeo, oil and the size of everything */
  COTA:[
    ["BRISKET BOOST",        "Fourteen hours low and slow. Pit stop: 2.1s",   "#5A1E0E", "#FFE2C0", "#FF8A3A", "fire"],
    ["SPIN-OUT BOOTS",       "Made for walking back from Turn 1",             "#3A2210", "#F4E0C0", "#E8A040", "arrow"],
    ["TEN-GALLON TYRES",     "Fits a hat. Fits a horse. Fits a Hoss",         "#141820", "#F2F2F2", "#F2C230", "wheel"],
    ["BIG HOSS TRUCKS",      "Bed holds one horse. Two if they're friends",   "#8A1A14", "#FFF0D8", "#FFD24A", "flag"],
    ["TACO TURN-IN",         "Breakfast, lunch and the cool-down lap",        "#E8A020", "#2A1606", "#B8321A", "dots"],
    ["GUSHER OIL & LUBE",    "Strike it rich at the next pit stop",           "#0E2A3A", "#E8F2FF", "#4AA8FF", "bolt"],
    ["LONE STAR LARIATS",    "Rope a podium. Terms apply to bulls",           "#1E3A6A", "#FFFFFF", "#E8242C", "ring"],
    ["HOWDY HEDGES",         "Prickly pear trimming. Ouch is extra",          "#2E5A2A", "#F4FFE8", "#C8E87A", "leaf"],
    ["RODEO RETIREMENTS",    "Eight seconds is plenty. Rest up here",         "#6A3A12", "#FFE8C8", "#FFB45A", "mountain"],
    ["CHILI CRASH COOK-OFF", "Red flag if it's too mild",                     "#A8200E", "#FFF0D0", "#FFC048", "fire"],
    ["BLUEBONNET BAKERY",    "Pie so good the marshals stop to eat",          "#2A3E7A", "#F2EEFF", "#9AA8FF", "stack"],
    ["Y'ALL-WEATHER TENTS",  "Rain, shine or a very large cloud of dust",     "#E8D8B0", "#4A3010", "#B8683E", "umbrella"],
    ["DUSTY DRS DENTAL",     "We open wide at the end of the straight",       "#0F3F3A", "#B8FFF0", "#5FE8CC", "tooth"],
    ["COYOTE CAR WASH",      "Howling clean in under a lap",                  "#4A2A14", "#F8E8D0", "#D8A060", "wind"],
    ["CACTUS CUSHIONS",      "Seat covers for the sensitive",                 "#1E5A2A", "#F2F2F2", "#F2C230", "cone"],
    ["PEPPER PIT LANE",      "Hot sauce. Speed limit: 80, flavour: none",     "#B8121A", "#FFE9C4", "#FFC23A", "wheel"],
    ["HAT TRICK HATS",       "Win three. Wear three. Stack them",             "#2A1A0E", "#FFE8C8", "#E8A040", "stack"],
    ["SWEET TEA SPONSORS",   "So sweet it counts as a tyre compound",         "#F4E4C8", "#7A3A0A", "#E8902E", "dots"],
    ["BARBECUE BARRIER",     "Smoke signals for the second stint",            "#3A1410", "#FFD0A0", "#FF7A2A", "screen"],
    ["PUMPJACK PRESS",       "News that goes up and down. Mostly up",         "#1A1D28", "#E8ECF4", "#FF3D62", "arrow"],
  ],
  /* Interlagos's set: made-up Brazilian brands; the jokes are about coffee, football, samba,
     juice, traffic jams, barbecue, rain and the climb up to the line */
  INTERLAGOS:[
    ["CAFEZINHO TURBO",    "Small cup. Big power unit",                "#3A1E12", "#F4E0C0", "#E8A040", "fire"],
    ["SENNA S SAMBA",      "Left, right, and shake it down the hill",  "#2E8B45", "#FFF6C8", "#F4D23A", "wave"],
    ["MARGINAL JAM CO.",   "We sell the traffic you sat in",           "#1A1D28", "#E8ECF4", "#E8C04A", "cone"],
    ["CHURRASCO PIT STOP", "Twelve meats in 2.4 seconds",              "#6A1E10", "#FFE2C0", "#FF8A3A", "fork"],
    ["GOLAÇO GLOVES",      "Keepers' gloves. Also for wet laps",       "#F4D23A", "#0E3A22", "#2E8B45", "flag"],
    ["SUCO DO LAGO",       "Fruit juice. Not from the lake",           "#E8742A", "#FFF0D8", "#F4D23A", "dots"],
    ["UMBRELLA URGENTE",   "Sun at 2, storm at 2:05",                  "#2F5FB8", "#FFFFFF", "#F4D23A", "umbrella"],
    ["PÃO DE QUEIJO PRO",  "Cheese bread with downforce",              "#F4E4B0", "#6A3A0A", "#E8902E", "stack"],
    ["SUBIDA STAIRMASTER", "Train like the climb to the line",         "#0F3F3A", "#B8FFF0", "#5FE8CC", "mountain"],
    ["BICO DE PATO SPA",   "Hairpin treatments, tight finish",         "#7A1540", "#FFD9E8", "#FF7AA8", "scissors"],
    ["HELI-TÁXI JÁ",       "Over the jam in four minutes",             "#0B2C6B", "#FFFFFF", "#3E86FF", "arrow"],
    ["GARRA BOOTS",        "Studs for the bumps in Turn 1",            "#1E1E22", "#F2F2F2", "#F4D23A", "tooth"],
    ["MERGULHO SWIMWEAR",  "For when you dive into the lake section",  "#14324A", "#E8F2FF", "#4AA8FF", "wave"],
    ["AÇAÍ ACELERA",       "Purple fuel for green flags",              "#4A1A5A", "#F4E0FF", "#C88AF0", "bolt"],
    ["JUNÇÃO JUNCTION",    "Furniture that joins you up the hill",     "#8A5A2A", "#FFF0D8", "#F4C890", "lock"],
    ["TORCIDA TICKETS",    "Loud seats. Very loud seats",              "#2E8B45", "#F4D23A", "#F2F2F2", "screen"],
    ["CHUVA CHEGANDO",     "Weather app. It says rain. It's right",    "#3A4250", "#DCE2EA", "#8AA8D8", "umbrella"],
    ["PASTEL DA PISTA",    "Fried at Laranjinha, eaten at Pinheirinho","#F4D23A", "#3A2410", "#C0392B", "ring"],
    ["FEIJOADA FUEL",      "Saturday's stew, Sunday's stint",          "#2A1A12", "#F4D8B0", "#D8A060", "fire"],
    ["BALÃO BALLOONS",     "Rides over the bowl. Mind the storm",      "#F2F2EE", "#2E8B45", "#F4D23A", "wind"],
  ],
  use(set){
    const want = set === "monaco" ? this.MONACO : set === "silverstone" ? this.SILVERSTONE : set === "zandvoort" ? this.ZANDVOORT : set === "cota" ? this.COTA : set === "spa" ? this.SPA : set === "interlagos" ? this.INTERLAGOS : this.VEGAS;
    if(this.LIST === want) return;
    this.dispose(); this.LIST = want;
  },

  mark(g, kind, x, y, r, col){
    g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col;
    g.lineWidth = r * 0.22; g.lineCap = "round"; g.lineJoin = "round";
    const P = (...pts) => { g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a * r, b * r) : g.moveTo(a * r, b * r)); g.closePath(); g.fill(); };
    switch(kind){
      case "bolt": P([0.1,-1],[0.6,-0.1],[0.18,-0.05],[0.5,1],[-0.55,-0.05],[-0.05,-0.1]); break;
      case "wheel": g.beginPath(); g.arc(0,0,r,0,TAU); g.fill();
        g.globalCompositeOperation="destination-out"; g.beginPath(); g.arc(0,0,r*0.44,0,TAU); g.fill();
        g.globalCompositeOperation="source-over"; break;
      case "ring": g.lineWidth=r*0.3; g.beginPath(); g.arc(0,r*0.15,r*0.75,0,TAU); g.stroke();
        P([0,-1],[0.3,-0.55],[-0.3,-0.55]); break;
      case "leaf": g.beginPath(); g.ellipse(0,0,r*0.5,r,0.5,0,TAU); g.fill(); break;
      case "fork": for(const dx of [-0.5,0,0.5]) g.fillRect(dx*r-r*0.1, -r, r*0.2, r*0.9);
        g.fillRect(-r*0.16,-r*0.2,r*0.32,r*1.2); break;
      case "arrow": P([-1,-0.3],[0.2,-0.3],[0.2,-0.8],[1,0],[0.2,0.8],[0.2,0.3],[-1,0.3]); break;
      case "flag": g.fillRect(-r*0.9,-r,r*0.2,r*2);
        for(let i=0;i<3;i++) for(let j=0;j<2;j++) if((i+j)%2===0) g.fillRect(-r*0.7+i*r*0.55,-r+j*r*0.55,r*0.55,r*0.55); break;
      case "umbrella": g.beginPath(); g.arc(0,r*0.2,r,Math.PI,0); g.fill(); g.fillRect(-r*0.08,r*0.2,r*0.16,r*0.8); break;
      case "tooth": g.beginPath(); g.moveTo(-r,-r*0.6); g.quadraticCurveTo(0,-r*1.3,r,-r*0.6);
        g.lineTo(r*0.4,r); g.lineTo(0,r*0.1); g.lineTo(-r*0.4,r); g.closePath(); g.fill(); break;
      case "wave": g.lineWidth=r*0.3; g.beginPath();
        for(let i=-1;i<=1;i+=0.02) g.lineTo(i*r, Math.sin(i*4)*r*0.5); g.stroke(); break;
      case "cone": P([0,-1],[0.7,1],[-0.7,1]); g.fillRect(-r*0.9,r*0.85,r*1.8,r*0.3); break;
      case "dots": for(const [a,b] of [[-0.6,-0.4],[0.4,-0.6],[0,0.2],[0.7,0.5],[-0.5,0.6]]){
          g.beginPath(); g.arc(a*r,b*r,r*0.3,0,TAU); g.fill(); } break;
      case "fire": g.beginPath(); g.moveTo(0,-r); g.quadraticCurveTo(r,0,r*0.4,r);
        g.lineTo(-r*0.4,r); g.quadraticCurveTo(-r,0,0,-r); g.fill(); break;
      case "screen": g.fillRect(-r,-r*0.75,r*2,r*1.4); g.fillRect(-r*0.25,r*0.65,r*0.5,r*0.35); break;
      case "stack": for(let i=0;i<3;i++){ g.beginPath(); g.ellipse(0,-r*0.5+i*r*0.55,r,r*0.3,0,0,TAU); g.fill(); } break;
      case "mountain": P([-1,0.8],[-0.2,-0.7],[0.3,0],[0.6,-0.4],[1,0.8]); break;
      case "wind": g.lineWidth=r*0.24; g.beginPath();
        g.moveTo(-r,-r*0.4); g.lineTo(r*0.5,-r*0.4); g.moveTo(-r,0); g.lineTo(r,0);
        g.moveTo(-r,r*0.4); g.lineTo(r*0.2,r*0.4); g.stroke(); break;
      case "lock": g.lineWidth=r*0.24; g.beginPath(); g.arc(0,-r*0.25,r*0.5,Math.PI,0); g.stroke();
        g.fillRect(-r*0.7,-r*0.25,r*1.4,r*1.1); break;
      case "scissors": g.lineWidth=r*0.2; g.beginPath(); g.moveTo(-r*0.7,-r*0.8); g.lineTo(r*0.5,r*0.5);
        g.moveTo(r*0.7,-r*0.8); g.lineTo(-r*0.5,r*0.5); g.stroke();
        g.beginPath(); g.arc(-r*0.6,r*0.7,r*0.3,0,TAU); g.arc(r*0.6,r*0.7,r*0.3,0,TAU); g.fill(); break;
    }
    g.restore();
  },

  canvas(i){
    const A = this.LIST[i % this.LIST.length];
    const [name, tag, panel, ink, logo, kind] = A;
    const W = this.W, H = this.H;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = panel; g.fillRect(0, 0, W, H);
    // a wash across the panel so it is not one flat rectangle of colour
    const gd = g.createLinearGradient(0, 0, W, H);
    gd.addColorStop(0, "rgba(255,255,255,.10)"); gd.addColorStop(0.5, "rgba(255,255,255,0)");
    gd.addColorStop(1, "rgba(0,0,0,.22)");
    g.fillStyle = gd; g.fillRect(0, 0, W, H);
    // a stripe of the mark's colour down the left, with the mark on it
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(0, 0, H, H);
    this.mark(g, kind, H * 0.5, H * 0.5, H * 0.26, logo);
    g.fillStyle = ink; g.textAlign = "left"; g.textBaseline = "alphabetic";
    let fs = H * 0.34;
    g.font = "800 italic " + fs.toFixed(0) + "px 'Saira Condensed',Impact,sans-serif";
    while(g.measureText(name).width > W - H - 24 && fs > 12){
      fs -= 2; g.font = "800 italic " + fs.toFixed(0) + "px 'Saira Condensed',Impact,sans-serif";
    }
    g.fillText(name, H + 12, H * 0.48);
    g.fillStyle = logo;
    let ts = H * 0.155;
    g.font = "700 " + ts.toFixed(0) + "px 'Saira Condensed',sans-serif";
    while(g.measureText(tag).width > W - H - 24 && ts > 8){
      ts -= 1; g.font = "700 " + ts.toFixed(0) + "px 'Saira Condensed',sans-serif";
    }
    g.fillText(tag, H + 12, H * 0.74);
    // the rule under the wordmark, and a thin frame
    g.fillStyle = logo; g.fillRect(H + 12, H * 0.55, Math.min(W - H - 24, 160), 3);
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    return cv;
  },

  tex(i){
    i = ((i % this.LIST.length) + this.LIST.length) % this.LIST.length;
    if(this.texs[i]) return this.texs[i];
    const t = new THREE.CanvasTexture(this.canvas(i));
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    this.texs[i] = t; return t;
  },

  // one shared material per advert, per lit state
  mat(seed, night){
    const i = Math.abs(Math.floor((seed || 0) * 977)) % this.LIST.length;
    const key = i + "|" + (night ? 1 : 0);
    let m = this.mats.get(key);
    if(m) return m;
    const t = this.tex(i);
    m = new THREE.MeshStandardMaterial({
      map:t, roughness:0.72, metalness:0.0, side:THREE.DoubleSide,
      emissiveMap:night ? t : null,
      emissive:night ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
      emissiveIntensity:night ? 0.62 : 0,
    });
    this.mats.set(key, m); return m;
  },
  dispose(){ for(const t of this.texs) if(t) t.dispose(); this.texs.length = 0; this.mats.clear(); },
};


export { ADS };
