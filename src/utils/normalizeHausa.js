export function normalizeHausa(text) {
  if (!text) return "";

  let t = text.toLowerCase().trim();

  // Remove accents & diacritics
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Replace Hausa special letters
  t = t
    .replace(/ƙ/g, "k")
    .replace(/ɗ/g, "d")
    .replace(/ṭ/g, "t")
    .replace(/’/g, "'")
    .replace(/"/g, "");

  // --- SYNONYM NORMALIZATION ---

  const synonymReplacements = {
    // Penis / man’s organ
    "mazakuta|gaba|al'aurar namiji|azakar|azzakari|burar|guduma": "azzakari",
    "karama|kankacewa|karancin girma|tsunkulewa|tsunkule|gajarta": "kankancewa",
    "kauri|siriri|babu kauri|babu tsawo": "kankancewa",
    "kari girma|karin girma|karawa|kara girma": "karin_girma",

    // Sexual desire & performance
    "sha'awa|son jima'i|libido|naci|buri|bukata": "shaawa",
    "karin sha'awa|rise libido": "karin_shaawa",
    "saurin inzali|fitar maniyyi da wuri|early discharge|release early": "saurin_inzali",
    "jinkai|durkushewa|rashin tsayi|rashin juriya": "saurin_inzali",

    // Semen / maniyyi
    "maniyyi|maniyi|maniyyi|mani|ruwa|farin ruwa|ruwan maniyyi|ruwa mai fitowa": "maniyyi",
    "karancin maniyyi|mani kadan": "karancin_maniyyi",

    // Pimples / rash
    "kuraje|kurji|pimples|fatar jiki|tsiro a gaba": "kuraje",

    // Health / Cure terms
    "magani|hadin|treatment|kulawa": "magani",
    "babu illa|side effect|illoli": "babu_illa",
    "inganci|tabbaci|amfani|sakamako": "inganci",

    // Masturbation
    "istimina'i|istimna'i|masturbation|wasa da kai|taimakon kai": "istimnai",
  };

  for (const [pattern, replacement] of Object.entries(synonymReplacements)) {
    t = t.replace(new RegExp(`\\b(${pattern})\\b`, "g"), replacement);
  }

  // --- LOCATION NORMALIZATION (Nigeria / Niger / Cameroon) ---

  const locations = {
    kano: "kano",
    kaduna: "kaduna",
    zaria: "zaria",
    bauchi: "bauchi",
    gombe: "gombe",
    lagos: "lagos",
    abuja: "abuja",
    adamawa: "adamawa",
    maiduguri: "borno",
    sokoto: "sokoto",
    katsina: "katsina",
    kebbi: "kebbi",
    zamfara: "zamfara",
    jigawa: "jigawa",
    kogi: "kogi",
    oyo: "oyo",
    edo: "edo",
    delta: "delta",
    abia: "abia",
    benue: "benue",
    plateau: "plateau",
    taraba: "taraba",
    rivers: "rivers",
    imo: "imo",
    akwa: "akwa_ibom",
    cross: "cross_river",
    ebonyi: "ebonyi",
    enugu: "enugu",

    // Niger
    niamey: "niamey",
    maradi: "maradi",
    zinder: "zinder",
    tahoua: "tahoua",
    agadez: "agadez",
    diffa: "diffa",
    tillaberi: "tillaberi",
    dosso: "dosso",

    // Cameroon
    yaounde: "yaounde",
    douala: "douala",
    buea: "buea",
    bamenda: "bamenda",
    garoua: "garoua",
    maroua: "maroua",
    bafoussam: "bafoussam",
  };

  for (const [k, v] of Object.entries(locations)) {
    t = t.replace(new RegExp(`\\b${k}\\b`, "g"), v);
  }

  return t;
}
