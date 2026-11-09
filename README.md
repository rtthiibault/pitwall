# PITWALL — Pronostics Formule 1

Site de paris **à jetons virtuels** sur la Formule 1. Il est 100 % statique (HTML/CSS/JS, rien à compiler) et s'héberge gratuitement.

## Fonctionnalités

- **Données live** : calendrier, résultats, qualifs, sprints et classements viennent de l'[API Jolpica](https://github.com/jolpica/jolpica-f1) (le successeur d'Ergast). Le site s'actualise tout seul après chaque Grand Prix.
- **Moteur de cotes** : 20 000 simulations Monte-Carlo de chaque course (modèle de Plackett-Luce). Il prend en compte :
  - les points par course du pilote ;
  - les points de son écurie ;
  - sa forme récente, avec une décroissance exponentielle ;
  - la grille de départ, dès que les qualifs sont disputées ;
  - la météo prévue (Open-Meteo), car la pluie augmente l'aléa.
- **Plus de 35 marchés par GP** :
  - victoire, podium, top 6, points, meilleur tour, pole, abandon, vainqueur du sprint ;
  - écurie gagnante, doublé, les deux voitures dans les points ;
  - duels entre coéquipiers et entre rivaux au championnat ;
  - nombre de voitures classées, écart du vainqueur, victoire du poleman, position de départ du vainqueur ;
  - **tiercé** dans l'ordre ou dans le désordre (formule de Harville) ;
  - **cote boostée** du week-end ;
  - champions pilotes et constructeurs, obtenus en simulant la fin de saison.
- **Ticket** de paris simples ou combinés. Les sélections liées entre elles sont détectées et interdites dans un même combiné.
- **Règlement automatique** des paris dès que les résultats officiels sont publiés, avec confettis 🎉.
- **Portefeuille** : 1 000 jetons au départ, une prime à chaque Grand Prix, un ravitaillement si le solde tombe à zéro, 9 succès à débloquer et des statistiques (ROI, taux de réussite, courbe du solde).
- **Pages** : calendrier, classements (avec un graphique d'évolution interactif), résultats détaillés de chaque GP.
- **Sauvegarde** : export/import d'un code, pour passer d'un appareil à l'autre.

## Saisons multiples (2026 → 2027)
- `js/season2027.js` contient le **calendrier officiel 2027** : 24 GP et 10 Sprints. Le Portugal et la Turquie reviennent, la Turquie étant encore « à confirmer ». Il contient aussi la grille provisoire, où les baquets non officialisés sont marqués « à confirmer ». Les horaires sont estimés.
- Tant que 2026 se dispute :
  - la page d'accueil présente la saison 2027 ;
  - le calendrier 2027 est consultable (sélecteur 2026/2027 sur la page Calendrier) ;
  - les paris **Champion 2027** sont déjà ouverts (onglet Paris → Saison).
- Dès que le dernier GP 2026 est passé, le site **bascule automatiquement** sur 2027 : les paris ouvrent sur Bahreïn, une prime de nouvelle saison de 500 jetons est offerte et le champion 2026 est rappelé.
- Les cotes d'avant-saison partent de la hiérarchie 2026 (points par voiture et par course, régressés vers la moyenne). Elles intègrent aussi une incertitude par écurie qui diminue au fil des courses.
- Dès que l'API publie les horaires et la grille officiels 2027, ils remplacent automatiquement les données intégrées.
- Les paris d'une saison sont réglés avec les données de cette saison, même après la bascule.
- Pour préparer 2028 : copiez `season2027.js` en `season2028.js`, mettez à jour les tableaux et ajoutez la balise `<script>` dans `index.html`.

## Publier gratuitement

### Option A : GitHub Pages (recommandée, active la mise à jour hebdo)
1. Créez un compte sur github.com, puis un dépôt public (par exemple `pitwall`).
2. Envoyez-y tout le contenu de ce dossier (bouton « Add file » puis « Upload files »). Le dossier `.github` doit bien être inclus ; avec l'interface web, glissez-déposez le dossier entier.
3. Allez dans **Settings → Pages**, choisissez **Deploy from a branch**, puis `main` et `/ (root)`, et enregistrez.
4. Au bout d'une minute, le site est en ligne sur `https://VOTRE-PSEUDO.github.io/pitwall/`.
5. Allez dans **Actions**, activez les workflows, puis lancez une première fois **« Mise à jour hebdomadaire des données F1 »** avec *Run workflow*.

### Option B : Netlify / Cloudflare Pages
Glissez-déposez le dossier sur [app.netlify.com/drop](https://app.netlify.com/drop) et c'est en ligne. Le site lit l'API live directement : la GitHub Action n'est qu'un filet de sécurité.

## Comment se fait l'actualisation
1. À chaque visite, le navigateur interroge l'API live, avec un cache de 20 minutes.
2. Si l'API est injoignable, le site utilise `data/snapshot.json`, que la GitHub Action régénère le lundi et le mardi.
3. En dernier recours, il affiche le calendrier et la grille 2026 intégrés (`js/fallback.js`).

## Tester en local
```bash
cd pitwall
```
```bash
python3 -m http.server 8000
```
Ouvrez ensuite http://localhost:8000.

## Structure
| Fichier | Rôle |
|---|---|
| `js/season2027.js` | Calendrier et grille 2027 intégrés |
| `js/data.js` | Appels API, cache, normalisation, couleurs des écuries, drapeaux |
| `js/model.js` | Simulation Monte-Carlo, conversion probabilité → cote |
| `js/markets.js` | Définition des marchés et règles de règlement |
| `js/store.js` | Portefeuille, paris, succès (localStorage) |
| `js/app.js` | Interface : pages, ticket, graphiques, animations |

Pour ajuster le modèle : `TEAM_PRIOR` (niveau supposé des écuries en début de saison) se trouve dans `data.js`, et les exposants et l'effet de la grille dans `model.js`. La marge du « bookmaker » se règle par marché dans `markets.js` (`margin`).

## Avertissement
Ce jeu est gratuit, sans argent réel ni gain matériel. C'est un site de fans non officiel, sans lien avec la Formula One Group, la FIA ou les écuries.
