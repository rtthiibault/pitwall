/* Icônes de la R&D : une par pièce, dessinées comme des croquis techniques de F1
   (vues de profil, de face ou de dessus). Grille 80 × 70.
   Trait principal (2,2) pour la silhouette, trait fin atténué pour les détails : nervures,
   perçages, cannelures, flux d'air. La couleur vient du trait de l'élément <svg> parent. */
(function (F1) {
  // détails : trait fin, atténué
  const d = (s) => `<g stroke-width="1.3" opacity=".55">${s}</g>`;
  // flux d'air : pointillés fins
  const air = (s) => `<g stroke-width="1.2" opacity=".5" stroke-dasharray="3 3">${s}</g>`;
  // pignon à dents réelles : centre, rayon primitif, nombre de dents, hauteur de dent
  function gear(cx, cy, r, n, h = 3) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, s = (Math.PI * 2) / n;
      const p = (ang, rr) => `${(cx + Math.cos(ang) * rr).toFixed(1)} ${(cy + Math.sin(ang) * rr).toFixed(1)}`;
      pts.push(p(a, r - h / 2), p(a + s * 0.15, r + h / 2), p(a + s * 0.45, r + h / 2), p(a + s * 0.6, r - h / 2));
    }
    return `<path d="M${pts.join(' L')} Z"/>`;
  }
  const ring = (cx, cy, r, n, rr = 1.2) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" r="${rr}"/>`; }).join('');

  const A = {
    /* ---------- Aérodynamique ---------- */
    // aileron avant vu de trois quarts : plan principal, deux volets, dérive
    fw_main: `<path d="M6 47 C24 45 44 43 63 41 L63 46 C44 48 24 51 6 52 Z"/><path d="M63 22 H70 C72 22 73 23 73 25 V52 C73 54 72 55 70 55 H63 Z"/>`
      + d(`<path d="M12 40 C28 38 46 36 63 34"/><path d="M18 34 C32 32 48 30 63 28"/><path d="M6 52 L4 56"/>`),
    // profil de volet avec la lèvre Gurney au bord de fuite
    fw_gurney: `<path d="M8 40 C14 31 38 27 64 34 C48 35 26 38 8 42 Z"/><path d="M64 34 V25" stroke-width="3"/>`
      + air(`<path d="M6 24 C24 18 48 16 70 20"/><path d="M68 34 C70 42 74 46 78 48"/>`),
    // dérive d'aileron avant qui écarte l'air de la roue
    fw_end: `<path d="M16 58 V24 C16 18 20 15 26 15 H50 C55 15 57 19 55 23 L44 58 Z"/>`
      + d(`<path d="M22 46 L44 26 M22 54 L48 32"/><path d="M58 30 A18 18 0 0 1 76 48" stroke-dasharray="3 3"/>`) + air(`<path d="M8 36 C28 34 50 22 72 14"/>`),
    // plancher vu de dessous : deux canaux Venturi et la planche centrale
    floor: `<path d="M28 6 H52 L56 20 L70 26 V62 H10 V26 L24 20 Z"/><path d="M31 22 C29 36 22 46 19 62"/><path d="M49 22 C51 36 58 46 61 62"/>`
      + d(`<path d="M37 24 V62 M43 24 V62"/><path d="M24 30 C23 40 18 50 15 62"/><path d="M56 30 C57 40 62 50 65 62"/>`),
    // diffuseur vu de l'arrière : rampe, cloisons et bosse centrale
    diffuser: `<path d="M6 58 L18 28 H62 L74 58 Z"/><path d="M31 58 C33 46 47 46 49 58"/>`
      + d(`<path d="M27 28 L21 58 M53 28 L59 58 M40 28 V46"/><path d="M18 28 H62 L60 22 H20 Z"/>`),
    // rétroviseur profilé sur son mât
    mirrors: `<path d="M14 28 C14 21 20 18 28 18 H58 C64 18 67 22 67 28 C67 34 64 38 58 38 H28 C20 38 14 35 14 28 Z"/><path d="M34 38 L28 56 M48 38 L52 56"/><path d="M20 56 H60"/>`
      + d(`<path d="M24 24 H56 C60 24 61 27 61 28 C61 30 60 32 56 32 H24 C21 32 20 30 20 28 C20 26 21 24 24 24 Z"/>`),
    // roue avec flasque carénée 2026
    rims: `<circle cx="40" cy="35" r="26"/><circle cx="40" cy="35" r="17"/><path d="M37 32 H43 L45 35 L43 38 H37 L35 35 Z"/>`
      + d(`<circle cx="40" cy="35" r="21.5"/><path d="M27 23 A17 17 0 0 1 53 23"/><path d="M24 44 A17 17 0 0 0 33 50"/>`),
    // ponton vu de profil, creusé en partie basse (undercut)
    sidepods: `<path d="M6 24 H46 C58 24 67 29 73 40 V44 C62 44 54 47 48 52 H24 C17 52 12 46 14 40 Z"/><path d="M6 24 V38 H14"/>`
      + d(`<path d="M20 30 H44"/>`) + air(`<path d="M6 60 C28 58 50 58 76 50"/>`),
    // aileron arrière basse traînée vu de l'arrière : dérives, plan fin, mât central
    rw: `<path d="M8 14 H14 V50 H8 Z M66 14 H72 V50 H66 Z"/><path d="M14 30 H66 V35 H14 Z"/><path d="M40 35 V60"/>`
      + d(`<path d="M14 23 H66"/><path d="M32 60 H48"/>`),
    // aileron arrière actif : volet ouvert en ligne droite (mode X), axe et vérin
    active: `<path d="M12 46 C24 39 42 37 58 39 C44 41 28 45 12 48 Z"/><path d="M44 31 C52 24 62 21 72 21" stroke-width="3"/><circle cx="44" cy="32" r="2.5"/>`
      + d(`<path d="M58 39 C64 38 70 36 74 34"/><path d="M44 32 L40 52"/>`) + `<path d="M66 32 A10 10 0 0 0 70 26"/><path d="M68 24 L70 26 L72 23"/>`,
    // nez vu de profil, avec les supports et l'aileron avant
    nose: `<path d="M4 42 C14 42 28 38 42 32 L74 28 V42 L42 44 C28 46 14 46 4 45 Z"/><path d="M26 45 L28 56 M40 44 L40 56"/><path d="M12 56 H62"/>`
      + d(`<path d="M42 32 V44"/><path d="M14 52 H54"/>`),
    // bord de plancher : ailettes et volutes qui scellent l'effet de sol
    floor_edge: d(`<path d="M6 18 H74 V30 H6 Z"/><path d="M14 18 V30 M26 18 V30 M38 18 V30 M50 18 V30 M62 18 V30"/>`)
      + `<path d="M6 30 H74"/><path d="M12 30 C14 40 22 44 30 44"/><path d="M30 30 C32 40 40 44 48 44"/><path d="M48 30 C50 40 58 44 66 44"/>` + air(`<path d="M6 56 C26 52 46 52 74 56"/>`),
    // écope de frein devant la roue, avec ses ailettes
    brake_ducts: d(`<circle cx="46" cy="38" r="24" stroke-dasharray="3 3"/><circle cx="46" cy="38" r="9"/>`)
      + `<path d="M14 22 C20 15 32 13 42 16 L44 30 C38 28 30 29 26 34 Z"/><path d="M16 46 H34 M14 53 H30"/>` + air(`<path d="M2 20 H12"/>`),
    // carrosserie arrière « taille de guêpe » vue de dessus
    engine_cover: `<path d="M6 18 C28 18 40 21 52 27 C60 31 66 33 74 33 V37 C66 37 60 39 52 43 C40 49 28 52 6 52 Z"/>`
      + d(`<path d="M6 35 H70"/><circle cx="16" cy="35" r="5"/>`) + air(`<path d="M30 12 C48 14 62 24 76 30"/><path d="M30 58 C48 56 62 46 76 40"/>`),
    // beam wing : deux petits plans entre le diffuseur et l'aileron arrière
    beam_wing: d(`<path d="M10 12 H70 V17 H10 Z"/><path d="M6 64 L14 54 H66 L74 64"/>`)
      + `<path d="M12 34 C30 30 50 30 68 34 V38 C50 34 30 34 12 38 Z"/><path d="M14 44 C30 41 50 41 66 44"/><path d="M40 17 V30 M40 46 V54"/>`,

    /* ---------- Châssis ---------- */
    // suspension avant à poussoir : triangles, porte-moyeu, roue
    susp_f: `<path d="M10 22 L54 30 L10 36"/><path d="M10 42 L54 50 L10 56"/><path d="M54 26 H60 V54 H54 Z"/><path d="M57 50 L18 20" stroke-width="2.6"/>`
      + d(`<path d="M62 12 A26 26 0 0 1 62 64"/><path d="M10 18 V60"/>`),
    // suspension arrière à tirant : la biellette part du haut du porte-moyeu vers le bas du châssis
    susp_r: `<path d="M70 22 L26 30 L70 36"/><path d="M70 42 L26 50 L70 56"/><path d="M20 26 H26 V54 H20 Z"/><path d="M23 28 L62 58" stroke-width="2.6"/>`
      + d(`<path d="M18 12 A26 26 0 0 0 18 64"/><path d="M70 18 V60"/>`),
    // amortisseur et ressort sur le basculeur
    dampers: `<path d="M8 35 H22"/><rect x="22" y="28" width="22" height="14" rx="2"/><path d="M44 35 H50 L53 27 L57 43 L61 27 L65 43 L68 35 H72"/><path d="M72 22 L78 35 L72 48 Z"/>`
      + d(`<path d="M28 28 V42 M38 28 V42"/><circle cx="74" cy="35" r="1.6"/>`),
    // barre anti-roulis en U, biellettes et paliers
    arb: `<path d="M14 26 V40 C14 46 18 49 24 49 H56 C62 49 66 46 66 40 V26"/><path d="M14 26 L7 16 M66 26 L73 16"/>`
      + d(`<rect x="26" y="45" width="8" height="8" rx="1"/><rect x="46" y="45" width="8" height="8" rx="1"/><circle cx="7" cy="16" r="2"/><circle cx="73" cy="16" r="2"/>`),
    // disque ventilé percé et étrier
    brakes: `<circle cx="36" cy="38" r="24"/><circle cx="36" cy="38" r="9"/><path d="M52 12 C64 17 70 26 72 38 L62 40 C60 31 55 24 47 21 Z"/>`
      + d(ring(36, 38, 16.5, 14, 1.3) + ring(36, 38, 9, 5, 0.9)),
    // endurance des freins : disque ventilé vu en coupe, usure maîtrisée, chaleur dissipée
    brake_life: `<rect x="14" y="20" width="10" height="44" rx="2"/><rect x="30" y="20" width="10" height="44" rx="2"/><path d="M24 26 H30 M24 34 H30 M24 42 H30 M24 50 H30 M24 58 H30"/><path d="M46 42 H72"/>`
      + d(`<path d="M50 30 C54 26 50 22 54 18 M60 30 C64 26 60 22 64 18 M70 30 C74 26 70 22 74 18"/><path d="M14 20 V12 M24 20 V14 M30 20 V14 M40 20 V12" stroke-dasharray="2 2"/>`),
    // moyeu et roulement à billes céramique
    hubs: `<circle cx="36" cy="36" r="24"/><circle cx="36" cy="36" r="12"/><path d="M60 30 H74 V42 H60"/>`
      + d(ring(36, 36, 18, 10, 2.6) + `<circle cx="36" cy="36" r="4"/>`),
    // répartition des masses : silhouette, centre de gravité, charges aux essieux
    balance: `<path d="M4 46 C12 41 24 38 40 36 C52 34 64 36 76 41 V48 H4 Z"/><circle cx="18" cy="50" r="7"/><circle cx="62" cy="50" r="7"/><circle cx="40" cy="20" r="7"/>`
      + `<path d="M40 13 V27 M33 20 H47"/><path d="M40 13 A7 7 0 0 1 47 20 H40 Z M40 27 A7 7 0 0 1 33 20 H40 Z" fill="currentColor" stroke="none"/>` + d(`<path d="M18 30 V40 M15 37 L18 40 L21 37 M62 30 V40 M59 37 L62 40 L65 37"/>`),
    // lest en tungstène boulonné dans le plancher
    ballast: `<path d="M4 50 H76 V56 H4 Z"/><rect x="16" y="34" width="20" height="16" rx="1"/><rect x="44" y="34" width="20" height="16" rx="1"/>`
      + d(`<circle cx="20" cy="42" r="1.4"/><circle cx="32" cy="42" r="1.4"/><circle cx="48" cy="42" r="1.4"/><circle cx="60" cy="42" r="1.4"/><path d="M40 12 V28 M35 23 L40 28 L45 23"/>`),
    // crémaillère : tube, biellettes, pignon et colonne
    steering: `<rect x="18" y="32" width="44" height="10" rx="3"/><path d="M18 37 L5 30 M62 37 L75 30"/><path d="M40 32 V18"/><path d="M28 10 C28 6 52 6 52 10 L50 18 H30 Z"/>`
      + d(`<path d="M24 42 V45 M28 42 V45 M32 42 V45 M36 42 V45 M44 42 V45 M48 42 V45 M52 42 V45 M56 42 V45"/><circle cx="40" cy="37" r="3"/><circle cx="5" cy="30" r="2"/><circle cx="75" cy="30" r="2"/>`),
    // monocoque carbone vue de profil, tissage visible
    mono: `<path d="M4 48 L8 32 C18 27 32 25 44 25 L52 31 H76 V48 Z"/><path d="M44 25 L52 31"/>`
      + d(`<path d="M14 46 L26 30 M22 46 L36 28 M30 46 L46 28 M38 46 L54 32 M46 46 L60 32 M54 46 L68 32 M62 46 L74 34"/>`),
    // halo en titane vu de trois quarts avant
    halo: `<path d="M12 54 C12 32 24 18 40 18 C56 18 68 32 68 54"/><path d="M17 54 C17 35 27 23 40 23 C53 23 63 35 63 54"/><path d="M40 18 C39 30 36 42 32 56" stroke-width="3"/>`
      + d(`<path d="M8 54 H22 M58 54 H72 M26 58 H38"/>`),

    /* ---------- Groupe propulseur ---------- */
    // V6 vu de face : deux rangées de cylindres, carter, vilebrequin
    ice: `<path d="M18 42 L8 20 L24 13 L34 36 Z"/><path d="M46 36 L56 13 L72 20 L62 42 Z"/><path d="M18 42 H62 V56 C62 58 60 60 58 60 H22 C20 60 18 58 18 56 Z"/><circle cx="40" cy="48" r="4"/>`
      + d(`<path d="M14 18 L20 31 M28 15 L33 27 M52 15 L47 27 M66 18 L60 31"/><path d="M34 36 L40 44 L46 36"/>`),
    // longévité moteur : piston, segments, bielle et maneton
    engine_life: `<path d="M26 10 H54 V30 H26 Z"/><path d="M36 30 L34 50 M44 30 L46 50"/><circle cx="40" cy="54" r="8"/><circle cx="40" cy="20" r="3"/>`
      + d(`<path d="M26 15 H54 M26 19 H54"/><circle cx="40" cy="54" r="3"/>`),
    // injecteur haute pression et jet de carburant
    injection: `<path d="M35 6 H45 V14 H47 V40 L43 48 H37 L33 40 V14 H35 Z"/><path d="M47 22 H66 V26 H47"/>`
      + d(`<path d="M33 30 H47 M33 34 H47"/>`) + `<g stroke-width="1.2" stroke-dasharray="2 2"><path d="M40 50 L30 64 M40 50 L36 65 M40 50 L44 65 M40 50 L50 64"/></g>`,
    // turbocompresseur : volute et roue de compresseur
    turbo: `<path d="M34 22 A16 16 0 1 0 50 38 V22 Z"/><path d="M50 22 H70 V32 H50"/><circle cx="34" cy="38" r="5"/>`
      + d(`<path d="M34 33 C38 29 44 30 46 34 M39 38 C43 42 42 48 38 50 M34 43 C30 47 24 46 22 42 M29 38 C25 34 26 28 30 26"/>`),
    // soupape de décharge : capsule de pilotage, tige, clapet
    wastegate: `<rect x="26" y="8" width="28" height="14" rx="5"/><path d="M40 22 V42"/><path d="M28 42 H52 L48 49 H32 Z"/><path d="M10 52 H70 M10 62 H70"/>`
      + d(`<path d="M30 15 H50"/><path d="M60 57 H74 M70 54 L74 57 L70 60"/>`),
    // prise d'air au-dessus de l'arceau
    airbox: `<path d="M12 62 L28 12 H52 L68 62"/><path d="M31 21 C31 15 49 15 49 21 C49 30 31 30 31 21 Z"/>`
      + d(`<path d="M40 16 V29"/><path d="M22 62 L34 32 H46 L58 62"/>`) + air(`<path d="M40 2 V10"/>`),
    // plenum carbone et trompettes d'admission
    plenum: `<rect x="8" y="38" width="64" height="18" rx="3"/>` + [18, 30, 42, 54, 66].slice(0, 3).concat([]).map(() => '').join('')
      + [16, 32, 48, 64].map((x) => `<path d="M${x - 4} 38 V26 L${x - 8} 14 H${x + 8} L${x + 4} 26 V38"/>`).join('') + d(`<path d="M14 47 H66"/>` + [16, 32, 48, 64].map((x) => `<path d="M${x - 6} 18 H${x + 6}"/>`).join('')),
    // échappement central et sortie derrière l'aileron
    exhaust: `<path d="M6 52 C22 52 28 34 44 32 H64"/><path d="M6 46 C20 46 26 28 44 26 H64"/><path d="M64 24 C70 24 72 26 72 29 C72 32 70 34 64 34 Z"/>`
      + d(`<path d="M74 22 C78 25 74 28 78 31 M76 18 C80 21 76 24 80 27"/>`),
    // collecteurs de longueur égale vers le collecteur commun
    manifolds: `<rect x="6" y="14" width="8" height="44" rx="1"/><path d="M14 20 C34 20 40 32 60 33 M14 36 H60 M14 52 C34 52 40 40 60 39"/><path d="M60 30 H74 V42 H60 Z"/>`
      + d(`<circle cx="10" cy="20" r="2"/><circle cx="10" cy="36" r="2"/><circle cx="10" cy="52" r="2"/>`),
    // MGU-K : moteur électrique, ailettes, arbre cannelé, connecteur haute tension
    mguk: `<rect x="14" y="24" width="42" height="28" rx="6"/><path d="M56 34 H74 M56 42 H74"/><path d="M22 24 V16 H32 V24"/>`
      + d(`<path d="M24 28 V48 M30 28 V48 M36 28 V48 M42 28 V48 M48 28 V48"/><path d="M62 34 V42 M66 34 V42 M70 34 V42"/>`),
    // récupération au freinage : disque, flux d'énergie vers la batterie
    regen: `<circle cx="22" cy="42" r="14"/><circle cx="22" cy="42" r="5"/><rect x="54" y="36" width="20" height="14" rx="2"/><path d="M38 30 C46 18 58 18 64 30"/><path d="M60 28 L64 31 L67 26"/>`
      + d(`<path d="M74 41 V45 M58 40 V46 M62 40 V46"/>`),
    // batterie : modules de cellules et bornes
    battery: `<rect x="8" y="18" width="64" height="38" rx="3"/><path d="M20 18 V12 H28 V18 M52 18 V12 H60 V18"/>`
      + d(`<path d="M24 18 V56 M40 18 V56 M56 18 V56 M8 37 H72"/>`) + `<path d="M42 24 L35 37 H45 L38 50"/>`,
    // câble haute tension 800 V et connecteurs
    hv: `<path d="M12 52 C26 52 24 22 40 22 C56 22 54 52 68 52" stroke-width="4"/><rect x="4" y="46" width="10" height="12" rx="2"/><rect x="66" y="46" width="10" height="12" rx="2"/>`
      + d(`<path d="M30 28 L34 24 M46 24 L50 28 M24 38 L28 34 M52 34 L56 38"/>`),
    // cartographie de déploiement : énergie électrique répartie sur le tour
    maps: `<path d="M10 58 H72 M10 58 V12"/><path d="M14 58 V40 H22 V58 M26 58 V26 H34 V58 M38 58 V46 H46 V58 M50 58 V20 H58 V58 M62 58 V36 H70 V58"/>`
      + d(`<path d="M10 30 H72" stroke-dasharray="3 3"/>`),
    // boîte de vitesses : carter, deux pignons en prise
    gearbox_p: `<path d="M6 22 H62 L74 30 V50 L62 56 H6 Z"/>` + gear(26, 39, 11, 14, 3) + gear(48, 39, 7, 10, 2.6) + d(`<circle cx="26" cy="39" r="3"/><circle cx="48" cy="39" r="2"/>`),
    // fiabilité de la boîte : pignon renforcé
    gearbox_rel: gear(36, 36, 22, 22, 4) + `<circle cx="36" cy="36" r="8"/>` + d(`<circle cx="36" cy="36" r="15"/><path d="M36 21 V28 M36 44 V51 M21 36 H28 M44 36 H51"/>`) + `<path d="M58 52 L66 60 L76 46"/>`,
    // différentiel : couronne et satellites coniques, sorties de roue
    diff: gear(40, 35, 20, 24, 3.4) + `<path d="M4 35 H20 M60 35 H76"/>` + d(`<path d="M40 22 L34 28 H46 Z M40 48 L34 42 H46 Z M27 35 L33 29 V41 Z M53 35 L47 29 V41 Z"/><circle cx="40" cy="35" r="3"/>`),
    // étagement des 8 rapports : pignons de diamètres décroissants sur l'arbre
    ratios: `<path d="M4 36 H76"/>` + [44, 40, 36, 32, 28, 24, 20, 16].map((h, i) => `<rect x="${8 + i * 8}" y="${36 - h / 2}" width="5" height="${h}" rx="1.5"/>`).join('') + d(`<path d="M8 60 L70 60" stroke-dasharray="2 2"/>`),
    // embrayage carbone multidisque
    clutch: `<path d="M4 35 H76"/>` + [22, 30, 38, 46, 54].map((x) => `<ellipse cx="${x}" cy="35" rx="4" ry="22"/>`).join('') + d(`<path d="M18 13 H58 M18 57 H58"/>`),
    // arbre de transmission et joints tripodes sous soufflets
    driveshafts: `<path d="M18 40 L62 30" stroke-width="3"/><path d="M8 34 C14 34 18 38 20 42 C18 46 12 48 8 48 Z"/><path d="M60 26 C66 24 72 26 74 30 C72 34 66 38 62 36 Z"/>`
      + d(`<path d="M12 36 V46 M16 37 V45 M64 27 L66 35 M68 26 L70 34"/>`),
    // lubrification à carter sec : pompe multi-étages et goutte d'huile
    oil: `<rect x="10" y="22" width="40" height="28" rx="3"/><path d="M60 20 C60 20 70 32 70 38 C70 44 65 48 60 48 C55 48 50 44 50 38 C50 32 60 20 60 20 Z"/>`
      + d(`<path d="M20 22 V50 M30 22 V50 M40 22 V50"/><path d="M10 58 H50"/>`),
    // réservoir d'huile cloisonné
    oiltank: `<rect x="14" y="14" width="52" height="46" rx="8"/><path d="M34 8 H46 V14"/>`
      + d(`<path d="M30 22 V60 M50 14 V48"/>`) + `<path d="M14 42 C22 38 30 46 40 42 C50 38 58 46 66 42"/>`,
    // hydraulique : accumulateur sphérique, bloc de distribution, conduites
    hydraulics: `<circle cx="22" cy="28" r="12"/><rect x="42" y="34" width="28" height="18" rx="2"/><path d="M22 40 V58 H56 V52 M34 28 H48 V34"/>`
      + d(`<path d="M48 40 H64 M48 46 H64"/>`),
    // radiateur incliné dans le ponton
    radiators: `<path d="M16 58 L28 12 H64 L52 58 Z"/>` + d(`<path d="M31 12 L19 58 M37 12 L25 58 M43 12 L31 58 M49 12 L37 58 M55 12 L43 58 M61 12 L49 58"/>`) + air(`<path d="M2 30 H18 M2 40 H16"/>`),
    // échangeur air-air : faisceau et boîtes à eau
    intercooler: `<rect x="18" y="18" width="44" height="34" rx="1"/><path d="M10 22 H18 V48 H10 Z M62 22 H70 V48 H62 Z"/><path d="M10 30 H4 M70 40 H76"/>`
      + d(`<path d="M18 24 H62 M18 30 H62 M18 36 H62 M18 42 H62 M18 48 H62"/>`),
    // ouïes de refroidissement sur le capot moteur
    cooling: `<path d="M6 54 C22 30 46 20 74 18 V54 Z"/>` + d(`<path d="M30 36 L38 32 M34 42 L42 38 M38 48 L46 44 M46 30 L54 27 M50 36 L58 33 M54 42 L62 39 M62 26 L70 24 M64 32 L72 30"/>`) + air(`<path d="M36 22 C38 16 42 12 46 8 M54 18 C56 12 60 8 64 6"/>`),
    // écrans thermiques : feuille d'or autour de l'échappement
    heatshield: `<path d="M8 40 C8 26 22 20 40 20 C58 20 72 26 72 40"/><path d="M14 44 H66 V52 H14 Z"/>`
      + d(`<path d="M16 32 L22 28 L28 33 L34 27 L40 32 L46 27 L52 33 L58 28 L64 32"/>`) + air(`<path d="M30 62 C32 58 28 56 30 52 M50 62 C52 58 48 56 50 52"/>`),
    // capteurs et télémétrie : capteur, câble, ondes radio
    sensors: `<circle cx="22" cy="46" r="9"/><circle cx="22" cy="46" r="3"/><path d="M31 46 H44 V30"/><path d="M50 24 A10 10 0 0 1 58 16 M50 32 A18 18 0 0 1 66 16 M50 40 A26 26 0 0 1 74 16"/>`
      + d(`<path d="M8 60 H36"/>`),
    // électronique de contrôle : boîtier, connecteurs militaires
    electronics: `<rect x="10" y="20" width="60" height="34" rx="3"/><circle cx="24" cy="44" r="5"/><circle cx="40" cy="44" r="5"/><circle cx="56" cy="44" r="5"/>`
      + d(`<path d="M10 30 H70 M18 20 V30 M62 20 V30"/><circle cx="24" cy="44" r="2"/><circle cx="40" cy="44" r="2"/><circle cx="56" cy="44" r="2"/>`),
    // onduleur : courant continu converti en alternatif
    inverter: `<rect x="8" y="16" width="64" height="40" rx="3"/><path d="M16 32 H32 M16 40 H24 M28 40 H32"/><path d="M46 36 C49 26 52 26 55 36 C58 46 61 46 64 36"/>`
      + d(`<path d="M36 36 H42 M39 33 L42 36 L39 39"/><path d="M40 16 V10 M28 16 V10 M52 16 V10"/>`),
    // faisceau électrique ramifié et connecteurs verrouillés
    wiring: `<path d="M6 36 H34 C44 36 44 18 56 18 M34 36 H56 M34 36 C44 36 44 54 56 54" stroke-width="2.6"/><rect x="56" y="12" width="14" height="12" rx="2"/><rect x="56" y="30" width="14" height="12" rx="2"/><rect x="56" y="48" width="14" height="12" rx="2"/>`
      + d(`<path d="M14 32 V40 M22 32 V40"/>`),
    // réservoir souple et pompe de gavage
    fuel: `<path d="M12 24 C12 18 18 14 26 14 H54 C62 14 68 18 68 24 V48 C68 56 62 60 54 60 H26 C18 60 12 56 12 48 Z"/><rect x="32" y="38" width="16" height="16" rx="2"/><path d="M40 38 V22 H60 V8"/>`
      + d(`<path d="M12 32 C20 30 28 34 36 32 M44 32 C52 30 60 34 68 32"/>`),

    /* ---------- Stratégie et équipe ---------- */
    // embrayage de départ : portique des feux et palette d'embrayage
    launch: [16, 28, 40, 52, 64].map((x) => `<circle cx="${x}" cy="18" r="5"/>`).join('') + `<path d="M8 10 H72 V26 H8 Z" opacity=".55" stroke-width="1.3"/><path d="M22 54 C30 40 50 40 58 54 L54 58 C48 48 32 48 26 58 Z"/>`,
    // gestion des pneus : pneu vu de face, carrossage, capteur de température
    tyres: `<rect x="24" y="8" width="26" height="56" rx="8" transform="rotate(-6 37 36)"/><path d="M60 26 A8 8 0 0 1 68 18 M60 34 A16 16 0 0 1 76 18"/>`
      + d(`<path d="M30 14 L26 58 M38 12 L34 60 M46 12 L42 60" /><path d="M37 2 V68" stroke-dasharray="3 3"/>`),
    // mode dépassement : réserve d'énergie et poussée
    push: `<rect x="8" y="22" width="40" height="26" rx="3"/><path d="M48 30 H52 V40 H48"/><path d="M30 26 L23 36 H31 L25 46"/><path d="M58 24 L68 35 L58 46 M66 24 L76 35 L66 46"/>`,
    // équipe de stand : pistolet pneumatique et son flexible
    pitcrew: `<path d="M6 24 L10 20 H18 L22 24 V36 L18 40 H10 L6 36 Z"/><rect x="22" y="22" width="36" height="16" rx="3"/><path d="M30 22 V14 H50 V22"/><path d="M44 38 L48 58 H58 L54 38"/><path d="M53 58 C53 66 68 66 74 58"/>`
      + d(`<path d="M11 26 H17 L19 30 L17 34 H11 L9 30 Z"/><path d="M28 28 H52 M28 32 H52"/><path d="M46 44 H52"/>`),
    // ingénieur de course : casque radio, micro et forme d'onde
    radio: `<path d="M16 38 C16 22 26 12 40 12 C54 12 64 22 64 38"/><rect x="10" y="34" width="12" height="20" rx="4"/><rect x="58" y="34" width="12" height="20" rx="4"/><path d="M16 54 C16 62 24 64 32 64 H36"/>`
      + d(`<path d="M30 40 L33 34 L36 46 L40 30 L44 48 L47 36 L50 40"/>`),
    // simulateur : écran incurvé, volant et baquet
    simu: `<path d="M8 22 C24 14 56 14 72 22 V40 C56 32 24 32 8 40 Z"/><circle cx="40" cy="50" r="9"/><path d="M58 64 V52 C58 46 62 44 66 44 L72 46 V64"/>`
      + d(`<path d="M31 50 H49 M40 41 V48"/><path d="M40 40 V34"/>`),
  };
  F1.RD_ART = A;
})(globalThis.F1 = globalThis.F1 || {});
