/* Décor détaillé de chaque circuit : ce qui entoure vraiment le tracé (eau, forêts, quartiers, champs, parkings,
   stades, routes), dessiné à partir de vues aériennes puis simplifié en illustration.
   Coordonnées : u, v = fraction de la boîte du tracé (0 → 1 sur la largeur et la hauteur, dans le repère du site),
   on peut déborder (-0,5 → 1,5) : la carte de course montre plus large que la vignette.
   Tailles des bâtiments et des stades : fraction du plus grand côté du tracé. */
(function (F1) {
  // Types : water, river, forest, trees, park, field, city, old, lot, sand, golf, road, bld, stad, dome, icon, yachts
  const G = {
    albert_park: [
      ['city', [[-0.5, 0.25], [-0.1, 0.32], [-0.12, 1.5], [-0.5, 1.5]], 12], ['city', [[1.06, 0.42], [1.5, 0.35], [1.5, 1.5], [1.08, 1.5]], -8],
      ['water', [[0.14, 0.16], [0.3, 0.07], [0.47, 0.09], [0.5, 0.27], [0.45, 0.44], [0.52, 0.6], [0.7, 0.68], [0.84, 0.8], [0.86, 0.9], [0.72, 0.86], [0.55, 0.76], [0.4, 0.64], [0.28, 0.5], [0.12, 0.3]]],
      ['park', [[0.24, 0.19], [0.31, 0.16], [0.34, 0.23], [0.27, 0.26]]], ['trees', [[0.24, 0.19], [0.31, 0.16], [0.34, 0.23], [0.27, 0.26]]],
      ['trees', [[-0.08, -0.2], [0.7, -0.25], [0.72, 0.0], [0.58, 0.2], [0.1, 0.06], [-0.06, 0.25]]], ['trees', [[0.62, 0.3], [0.95, 0.4], [1.0, 0.7], [0.75, 0.62]]],
      ['stad', 0.76, -0.04, 0.07, 0.05], ['oval', -0.04, 0.62, 0.05, 0.06], ['oval', 0.12, 0.92, 0.05, 0.05], ['oval', 0.42, 1.1, 0.06, 0.04], ['oval', 0.9, 1.12, 0.05, 0.04],
      ['bld', 0.0, -0.08, 0.14, 0.05, -10, '#9aa3ae'], ['road', [[-0.07, -0.3], [-0.07, 1.5]], 14], ['road', [[1.03, -0.3], [1.0, 1.5]], 14],
    ],
    shanghai: [
      ['city', [[-0.5, 0.45], [-0.08, 0.5], [-0.06, 1.5], [-0.5, 1.5]], 0], ['road', [[-0.4, 0.3], [0.38, -0.3]], 24],
      ['river', [[1.1, -0.4], [1.12, 0.3], [1.18, 0.8], [1.2, 1.5]], 26], ['forest', [[1.2, -0.4], [1.6, -0.4], [1.6, 1.5], [1.25, 1.5], [1.22, 0.6]]],
      ['bld', 0.31, 0.75, 0.035, 0.035, 0, '#5c9b78'], ['bld', 0.37, 0.74, 0.035, 0.035, 0, '#5c9b78'], ['bld', 0.43, 0.72, 0.035, 0.035, 0, '#5c9b78'], ['bld', 0.34, 0.68, 0.035, 0.035, 0, '#5c9b78'], ['bld', 0.4, 0.67, 0.035, 0.035, 0, '#5c9b78'],
      ['lot', [[0.62, 0.36], [0.78, 0.6], [0.72, 0.66], [0.58, 0.44]], 34], ['dome', 0.45, 1.16, 0.1, 0.06], ['lot', [[0.0, 1.06], [0.3, 1.04], [0.3, 1.3], [0.0, 1.3]], 0],
      ['field', [[0.0, -0.45], [0.3, -0.45], [0.25, 0.25], [0.0, 0.25]], 0],
    ],
    suzuka: [
      ['city', [[1.12, -0.5], [1.5, -0.5], [1.5, 1.5], [1.14, 1.5]], 0], ['forest', [[-0.5, -0.6], [0.4, -0.6], [0.36, -0.12], [0.12, -0.16], [-0.5, -0.04]]],
      ['forest', [[0.12, 0.75], [0.48, 0.72], [0.7, 0.98], [0.62, 1.5], [0.05, 1.5]]], ['field', [[-0.5, 0.78], [0.08, 0.8], [0.04, 1.5], [-0.5, 1.5]], 20],
      ['water', [[-0.06, 0.48], [0.08, 0.46], [0.15, 0.6], [0.05, 0.72], [-0.07, 0.64]]], ['trees', [[0.45, -0.5], [1.1, -0.5], [1.08, 0.05], [0.6, 0.15]]],
      ['bld', 1.04, 0.33, 0.1, 0.05, 30, '#c9ced6'], ['icon', 'ferris', 1.14, 0.15, 0.13], ['field', [[0.72, 0.78], [1.08, 0.95], [1.1, 1.5], [0.66, 1.5]], -30],
    ],
    jeddah: [
      ['water', [[-6, -0.5], [-0.55, -0.5], [-0.42, 0.3], [-0.6, 0.65], [-0.48, 1.5], [-6, 1.5]]], ['park', [[-0.55, -0.5], [-0.12, -0.5], [-0.12, 1.5], [-0.48, 1.5], [-0.6, 0.65], [-0.42, 0.3]]],
      ['trees', [[-0.5, -0.4], [-0.15, -0.4], [-0.15, 1.4], [-0.45, 1.4]]], ['city', [[1.4, -0.5], [5, -0.5], [5, 1.5], [1.4, 1.5]], 0], ['road', [[1.25, -0.5], [1.25, 1.5]], 18],
      ['water', [[0.15, 0.42], [0.35, 0.4], [0.32, 0.55], [0.15, 0.56]]],
    ],
    miami: [
      ['water', [[-0.4, -0.95], [1.4, -0.95], [1.4, -0.78], [-0.4, -0.78]]], ['lot', [[-0.2, -0.65], [1.2, -0.65], [1.2, -0.14], [-0.2, -0.14]], 0],
      ['stad', 0.6, 0.3, 0.12, 0.08], ['lot', [[0.05, 1.16], [1.25, 1.16], [1.25, 1.9], [0.05, 1.9]], 0], ['road', [[-0.4, 2.05], [1.4, 2.05]], 26],
      ['bld', 0.25, 1.35, 0.06, 0.025, 0, '#3b7bd8'], ['bld', 0.33, 1.35, 0.06, 0.025, 0, '#3b7bd8'], ['bld', 0.41, 1.35, 0.06, 0.025, 0, '#3b7bd8'], ['bld', 0.25, 1.48, 0.06, 0.025, 0, '#3b7bd8'], ['bld', 0.33, 1.48, 0.06, 0.025, 0, '#3b7bd8'],
      ['park', [[-0.35, -0.6], [-0.22, -0.6], [-0.22, 1.9], [-0.35, 1.9]]], ['water', [[0.1, 0.42], [0.22, 0.38], [0.25, 0.48], [0.12, 0.5]]],
    ],
    villeneuve: [
      ['water', [[-6, -0.5], [-0.55, -0.5], [-0.7, 0.5], [-0.6, 1.5], [-6, 1.5]]], ['water', [[1.14, -0.15], [1.5, -0.15], [1.5, 1.15], [1.14, 1.15]]],
      ['trees', [[-0.5, -0.4], [1.0, -0.4], [1.06, 1.3], [-0.55, 1.3]]], ['water', [[0.3, 0.3], [0.5, 0.28], [0.62, 0.45], [0.55, 0.6], [0.35, 0.58], [0.25, 0.45]]],
      ['sand', [[0.26, 0.6], [0.38, 0.61], [0.35, 0.69], [0.25, 0.67]]], ['road', [[-1.5, 0.12], [2.2, -0.06]], 18], ['dome', -0.25, 0.8, 0.06, 0.06],
    ],
    monaco: [
      ['city', [[-0.6, -0.6], [0.62, -0.6], [0.6, 0.38], [0.3, 0.41], [-0.05, 0.44], [-0.6, 0.46]], -15], ['city', [[-0.6, 0.46], [-0.06, 0.5], [-0.06, 1.0], [-0.6, 1.05]], 5],
      ['city', [[1.06, -0.6], [1.6, -0.6], [1.6, 0.05], [1.06, 0.22]], -30], ['city', [[0.7, -0.6], [1.02, -0.6], [0.94, 0.12], [0.72, 0.28], [0.68, 0.0]], -20],
      ['water', [[0.32, 0.53], [0.65, 0.45], [1.0, 0.32], [1.6, 0.12], [1.6, 1.5], [0.4, 1.5], [0.48, 1.0], [0.3, 0.98]]],
      ['bld', 0.52, 0.72, 0.012, 0.28, 62, '#c9ced6'], ['bld', 0.44, 0.58, 0.01, 0.12, -20, '#c9ced6'], ['yachts', [[0.3, 0.6], [0.55, 0.52], [0.6, 0.92], [0.32, 0.95]], 12],
      ['park', [[-0.1, 1.05], [0.42, 1.02], [0.38, 1.4], [-0.1, 1.45]]], ['trees', [[-0.1, 1.05], [0.42, 1.02], [0.38, 1.4], [-0.1, 1.45]]],
    ],
    catalunya: [
      ['field', [[-0.5, -0.5], [0.55, -0.5], [0.42, 0.3], [-0.5, 0.42]], 30], ['trees', [[-0.5, -0.5], [0.55, -0.5], [0.42, 0.3], [-0.5, 0.42]]],
      ['forest', [[0.98, 0.55], [1.5, 0.45], [1.5, 1.5], [0.8, 1.5], [0.85, 1.1]]], ['city', [[-0.5, 1.05], [0.35, 1.12], [0.3, 1.5], [-0.5, 1.5]], 10],
      ['lot', [[0.5, 0.58], [0.66, 0.38], [0.73, 0.46], [0.57, 0.68]], -57], ['field', [[1.1, -0.5], [1.5, -0.5], [1.5, 0.4], [1.02, 0.5]], -20],
      ['road', [[-0.5, 1.02], [1.5, 0.95]], 18],
    ],
    red_bull_ring: [
      ['forest', [[-0.6, -0.4], [-0.1, -0.12], [0.05, 0.25], [0.22, 0.75], [0.3, 1.12], [-0.6, 1.4]]], ['forest', [[1.1, 0.15], [1.6, 0.05], [1.6, 1.4], [1.06, 1.3], [1.14, 0.8]]],
      ['field', [[-0.1, -0.6], [1.6, -0.6], [1.6, -0.1], [0.05, -0.1]], 8], ['city', [[-0.6, 1.1], [0.3, 1.16], [0.28, 1.5], [-0.6, 1.5]], 15],
      ['trees', [[0.55, 0.05], [0.9, 0.1], [0.85, 0.3], [0.62, 0.32]]], ['lot', [[0.55, 1.08], [1.0, 0.95], [1.05, 1.15], [0.6, 1.3]], -16],
    ],
    silverstone: [
      ['field', [[-0.5, -0.6], [1.5, -0.6], [1.5, -0.1], [-0.5, -0.1]], 10], ['field', [[1.08, 0.1], [1.6, 0.1], [1.6, 0.7], [1.08, 0.7]], -25], ['field', [[1.04, 0.7], [1.6, 0.7], [1.6, 1.5], [0.9, 1.5]], 40],
      ['field', [[-0.6, 0.15], [-0.08, 0.15], [-0.08, 0.75], [-0.6, 0.75]], 70], ['field', [[-0.6, 0.75], [0.1, 0.9], [0.2, 1.5], [-0.6, 1.5]], -10],
      ['forest', [[0.75, 1.08], [1.12, 1.0], [1.05, 1.4], [0.68, 1.4]]], ['forest', [[1.1, -0.1], [1.5, -0.1], [1.5, 0.12], [1.1, 0.14]]],
      ['lot', [[0.3, 0.56], [0.48, 0.55], [0.48, 0.7], [0.3, 0.72]], 0], ['lot', [[0.25, 0.2], [0.48, 0.38], [0.42, 0.45], [0.2, 0.28]], 40],
    ],
    spa: [
      ['forest', [[-0.6, -0.1], [0.1, 0.05], [0.25, 0.45], [0.05, 0.9], [-0.6, 1.5]]], ['forest', [[0.5, -0.6], [1.6, -0.6], [1.6, 0.85], [0.95, 0.88], [0.72, 0.25]]],
      ['forest', [[0.42, 0.25], [0.6, 0.3], [0.75, 0.7], [0.6, 0.66], [0.48, 0.72]]], ['forest', [[0.05, 1.0], [0.6, 1.05], [0.7, 1.5], [-0.2, 1.5]]],
      ['field', [[0.88, 0.95], [1.6, 0.88], [1.6, 1.5], [0.8, 1.5]], 20], ['city', [[-0.6, -0.6], [0.12, -0.6], [0.06, -0.12], [-0.6, -0.08]], 25],
      ['river', [[0.05, -0.5], [0.3, 0.08], [0.45, 0.2], [0.52, 0.6]], 9],
    ],
    hungaroring: [
      ['forest', [[0.48, 0.3], [0.62, 0.12], [0.74, 0.26], [0.8, 0.55], [0.7, 0.66], [0.55, 0.68], [0.46, 0.55]]],
      ['forest', [[-0.6, -0.5], [0.25, -0.5], [0.32, 0.3], [-0.1, 0.4], [-0.6, 0.45]]], ['field', [[0.95, -0.5], [1.6, -0.5], [1.6, 0.6], [1.05, 0.62]], 30],
      ['field', [[-0.6, 0.75], [0.3, 1.05], [0.35, 1.5], [-0.6, 1.5]], -35], ['field', [[0.75, 0.95], [1.6, 0.8], [1.6, 1.5], [0.7, 1.5]], 15],
      ['trees', [[0.3, -0.5], [0.95, -0.5], [0.9, -0.05], [0.4, 0.0]]], ['lot', [[-0.35, 0.45], [-0.05, 0.42], [0.0, 0.62], [-0.3, 0.7]], 0],
    ],
    zandvoort: [
      ['water', [[-6, -0.5], [-0.45, -0.5], [-0.66, 1.5], [-6, 1.5]]], ['sand', [[-0.45, -0.5], [-0.24, -0.5], [-0.42, 1.5], [-0.66, 1.5]]],
      ['city', [[-0.24, 0.25], [-0.06, 0.28], [-0.1, 1.5], [-0.42, 1.5], [-0.34, 0.9]], 22], ['dunes', [[-0.24, -0.5], [1.6, -0.5], [1.6, 1.5], [-0.1, 1.5], [-0.06, 0.28], [-0.24, 0.25]]],
      ['water', [[0.34, 0.98], [0.45, 0.95], [0.47, 1.08], [0.36, 1.1]]], ['water', [[0.55, 1.04], [0.64, 1.02], [0.66, 1.16], [0.55, 1.16]]], ['water', [[0.77, 0.62], [0.82, 0.6], [0.84, 0.7], [0.77, 0.71]]],
      ['lot', [[0.0, 0.15], [0.12, 0.18], [0.05, 0.6], [-0.04, 0.55]], 68],
    ],
    monza: [
      ['forest', [[-0.08, -0.6], [1.6, -0.6], [1.6, 0.35], [1.05, 0.3], [0.62, 0.62], [0.35, 1.0], [0.25, 1.5], [-0.1, 1.5]]],
      ['golf', [[0.65, 0.5], [1.02, 0.32], [1.6, 0.4], [1.6, 1.5], [0.4, 1.5], [0.45, 1.05]]], ['city', [[-0.8, -0.6], [-0.12, -0.6], [-0.16, 0.4], [-0.8, 0.5]], 12],
      ['road', [[0.05, 0.55], [0.05, -0.05], [0.15, -0.24], [0.35, -0.3], [0.55, -0.22], [0.62, 0.05], [0.6, 0.3], [0.5, 0.5], [0.38, 0.6], [0.2, 0.62], [0.08, 0.6], [0.05, 0.55]], 30, '#8d939c'],
      ['park', [[0.22, 0.65], [0.32, 0.65], [0.3, 0.9], [0.2, 0.9]]], ['field', [[-0.8, 0.5], [-0.12, 0.45], [-0.1, 1.5], [-0.8, 1.5]], 0],
    ],
    madring: [
      ['city', [[-0.8, 0.25], [-0.12, 0.3], [-0.12, 1.5], [-0.8, 1.5]], 30], ['field', [[0.3, -0.6], [1.6, -0.6], [1.6, 0.25], [0.35, 0.32]], 0],
      ['road', [[-0.8, -0.18], [1.6, -0.12]], 28], ['stad', 0.72, -0.4, 0.06, 0.04], ['park', [[1.12, 0.3], [1.6, 0.3], [1.6, 1.5], [1.12, 1.5]]], ['trees', [[1.12, 0.3], [1.6, 0.3], [1.6, 1.5], [1.12, 1.5]]],
      ['bld', 0.28, 0.62, 0.13, 0.07, 0, '#a7afba'], ['bld', 0.45, 0.62, 0.13, 0.07, 0, '#a7afba'], ['bld', 0.28, 0.74, 0.13, 0.07, 0, '#a7afba'], ['bld', 0.45, 0.74, 0.13, 0.07, 0, '#a7afba'],
      ['bld', 0.3, 0.86, 0.13, 0.06, 0, '#a7afba'], ['bld', 0.62, 0.68, 0.08, 0.14, 0, '#b6bec8'], ['lot', [[0.15, 0.2], [0.4, 0.2], [0.4, 0.4], [0.15, 0.4]], 0],
    ],
    baku: [
      ['city', [[-0.8, -0.8], [1.6, -0.8], [1.6, 0.05], [1.02, 0.15], [0.3, 0.55], [0.0, 0.48], [-0.8, 0.6]], -28], ['city', [[-0.8, 0.6], [-0.05, 0.55], [-0.02, 1.0], [0.25, 1.15], [0.3, 1.6], [-0.8, 1.6]], 0],
      ['old', [[0.05, 0.62], [0.27, 0.56], [0.27, 0.76], [0.18, 0.94], [0.05, 0.86]], 0],
      ['park', [[0.33, 0.72], [1.03, 0.26], [1.06, 0.33], [0.36, 0.8]]], ['trees', [[0.33, 0.72], [1.03, 0.26], [1.06, 0.33], [0.36, 0.8]]],
      ['water', [[0.36, 0.82], [0.7, 0.6], [1.07, 0.36], [1.6, 0.2], [1.6, 1.6], [0.32, 1.6], [0.33, 1.1]]], ['bld', 0.74, 0.92, 0.018, 0.22, -34, '#c9ced6'], ['yachts', [[0.6, 0.75], [1.2, 0.45], [1.3, 0.8], [0.7, 1.1]], 5],
    ],
    sepang: [
      ['palms', [[0.55, -0.6], [1.6, -0.6], [1.6, 0.22], [0.78, 0.18]]], ['palms', [[0.75, 0.88], [1.6, 0.8], [1.6, 1.5], [0.7, 1.5]]], ['palms', [[-0.6, 0.92], [0.32, 0.98], [0.28, 1.5], [-0.6, 1.5]]],
      ['palms', [[-0.6, -0.6], [0.4, -0.6], [0.3, -0.05], [-0.1, 0.1], [-0.6, 0.3]]], ['water', [[-0.4, 0.62], [-0.12, 0.6], [-0.06, 0.82], [-0.34, 0.88]]],
      ['lot', [[0.15, 0.25], [0.45, 0.2], [0.48, 0.4], [0.18, 0.44]], -5], ['dome', 1.12, 0.55, 0.05, 0.05],
    ],
    marina_bay: [
      ['city', [[-0.8, -0.8], [1.6, -0.8], [1.6, -0.1], [-0.8, -0.1]], 0], ['city', [[-0.8, -0.1], [-0.06, -0.1], [-0.08, 1.0], [-0.8, 1.02]], 8],
      ['city', [[0.3, 0.05], [0.72, 0.12], [0.72, 0.32], [0.3, 0.3]], 0], ['water', [[-0.8, 1.06], [0.35, 1.1], [0.55, 1.22], [0.62, 1.6], [-0.8, 1.6]]],
      ['park', [[0.32, 0.46], [0.56, 0.5], [0.56, 0.58], [0.32, 0.56]]], ['park', [[0.68, 1.02], [1.6, 0.96], [1.6, 1.6], [0.66, 1.6]]], ['trees', [[0.68, 1.02], [1.6, 0.96], [1.6, 1.6], [0.66, 1.6]]],
      ['icon', 'ferris', 1.14, 0.6, 0.14], ['water', [[1.06, -0.1], [1.6, -0.1], [1.6, 0.4], [1.08, 0.36]]], ['yachts', [[-0.6, 1.15], [0.3, 1.18], [0.4, 1.5], [-0.6, 1.5]], 4],
    ],
    americas: [
      ['lot', [[-0.6, 0.62], [0.02, 0.62], [0.22, 1.02], [-0.1, 1.5], [-0.6, 1.5]], 38], ['lot', [[-0.3, -0.5], [0.6, -0.5], [0.58, -0.05], [-0.25, 0.3]], 0],
      ['field', [[0.58, 0.55], [1.6, 0.35], [1.6, 1.5], [0.5, 1.5]], 0], ['water', [[0.46, 0.7], [0.53, 0.68], [0.55, 0.8], [0.47, 0.8]]],
      ['trees', [[0.6, -0.5], [1.6, -0.5], [1.6, -0.05], [0.65, 0.05]]], ['trees', [[0.6, 0.55], [1.6, 0.35], [1.6, 1.5], [0.5, 1.5]]], ['water', [[-0.45, -0.3], [-0.32, -0.32], [-0.3, -0.12], [-0.44, -0.1]]],
    ],
    rodriguez: [
      ['city', [[-0.8, -0.8], [1.6, -0.8], [1.6, 1.6], [-0.8, 1.6]], 8],
      ['park', [[0.12, 0.18], [0.55, 0.26], [0.95, 0.2], [1.02, 0.32], [0.84, 0.75], [0.78, 0.98], [0.7, 0.98], [0.68, 0.6], [0.6, 0.52], [0.3, 0.48], [0.12, 0.38]]],
      ['bld', 0.3, 0.3, 0.04, 0.035, 0, '#4f9a55'], ['bld', 0.4, 0.3, 0.04, 0.035, 0, '#4f9a55'], ['bld', 0.5, 0.33, 0.04, 0.035, 0, '#4f9a55'], ['bld', 0.62, 0.36, 0.04, 0.035, 0, '#4f9a55'],
      ['stad', 0.78, 0.36, 0.06, 0.05], ['dome', 0.22, 0.32, 0.04, 0.04], ['road', [[-0.8, -0.12], [1.6, 0.05]], 22], ['road', [[1.15, -0.8], [0.75, 1.6]], 22],
    ],
    interlagos: [
      ['city', [[-0.8, -0.8], [1.6, -0.8], [1.6, 1.6], [-0.8, 1.6]], 20],
      ['park', [[0.03, 0.4], [0.12, 0.12], [0.4, 0.0], [0.62, 0.04], [0.74, 0.26], [0.98, 0.28], [0.8, 0.88], [0.6, 1.0], [0.25, 1.0], [0.08, 0.72]]],
      ['forest', [[0.45, 0.62], [0.62, 0.44], [0.74, 0.58], [0.62, 0.86], [0.46, 0.82]]], ['water', [[0.7, 0.0], [0.86, -0.02], [0.92, 0.1], [0.76, 0.16]]],
      ['water', [[-0.45, -0.6], [-0.2, -0.55], [-0.15, -0.3], [-0.4, -0.25]]], ['lot', [[0.3, 0.62], [0.45, 0.6], [0.45, 0.75], [0.3, 0.78]], 0],
    ],
    vegas: [
      ['city', [[-0.8, -0.8], [1.6, -0.8], [1.6, 1.6], [-0.8, 1.6]], 0], ['golf', [[0.35, -0.5], [0.62, -0.5], [0.62, -0.12], [0.35, -0.12]]], ['road', [[-0.38, -0.8], [-0.38, 1.6]], 30],
      ['bld', -0.12, 0.15, 0.1, 0.12, 0, '#c9b78f'], ['bld', -0.12, 0.42, 0.1, 0.14, 0, '#d6d9de'], ['bld', -0.12, 0.7, 0.1, 0.12, 0, '#b8a07a'], ['bld', -0.12, 0.95, 0.1, 0.12, 0, '#9fa8b3'],
      ['bld', 0.2, 0.55, 0.14, 0.1, 0, '#3f4652'], ['lot', [[0.4, 0.45], [0.62, 0.45], [0.62, 0.8], [0.4, 0.8]], 0],
    ],
    losail: [
      ['lot', [[-0.6, -0.1], [-0.12, 0.1], [0.12, 0.85], [0.3, 1.5], [-0.6, 1.5]], -30], ['road', [[-0.65, -0.5], [-0.3, 1.6]], 22], ['road', [[1.2, -0.5], [1.4, 1.6]], 26],
      ['bld', 0.72, 0.5, 0.1, 0.05, 0, '#3e4450'], ['lot', [[0.62, 0.95], [0.9, 0.95], [0.9, 1.15], [0.6, 1.15]], 0], ['runoff'],
    ],
    yas_marina: [
      ['water', [[1.18, -0.6], [1.8, -0.6], [1.8, 1.6], [1.12, 1.6], [1.16, 0.6]]], ['sand', [[1.8, -0.6], [2.6, -0.6], [2.6, 1.6], [1.8, 1.6]]],
      ['water', [[0.52, 0.8], [0.8, 0.84], [0.88, 0.92], [0.7, 0.96], [0.54, 0.9]]], ['yachts', [[0.55, 0.82], [0.82, 0.86], [0.8, 0.93], [0.56, 0.9]], 5],
      ['city', [[-0.9, 0.3], [-0.12, 0.35], [-0.08, 1.6], [-0.9, 1.6]], 20], ['stad', -0.4, 0.05, 0.12, 0.08, '#c8102e'], ['golf', [[-0.9, -0.6], [0.3, -0.6], [0.2, -0.1], [-0.9, 0.0]]],
      ['lot', [[0.6, 0.05], [0.95, 0.1], [0.95, 0.35], [0.62, 0.4]], 0],
    ],
    bahrain: [
      ['lot', [[-0.7, -0.4], [-0.2, -0.4], [-0.2, 1.4], [-0.7, 1.4]], 0], ['bld', 0.38, 0.36, 0.15, 0.05, -60, '#5b84c9'], ['road', [[-0.75, -0.6], [-0.75, 1.6]], 22],
      ['city', [[-1.6, -0.6], [-0.82, -0.6], [-0.82, 1.6], [-1.6, 1.6]], 0],
    ],
    portimao: [
      ['trees', [[-0.1, -0.6], [1.6, -0.6], [1.6, 1.6], [0.3, 1.6], [0.1, 1.1]]], ['trees', [[0.3, 0.2], [0.5, 0.25], [0.42, 0.75], [0.28, 0.6]]],
      ['lot', [[-0.55, -0.25], [-0.14, -0.12], [-0.08, 1.2], [-0.55, 1.2]], 15], ['water', [[1.05, 0.25], [1.13, 0.22], [1.15, 0.33], [1.06, 0.34]]],
      ['field', [[-0.6, 1.2], [0.4, 1.2], [0.4, 1.6], [-0.6, 1.6]], 20],
    ],
    istanbul: [
      ['forest', [[0.45, 1.08], [1.6, 0.8], [1.6, 1.6], [0.35, 1.6]]], ['forest', [[-0.6, 0.2], [-0.1, 0.45], [-0.25, 1.0], [-0.6, 1.1]]],
      ['city', [[-0.6, -0.6], [0.32, -0.6], [0.22, -0.02], [-0.6, 0.12]], 25], ['lot', [[0.56, 0.78], [0.72, 0.72], [0.76, 0.86], [0.6, 0.92]], -12],
      ['road', [[-0.6, 1.16], [1.6, 0.95]], 22], ['field', [[0.6, -0.6], [1.6, -0.6], [1.6, 0.5], [1.12, 0.52], [1.0, 0.0]], 15],
    ],
    imola: [
      ['river', [[-0.6, 1.3], [0.4, 1.22], [1.0, 1.28], [1.6, 1.2]], 30], ['forest', [[-0.6, -0.6], [1.6, -0.6], [1.6, -0.1], [0.4, -0.05], [-0.6, 0.1]]],
      ['city', [[-0.6, 0.3], [-0.06, 0.4], [-0.06, 1.1], [-0.6, 1.15]], 0], ['park', [[0.15, 0.45], [0.75, 0.42], [0.85, 0.65], [0.2, 0.7]]],
    ],
  };

  const C = {
    forest: '#284f37', canopy: ['#2f6a45', '#3a7c50', '#2a5d3d'], park: '#3f7a43', field: [['#6d8a43', '#82a050'], ['#a08c4e', '#b7a35e'], ['#5f7f3d', '#7a9a4c']],
    city: '#262c35', bld: ['#48515f', '#535d6c', '#3f4754', '#5b6575'], old: '#6e5a3f', lot: '#30353d', sand: '#d2b47a', golf: '#3b7a3e', dunes: '#7d8452',
  };
  const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  // contour adouci (Catmull-Rom fermé) : rives, lisières et quartiers sans angles de polygone
  const smooth = (P) => { const n = P.length; let d = `M${P[0][0].toFixed(0)} ${P[0][1].toFixed(0)}`; for (let i = 0; i < n; i++) { const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]; d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(0)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(0)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(0)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(0)} ${p2[0].toFixed(0)} ${p2[1].toFixed(0)}`; } return d + 'Z'; };
  const sharp = (P) => 'M' + P.map((p) => p[0].toFixed(0) + ' ' + p[1].toFixed(0)).join(' L') + 'Z';

  /* pts : tracé (repère du site), tb = [x0, y0, W, H] boîte du tracé, rnd : aléatoire déterministe, near(x, y, r) : proche du tracé ? */
  function layer(id, pts, tb, rnd, near, night) {
    const F = G[id]; if (!F) return null;
    const [x0, y0, W, H] = tb, S = Math.max(W, H);
    const X = (u) => x0 + u * W, Y = (v) => y0 + v * H, P = (arr) => arr.map(([u, v]) => [X(u), Y(v)]);
    const wet = [], out = [], top = [];
    const sample = (poly, n, fn) => { const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...ys), d = Math.max(...ys); let k = 0; for (let t = 0; t < n * 6 && k < n; t++) { const x = a + rnd() * (b - a), y = c + rnd() * (d - c); if (inPoly(x, y, poly)) { k++; fn(x, y); } } };
    const area = (poly) => { let s = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(s / 2); };
    // grille de bâtiments orientée (îlots), sautée près du tracé
    const blocks = (poly, ang, cols, maxN, step = 46) => {
      const r = (ang * Math.PI) / 180, ca = Math.cos(r), sa = Math.sin(r), xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + step;
      let s = '', n = 0;
      for (let i = -R; i <= R && n < maxN; i += step) for (let j = -R; j <= R && n < maxN; j += step) {
        if ((Math.round(i / step) % 4 === 0) || (Math.round(j / step) % 5 === 0)) continue; // rues
        const x = cx + i * ca - j * sa, y = cy + i * sa + j * ca;
        if (!inPoly(x, y, poly) || near(x, y, 46)) continue;
        const w = step * (0.55 + rnd() * 0.3), h = step * (0.5 + rnd() * 0.35), col = cols[Math.floor(rnd() * cols.length)];
        s += `<rect x="${(x - w / 2).toFixed(0)}" y="${(y - h / 2).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="3" fill="${col}" transform="rotate(${ang} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
        if (night && rnd() < 0.5) s += `<rect x="${(x - 3).toFixed(0)}" y="${(y - 3).toFixed(0)}" width="6" height="6" fill="#ffd98a" opacity=".55"/>`;
        n++;
      }
      return s;
    };
    for (const f of F) {
      const t = f[0];
      if (t === 'water') { const p = P(f[1]); wet.push(p); out.push(`<path d="${smooth(p)}" fill="url(#sc-sea)" stroke="#a9d8ff" stroke-opacity=".35" stroke-width="4"/>`); let w = ''; sample(p, Math.min(26, area(p) / 9000), (x, y) => { if (!near(x, y, 30)) w += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} q 9 -6 18 0 t 18 0" stroke="#cfe9ff" stroke-width="2" fill="none" opacity=".35"/>`; }); out.push(w); }
      else if (t === 'river') { const p = P(f[1]); out.push(`<path d="M${p.map((q) => q.map((v) => v.toFixed(0)).join(' ')).join(' L')}" fill="none" stroke="#3f78a8" stroke-width="${f[2]}" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`); }
      else if (t === 'forest' || t === 'trees' || t === 'palms') {
        const p = P(f[1]);
        if (t === 'forest') out.push(`<path d="${smooth(p)}" fill="${C.forest}" opacity=".92"/>`);
        let s = ''; const n = Math.min(t === 'forest' ? 170 : 60, area(p) / (t === 'forest' ? 2400 : 9000));
        sample(p, n, (x, y) => { if (near(x, y, 30)) return; if (t === 'palms') { s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="9" fill="#3d7d47"/><path d="M${(x - 9).toFixed(0)} ${y.toFixed(0)} L${(x + 9).toFixed(0)} ${y.toFixed(0)} M${x.toFixed(0)} ${(y - 9).toFixed(0)} L${x.toFixed(0)} ${(y + 9).toFixed(0)}" stroke="#5fa86a" stroke-width="2"/>`; return; }
          const r = (t === 'forest' ? 11 : 13) + rnd() * 9; s += `<circle cx="${(x + 3).toFixed(0)}" cy="${(y + 4).toFixed(0)}" r="${r.toFixed(0)}" fill="#000" opacity=".22"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" fill="${C.canopy[Math.floor(rnd() * 3)]}"/><circle cx="${(x - r * 0.3).toFixed(0)}" cy="${(y - r * 0.3).toFixed(0)}" r="${(r * 0.45).toFixed(0)}" fill="#5c9a62" opacity=".55"/>`; });
        (t === 'forest' ? out : top).push(s);
      }
      else if (t === 'park') out.push(`<path d="${smooth(P(f[1]))}" fill="${C.park}" opacity=".75"/>`);
      else if (t === 'golf') { const p = P(f[1]); out.push(`<path d="${smooth(p)}" fill="${C.golf}" opacity=".85"/>`); let s = ''; sample(p, Math.min(14, area(p) / 30000), (x, y) => { s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(40 + rnd() * 40).toFixed(0)}" ry="${(14 + rnd() * 10).toFixed(0)}" fill="#6fae5e" opacity=".7" transform="rotate(${(rnd() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/><circle cx="${(x + 30).toFixed(0)}" cy="${y.toFixed(0)}" r="7" fill="#e8dfb8"/>`; }); out.push(s); }
      else if (t === 'dunes') { const p = P(f[1]); out.push(`<path d="${smooth(p)}" fill="${C.dunes}" opacity=".7"/>`); let s = ''; sample(p, Math.min(60, area(p) / 14000), (x, y) => { if (!near(x, y, 40)) s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(18 + rnd() * 30).toFixed(0)}" ry="${(8 + rnd() * 12).toFixed(0)}" fill="#d7c08b" opacity=".55"/>`; }); out.push(s); }
      else if (t === 'field') {
        const p = P(f[1]), ang = f[2] || 0, [c1, c2] = C.field[Math.floor(rnd() * 3)];
        out.push(`<path d="${sharp(p)}" fill="${c1}" opacity=".6"/>`);
        // bandes de culture
        let s = ''; const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
        for (let k = -R; k < R; k += 34) s += `<line x1="${(cx - R).toFixed(0)}" y1="${(cy + k).toFixed(0)}" x2="${(cx + R).toFixed(0)}" y2="${(cy + k).toFixed(0)}" stroke="${c2}" stroke-width="12" opacity=".5"/>`;
        const cid = 'fc' + Math.floor(rnd() * 1e9).toString(36);
        out.push(`<clipPath id="${cid}"><path d="${sharp(p)}"/></clipPath><g clip-path="url(#${cid})"><g transform="rotate(${ang} ${cx.toFixed(0)} ${cy.toFixed(0)})">${s}</g></g>`);
      }
      else if (t === 'city' || t === 'old') { const p = P(f[1]); out.push(`<path d="${smooth(p)}" fill="${t === 'old' ? C.old : C.city}" opacity=".9"/>`); out.push(blocks(p, f[2] || 0, t === 'old' ? ['#a88b5e', '#bfa071', '#93774d'] : C.bld, t === 'old' ? 40 : 170, t === 'old' ? 30 : 46)); }
      else if (t === 'lot') {
        const p = P(f[1]), ang = f[2] || 0; out.push(`<path d="${sharp(p)}" fill="${C.lot}" opacity=".9"/>`);
        const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
        let s = ''; for (let k = -R; k < R; k += 22) s += `<line x1="${(cx - R).toFixed(0)}" y1="${(cy + k).toFixed(0)}" x2="${(cx + R).toFixed(0)}" y2="${(cy + k).toFixed(0)}" stroke="#d7dce3" stroke-width="1.5" stroke-dasharray="3 6" opacity=".35"/>`;
        const cid = 'lc' + Math.floor(rnd() * 1e9).toString(36);
        out.push(`<clipPath id="${cid}"><path d="${sharp(p)}"/></clipPath><g clip-path="url(#${cid})"><g transform="rotate(${ang} ${cx.toFixed(0)} ${cy.toFixed(0)})">${s}</g></g>`);
      }
      else if (t === 'sand') out.push(`<path d="${smooth(P(f[1]))}" fill="${C.sand}" opacity=".9"/>`);
      else if (t === 'road') { const p = P(f[1]), d = 'M' + p.map((q) => q.map((v) => v.toFixed(0)).join(' ')).join(' L'); out.push(`<path d="${d}" fill="none" stroke="${f[3] || '#4c525c'}" stroke-width="${f[2]}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#c9ced6" stroke-width="1.6" stroke-dasharray="10 12" opacity=".45"/>`); }
      else if (t === 'bld') { const [, u, v, w, h, a, col] = f, x = X(u), y = Y(v), ww = w * S, hh = h * S; top.push(`<g transform="rotate(${a || 0} ${x.toFixed(0)} ${y.toFixed(0)})"><rect x="${(x - ww / 2 + 5).toFixed(0)}" y="${(y - hh / 2 + 6).toFixed(0)}" width="${ww.toFixed(0)}" height="${hh.toFixed(0)}" rx="3" fill="#000" opacity=".3"/><rect x="${(x - ww / 2).toFixed(0)}" y="${(y - hh / 2).toFixed(0)}" width="${ww.toFixed(0)}" height="${hh.toFixed(0)}" rx="3" fill="${col || '#8b939e'}"/><rect x="${(x - ww / 2).toFixed(0)}" y="${(y - hh / 2).toFixed(0)}" width="${ww.toFixed(0)}" height="${Math.min(6, hh * 0.25).toFixed(0)}" fill="#fff" opacity=".18"/></g>`); }
      else if (t === 'stad' || t === 'oval') { const [, u, v, rx, ry, col] = f, x = X(u), y = Y(v), a = rx * S, b = ry * S; top.push(t === 'oval' ? `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${a.toFixed(0)}" ry="${b.toFixed(0)}" fill="#5c9a55" stroke="#e8edf3" stroke-opacity=".5" stroke-width="3"/>` : `<ellipse cx="${(x + 6).toFixed(0)}" cy="${(y + 7).toFixed(0)}" rx="${a.toFixed(0)}" ry="${b.toFixed(0)}" fill="#000" opacity=".3"/><ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${a.toFixed(0)}" ry="${b.toFixed(0)}" fill="${col || '#d8dde4'}"/>${col ? '' : `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(a * 0.62).toFixed(0)}" ry="${(b * 0.58).toFixed(0)}" fill="#4f9a55"/><ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(a * 0.3).toFixed(0)}" ry="${(b * 0.3).toFixed(0)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>`}`); }
      else if (t === 'dome') { const [, u, v, rx, ry] = f, x = X(u), y = Y(v); top.push(`<ellipse cx="${(x + 5).toFixed(0)}" cy="${(y + 6).toFixed(0)}" rx="${(rx * S).toFixed(0)}" ry="${(ry * S).toFixed(0)}" fill="#000" opacity=".3"/><ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(rx * S).toFixed(0)}" ry="${(ry * S).toFixed(0)}" fill="#b9c2cd"/><ellipse cx="${(x - rx * S * 0.3).toFixed(0)}" cy="${(y - ry * S * 0.3).toFixed(0)}" rx="${(rx * S * 0.45).toFixed(0)}" ry="${(ry * S * 0.4).toFixed(0)}" fill="#fff" opacity=".35"/>`); }
      else if (t === 'icon') { const [, name, u, v, sz] = f, x = X(u), y = Y(v), w = sz * S; top.push(`<use href="#lm-${name}" x="${(x - w / 2).toFixed(0)}" y="${(y - w * 0.4).toFixed(0)}" width="${w.toFixed(0)}" height="${(w * 0.8).toFixed(0)}"/>`); }
      else if (t === 'yachts') { const p = P(f[1]); let s = ''; sample(p, f[2], (x, y) => { if (!near(x, y, 26)) s += `<use href="#sc-yacht" x="${(x - 22).toFixed(0)}" y="${(y - 10).toFixed(0)}" width="44" height="20" transform="rotate(${(-30 + rnd() * 60).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`; }); top.push(s); }
    }
    // Losail : dégagements peints en bandes de couleur tout autour du tracé
    let under = '';
    if (F.some((f) => f[0] === 'runoff')) {
      const d = 'M' + pts.map((q) => q.join(' ')).join(' L') + ' Z';
      under = `<path d="${d}" fill="none" stroke="#c9692e" stroke-width="96" stroke-linejoin="round" opacity=".75"/><path d="${d}" fill="none" stroke="#2c5aa0" stroke-width="96" stroke-linejoin="round" pathLength="100" stroke-dasharray="9 13" opacity=".8"/><path d="${d}" fill="none" stroke="#2f7d4f" stroke-width="96" stroke-linejoin="round" pathLength="100" stroke-dasharray="4 29" stroke-dashoffset="6" opacity=".85"/>`;
    }
    return { back: out.join(''), top: top.join(''), under, wet: (x, y) => wet.some((p) => inPoly(x, y, p)) };
  }

  /* Stands, paddock et tribune posés le long de la ligne droite des stands (tous les circuits) */
  function pits(pts, teamCols) {
    const n = pts.length; if (n < 8) return '';
    const a = pts[(n - 3) % n], b = pts[3 % n], [sx, sy] = pts[0];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    // côté intérieur : vers le centre du tracé
    const cx = pts.reduce((s, p) => s + p[0], 0) / n, cy = pts.reduce((s, p) => s + p[1], 0) / n;
    let nx = -ty, ny = tx; if ((cx - sx) * nx + (cy - sy) * ny < 0) { nx = -nx; ny = -ny; }
    const ang = (Math.atan2(ty, tx) * 180) / Math.PI;
    const at = (along, off) => [sx + tx * along + nx * off, sy + ty * along + ny * off];
    const rect = (along, off, len, dep, fill, extra = '') => { const [x, y] = at(along, off); return `<rect x="${(x - len / 2).toFixed(0)}" y="${(y - dep / 2).toFixed(0)}" width="${len.toFixed(0)}" height="${dep.toFixed(0)}" rx="3" fill="${fill}" transform="rotate(${ang.toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"${extra}/>`; };
    let s = '';
    // voie des stands, bâtiment des stands, paddock et motorhomes aux couleurs des écuries
    s += rect(0, 40, 380, 16, '#3a3f48');
    s += rect(6, 64, 300, 28, '#000', ' opacity=".3"') + rect(0, 60, 300, 28, '#d5dae1') + rect(0, 50, 300, 5, '#e10600', ' opacity=".75"');
    teamCols.slice(0, 10).forEach((c, i) => { s += rect(-135 + i * 30, 96, 22, 18, c); });
    // tribune principale de l'autre côté, gradins striés
    s += rect(4, -58, 280, 34, '#000', ' opacity=".3"') + rect(0, -54, 280, 34, '#7d8794');
    for (let k = 0; k < 4; k++) s += rect(0, -42 - k * 7, 276, 2, '#c9ced6', ' opacity=".55"');
    return s;
  }

  // points à laisser libres autour des stands et de la tribune (le décor aléatoire ne s'y pose pas)
  function pitZone(pts) {
    const n = pts.length; if (n < 8) return [];
    const a = pts[(n - 3) % n], b = pts[3 % n], [sx, sy] = pts[0]; let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    const out = []; for (let k = -180; k <= 180; k += 60) for (const off of [-60, 70, 100]) out.push([sx + tx * k - ty * off, sy + ty * k + tx * off]);
    return out;
  }
  F1.circuitGeo = { layer, pits, pitZone, has: (id) => !!G[id] };
})(window.F1 = window.F1 || {});
