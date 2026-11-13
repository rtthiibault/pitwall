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

## Mode manager (page « Écurie »)
- **PitCoins (PC)** : c'est une seconde monnaie, séparée des jetons de paris. On démarre avec 300 PC, sans pilote ni voiture.
  - **Chaque pari gagné rapporte** de 5 à 80 PC, selon le bénéfice, avec un bonus si la cote est d'au moins 5.
  - **Les courses du mode manager rapportent** aussi des PC, selon la position et la ligue.
- **Marché des pilotes** : la note de chaque pilote combine un talent de base (`TALENT` dans `js/manager.js`) et sa **forme réelle** de la saison. La note et le prix sont donc mis à jour chaque semaine (de 35 PC pour un rookie à 180 PC pour Verstappen). Chaque pilote a trois caractéristiques : Rythme, Combativité, Régularité.
- **Châssis** : de 60 à 250 PC, selon le niveau réel de l'écurie. Chacun a son profil de Vitesse de pointe, Appui aérodynamique et Fiabilité (`TEAM_PROFILE`).
- **Transferts** : un pilote ou un châssis se revend à 70 % de sa valeur. Changer de châssis remet la R&D à zéro, mais rembourse 50 % de l'argent investi.
- **R&D** : 10 niveaux par caractéristique, chacun ajoute +2,5 points. Le coût augmente à chaque niveau (25, 33, 44… PC).
- **Stratégie** :
  - Chaque circuit a un profil (`CIRCUIT`) : Monza demande de la vitesse, Monaco de l'appui, Singapour de la fiabilité…
  - Les courses se disputent sur le circuit du **prochain Grand Prix réel**.
  - Un **réglage aéro** (faible ou fort appui) s'ajuste avant chaque course.
  - Le site affiche l'indice de la voiture et la **position moyenne estimée**, calculée sur 150 courses simulées.
- **Moteur de course** : 20 tours contre 19 managers IA. La performance combine le niveau du pilote, les caractéristiques de la voiture avec les améliorations et la compatibilité avec le circuit, plus une part d'aléa :
  - la forme du jour ;
  - les qualifications, puis l'écart sur la grille au départ ;
  - les casses mécaniques, plus fréquentes avec une faible fiabilité ;
  - les accidents et les tête-à-queue, plus fréquents avec une faible régularité ;
  - une éventuelle voiture de sécurité.

  La course est animée tour par tour, avec une tour de classement et le fil des faits de course. Le joueur dispose de 5 courses par jour.
- **Ligues** : Bronze (0 LP), Argent (100), Or (250), Platine (450), Diamant (700), Légende (1000).
  - Les points de ligue (LP) vont de +30 pour une victoire à −10 pour la dernière place, et −8 pour un abandon.
  - Plus la ligue est haute, plus les adversaires IA sont forts, et plus les gains sont multipliés (×1 à ×4).
- **Classement mondial des managers** : il est disponible si Supabase est configuré. Il faut exécuter **une fois** `supabase/migration-manager.sql` dans le SQL Editor de Supabase.

## Système d'amis
La page **Amis** permet de :
- rechercher un joueur par son pseudo ;
- lui envoyer une demande d'ami, puis accepter ou refuser les demandes reçues ;
- partager un lien d'invitation ;
- comparer ses résultats dans un **classement entre amis** (solde, bénéfice, réussite, meilleure cote, succès).

Un badge rouge dans la barre du haut signale les nouvelles demandes.

### Activer le système d'amis (une seule fois, environ 5 minutes, gratuit)
1. Créez un compte et un projet gratuit sur [supabase.com](https://supabase.com) (bouton *New project*, région Europe).
2. Ouvrez **SQL Editor → New query**, collez le contenu de `supabase/schema.sql`, puis cliquez sur **Run**.
3. Allez dans **Authentication → Sign In / Providers** et activez **Allow anonymous sign-ins**.
4. Allez dans **Project Settings → API**. Copiez la *Project URL* et la clé *anon public* dans `js/config.js`.
5. Commitez et poussez `js/config.js` sur GitHub : c'est en ligne.

La clé *anon* est **publique par conception** : vous pouvez la mettre dans le site sans risque. La sécurité repose sur les règles (RLS) de `schema.sql` :
- chacun ne peut modifier que son propre profil ;
- seuls les deux joueurs concernés voient une demande d'ami ;
- seul le destinataire peut l'accepter.

Ne mettez **jamais** la clé *service_role* dans le site.

### Limites à connaître
- **Le profil joueur est lié au navigateur** (compte anonyme, sans email). Si on vide les données du navigateur ou qu'on change d'appareil, on repart avec un nouveau profil.
- **Les statistiques du classement sont déclarées par chaque navigateur** : c'est un jeu entre amis, pas une compétition protégée contre la triche.
- **Seuls le pseudo, l'écurie favorite et les statistiques de jeu sont publics.**

## Pilotes et monoplaces
- **Portraits des pilotes** : il s'agit uniquement d'images **libres de droits** issues de Wikimedia Commons (licences CC BY, CC BY-SA, CC0…), c'est-à-dire les photos principales des pages Wikipédia des pilotes. L'automatisation hebdomadaire les liste dans `data/portraits.json`, avec l'auteur et la licence de chacune. Les crédits sont affichés par le lien « crédits photos » en pied de page, comme l'exigent ces licences. Si une photo manque, le site affiche les initiales du pilote aux couleurs de son écurie.
- **Monoplaces** : ce sont des illustrations vectorielles originales aux couleurs de chaque écurie (`js/visuals.js`, objet `LIVERY`). Elles n'utilisent aucune image officielle, donc aucun problème de droits.
- Elles apparaissent à plusieurs endroits :
  - sur les cartes des favoris ;
  - dans les duels, le podium, le tiercé et les classements ;
  - sur la nouvelle page **Grille** (chaque écurie, sa voiture et ses deux pilotes) ;
  - dans le bandeau d'accueil, avec la voiture du favori.

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
Les données sont actualisées sur deux niveaux :

1. **Temps réel.** À chaque visite, le navigateur interroge l'API live, avec un cache de 20 minutes. Le site couvre :
   - le calendrier ;
   - les résultats, les qualifications et les sprints ;
   - les classements pilotes et constructeurs ;
   - la météo (Open-Meteo) ;
   - les cotes et le règlement des paris.
2. **Automatisation GitHub** (`.github/workflows/update-data.yml`). Elle régénère `data/seasons/<année>.json` pour les saisons précédente, en cours et suivante, ainsi que `data/snapshot.json` et `data/meta.json`. Elle passe :
   - le samedi soir, pour les qualifs et le sprint ;
   - le dimanche, toutes les 6 heures, pour la course ;
   - le lundi, pour les classements officiels ;
   - le mercredi, pour les pénalités et les corrections.

   Elle ne commite que si les données ont changé. Le lundi, elle commite quand même, ce qui sert de battement hebdomadaire : GitHub désactive une tâche planifiée après 60 jours sans activité, et ce commit l'en empêche pendant l'intersaison.
3. **Ordre de repli.** Si l'API est en panne, chaque saison retombe sur son fichier hebdomadaire. En dernier recours, le site utilise le calendrier et la grille intégrés (`js/fallback.js`, `js/season2027.js`).

Le pied de page indique la source utilisée et la date de la dernière vérification automatique. Pour forcer une mise à jour, va dans **Actions**, puis « Mise à jour des données F1 », puis *Run workflow*.

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
| `js/visuals.js` | Monoplaces SVG (livrées) et portraits des pilotes |
| `js/social.js` | Système d'amis (Supabase) |
| `js/config.js` | Configuration Supabase (URL + clé anon) |
| `supabase/schema.sql` | Tables et règles de sécurité du système d'amis |
| `js/manager.js` | Mode manager : marché, R&D, circuits, moteur de course, ligues |
| `supabase/migration-manager.sql` | Colonnes du classement des ligues |
| `js/data.js` | Appels API, cache, normalisation, couleurs des écuries, drapeaux |
| `js/model.js` | Simulation Monte-Carlo, conversion probabilité → cote |
| `js/markets.js` | Définition des marchés et règles de règlement |
| `js/store.js` | Portefeuille, paris, succès (localStorage) |
| `js/app.js` | Interface : pages, ticket, graphiques, animations |

Pour ajuster le modèle : `TEAM_PRIOR` (niveau supposé des écuries en début de saison) se trouve dans `data.js`, et les exposants et l'effet de la grille dans `model.js`. La marge du « bookmaker » se règle par marché dans `markets.js` (`margin`).

## Avertissement
Ce jeu est gratuit, sans argent réel ni gain matériel. C'est un site de fans non officiel, sans lien avec la Formula One Group, la FIA ou les écuries.
