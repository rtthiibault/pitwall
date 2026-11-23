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
  - **Les PitCoins ne se gagnent qu'en mode manager** : chaque course rapporte selon la position et la ligue (même en fond de grille), ainsi que les objectifs du jour. Les paris ne rapportent que des jetons.
- **Marché des pilotes** : la note de chaque pilote combine un talent de base (`TALENT` dans `js/manager.js`) et sa **forme réelle** de la saison. La note et le prix sont donc mis à jour chaque semaine (de 35 PC pour un rookie à 180 PC pour Verstappen). Chaque pilote a trois caractéristiques : Rythme, Combativité, Régularité.
- **Châssis** : de 60 à 250 PC, selon le niveau réel de l'écurie. Chacun a son profil de Vitesse de pointe, Appui aérodynamique et Fiabilité (`TEAM_PROFILE`).
- **Transferts** : un pilote ou un châssis se revend à 70 % de sa valeur. Changer de châssis remet la R&D à zéro, mais rembourse 50 % de l'argent investi.
- **R&D pièce par pièce** (onglet R&D, inspiré des jeux F1) :
  - **5 catégories** : Aérodynamique, Châssis, Chaîne motrice, Durabilité, Stratégie & équipe.
  - **Niveaux Mk I → Mk V** : chaque pièce se développe 5 fois (190 améliorations au total). Les gains diminuent et les coûts augmentent (×1,55 par niveau).
  - **Stratégie & équipe** : 6 pièces qui agissent pendant la course : embrayage de départ, gestion des pneus (usure en fin de relais), mode dépassement (5 derniers tours), équipe de stand (arrêts plus courts, moins d'arrêts ratés), ingénieur de course (coup stratégique sous voiture de sécurité), simulateur pilote.
  - **Packages** : quand toutes les pièces d'une branche atteignent un niveau, la branche donne un bonus supplémentaire.
  - **Pari soufflerie** : développer à moitié prix avec 55 % de réussite ; chaque échec augmente les chances suivantes (+12 points, jusqu'à 85 %).
  - **Objectifs du jour** : 3 défis tirés chaque jour (podium, places gagnées, meilleur tour, R&D…) qui rapportent des PitCoins.
  - **65 pièces en 16 branches** (325 niveaux) : groupe propulseur détaillé (plenum, échangeur, injection, collecteurs, soupape de décharge, embrayage, rapports, arbres de transmission, lubrification, récupération d'énergie…), flux aérodynamiques, liaisons au sol, fluides et sécurité.
  - **Groupe propulseur en vue éclatée** (`mountPU` dans `js/car3d.js`) : V6, collecteurs, turbo, plenum carbone, batterie, MGU-K, boîte et différentiel modélisés en 3D, avec étiquettes cliquables.
  - Détail historique : **38 pièces en 10 branches** à l'origine (`RD_PARTS` dans `js/manager.js`) : aileron avant, volet Gurney, fond plat, diffuseur, rétroviseurs, jantes, aileron arrière actif, suspensions, freins, V6 turbo, MGU-K, batterie, radiateurs…
  - **Déblocage** : les pièces d'une branche se débloquent dans l'ordre. Au-delà de la prochaine pièce, elles restent des « Améliorations inconnues ».
  - **Effets** : chaque pièce ajoute des points de Vitesse, d'Appui ou de Fiabilité.
  - **Conseil** : la pièce au meilleur rapport gain/prix pour le prochain GP est signalée.
  - **Voiture 3D** : votre monoplace s'affiche en haut de la page. Quand on sélectionne une pièce, la caméra zoome dessus (point `focus` de chaque pièce), avec un repère lumineux.
  - **Comparaison** : vos caractéristiques sont comparées à la moyenne des managers de votre ligue.
- **Muret des stands** (onglet Muret) : 5 postes (team principal, directeur technique, ingénieur de course, stratège, chef mécanicien), 5 candidats fictifs par poste. Chaque recrue apporte des bonus (PitCoins, coût de R&D, pneus, stratégie, arrêts au stand). `STAFF_ROLES` et `STAFF` dans `js/manager.js`.
- **Garage** (onglet Garage) : 20 équipements à 5 niveaux en 4 zones (voie des stands, box et mécaniciens, ingénierie, usine). Les équipements installés et les mécaniciens apparaissent dans la scène du garage. `GARAGE` dans `js/manager.js`.
- **Expérience des pilotes** : chaque pilote a son âge réel (`BIRTH` dans `js/manager.js`) et gagne de l'XP à chaque course terminée avec votre écurie. Jusqu'à 21 ans : XP ×2 et jusqu'à +12 points ; 22-23 ans : ×1,6 et +10 ; 24-27 ans : ×1,1 et +6 ; 28-32 ans : ×0,6 et +3 ; au-delà : progression quasi nulle. La progression est conservée par pilote (`drvXp` dans la sauvegarde).
- **3 courses gratuites toutes les 5 heures** (`RACES_PER_DAY`, `REFILL_H`). Ensuite, des courses supplémentaires se paient en jetons (la monnaie des paris) : 100, puis 150, 200… ; le tarif repart à 100 à chaque nouvelle fenêtre. Gains de PitCoins et d'XP au barème d'origine.
- **Pneus** (`TYRES` dans `js/manager.js`) : Tendres, Mediums, Durs, Intermédiaires, Pluie. Chaque voiture a une usure de 0 à 100 % ; au-delà de 75 % le rythme s'effondre. Un composé inadapté à l'état de la piste (sèche, humide, trempée) coûte plusieurs secondes par tour. Le joueur choisit ses pneus de départ, sans conseil.
- **Météo par circuit** (`CLIMATE`) : probabilité de pluie et température propres à chaque tracé (Spa 50 %, Bahreïn 2 %…). Un bulletin est affiché avant la course ; c'est une prévision, pas une certitude.
- **Stratégie et muret des stands** : avant la course, frise météo tour par tour (`forecastLaps`, à ± 2 tours près), pneus de départ et plan d'un ou deux arrêts (tour et composé). En course, le panneau « muret » affiche composé, usure, température et performance, et permet de changer de rythme (Attaque / Équilibré / Économie, `MODES`), de choisir le prochain train et d'appeler la voiture au stand. Un ordre donné avant l'entrée des stands s'applique au tour en cours : le tour est recalculé (`redoLap`).
- **Duels et imprévus** : rattraper une voiture ne suffit pas, il faut réussir le dépassement (combativité des deux pilotes, écart d'usure des pneus, rythme, longueur des lignes droites), sinon on reste bloqué derrière. S'y ajoutent les tours canon, blocages de roue, soucis électriques passagers, crevaisons sur débris, accrochages du premier virage, arrêts au stand plus irréguliers et une voiture de sécurité une course sur deux. La forme du jour pèse davantage et la hiérarchie est resserrée.
- **Règle des 2 composés** (`ruleOk`) : sur course sèche, joueur et IA doivent utiliser deux composés secs différents, sinon +30 s à l'arrivée. La règle saute si des Intermédiaires ou des pneus Pluie ont servi.
- **Radio stand** (`RADIO`) : à 25 %, 55 % et 80 % de la course, la course se fige et propose une opportunité tactique parmi 16 scénarios (voiture de sécurité, VSC, undercut, undercut adverse à couvrir, surchauffe, attaque, défense…). 15 secondes pour répondre, sinon le choix prudent s'applique. Le moteur de course avance tour par tour (`createRace`, `stepLap`, `applyChoice`) : chaque décision modifie la suite.
- **Course en vue 2D** (`js/racemap.js`) : tracé réel du circuit (`js/circuits.js`, géométrie du projet libre f1-circuits de Tomislav Bacinger, licence MIT) et un point par voiture aux couleurs de son écurie, qui avance selon son rythme, ses arrêts au stand et son classement. Départ aux feux, voiture de sécurité, accidents et pannes signalés sur la carte.
- **Météo en direct** : pluie et humidité de la piste évoluent tour par tour (`weatherTimeline`), à partir de la prévision réelle du prochain Grand Prix quand elle est disponible. Pneus pluie ou slicks : le stratège et la station météo décident de la vitesse de réaction. Un radar affiche les tours à venir.
- **Stratégie** :
  - Chaque circuit a un profil (`CIRCUIT`) : Monza demande de la vitesse, Monaco de l'appui, Singapour de la fiabilité…
  - Les courses se disputent sur le circuit du **prochain Grand Prix réel**.
  - Un **réglage aéro** (faible ou fort appui) s'ajuste avant chaque course.
  - Aucun conseil n'est donné : le site décrit seulement le tracé (lignes droites, virages lents, contraintes mécaniques).
- **Durée et équilibrage des courses** : une course dure environ 4 minutes en vitesse ×1 (×2 et ×4 disponibles), quel que soit le nombre de tours.
  L'usure par tour donne des relais réalistes (environ 19 tours en tendres, 27 en mediums, 35 en durs). Les écarts de rythme sont ramenés
  à l'échelle d'une course de 20 tours, pour que la hiérarchie ne pèse pas 3 fois plus que les imprévus ; les pertes ponctuelles
  (départ, accrochages, arrêts) restent en secondes réelles.
- **Carte de course** (`js/racemap.js`) : vue du dessus stricte, chaque voiture placée d'après ses propres temps au tour. Les arrêts se font
  dans une voie des stands parallèle à la ligne droite des stands, entre 95 % du tour et 5 % du tour suivant. Deux styles : « Animée » et
  « 2D épurée ». L'écran de course tient sur un seul écran sur PC (carte, classement compact, muret des stands).
- **Mode config basse** (bouton dans l'écran de course et en pied de page) : plus de flou, d'ombres ni d'animations décoratives, carte à 24 images/s.
- **Grille tarifaire R&D et garage** (`VALUE`, `TARIF` dans `js/manager.js`) : chaque bonus vaut un nombre de points de performance, et le prix
  de chaque niveau est proportionnel au gain apporté par ce niveau (80 PitCoins par point). Un gain plus grand coûte donc toujours plus cher.
  Chaque niveau Mk rapporte un peu plus que le précédent (`LV_GAIN`), et coûte donc un peu plus cher.
- **Équilibrage du marché et de la progression** :
  - XP des pilotes divisée par 3,75 (`XP_DIV`) : un point de progression demande environ 7 courses à un pilote de 20 ans, une vingtaine à un pilote à maturité.
  - Valeur marchande d'un pilote (`driverValue`) : 80 % sur sa note actuelle, progression acquise comprise, en exponentielle au-dessus de 80 ; 20 % sur sa marge de progression restante, pondérée par l'âge. C'est son prix sur le marché ; sa revente vaut 78 % de cette valeur (`RESALE_K`) : former un jeune et le revendre au sommet rapporte une plus-value.
  - Prix des châssis de 25 PC (fond de grille) à 500 PC (meilleure écurie), sans changer leurs performances. Revente au plus bas entre le prix payé et le prix actuel.
  - Points de ligue par ligue (`lpScale`) : aucune perte en Bronze, pertes réintroduites en Argent puis en Or, barème complet à partir de Platine.
  - Onglet R&D aux couleurs de l'écurie du joueur.
- **Sponsors** (onglet Sponsors du QG, `SPONSORS` dans `js/manager.js`) : 10 entreprises fictives en 3 paliers (locales dès Bronze, internationales dès Argent,
  prestige dès Or). Un contrat = un objectif sur un nombre de courses (ex. « Finir 2 fois dans le top 10 lors des 6 prochaines courses ») :
  prime de signature, prime si l'objectif est atteint, pénalité s'il ne l'est pas à l'échéance. Deux emplacements : principal (pontons et nez)
  et secondaire (aileron arrière, prime et pénalité ×0,6). Les sponsors sous contrat sont projetés sur la carrosserie 3D (`applySponsor` dans `js/car3d.js`).
- **Débriefing d'après-course** : classement final avec écarts et stratégies de pneus, progression du pilote (barre d'XP animée, hausses de caractéristiques),
  bilan PitCoins / points de ligue, avancement des objectifs sponsors, puis « Retourner au QG ».
- **Moteur de course** : le vrai nombre de tours de chaque Grand Prix (`RACE_LAPS` : 78 à Monaco, 44 à Spa, 53 à Monza…) contre 19 managers IA. La performance combine le niveau du pilote, les caractéristiques de la voiture avec les améliorations et la compatibilité avec le circuit, plus une part d'aléa :
  - la forme du jour ;
  - les qualifications, puis l'écart sur la grille au départ ;
  - les casses mécaniques, plus fréquentes avec une faible fiabilité ;
  - les accidents et les tête-à-queue, plus fréquents avec une faible régularité ;
  - une éventuelle voiture de sécurité.

  La course est animée tour par tour, avec une tour de classement et le fil des faits de course. 
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
- **Thème visuel** : `css/theme.css` (chargé après `style.css`) applique le thème « écran de chronométrage » : surfaces plates, filets fins, police Archivo à largeur variable (titres de Grand Prix élargis), chiffres tabulaires, rouge réservé aux actions et au direct, violet / vert / jaune utilisés comme sur les écrans de timing. Ni halo, ni verre dépoli, ni dégradé décoratif.
- **Monoplaces 3D** : il s'agit du modèle « F1 2026 concept polygon model » (`assets/f1-2026.glb`), affiché avec Three.js.
  Ferrari (SF-26), McLaren (MCL40), Aston Martin (AM26), Racing Bulls, Red Bull (RB22), Williams, Alpine, Audi (R26), Cadillac (MAC-26) et Mercedes (W17) ont leur propre modèle (`assets/f1/*.glb`, correspondance `F1_MODEL` dans `js/car3d.js`), chargé à la demande, avec sa livrée d'origine. Les décalcomanies (sponsors, numéros) et l'habitacle ont été retirés à la conversion ; même repère et mêmes essieux que le modèle générique, donc l'atelier R&D fonctionne à l'identique. Vérifiez la licence de chaque modèle avant diffusion.
  - **Conversion** : le fichier USDZ d'origine (1,16 million de triangles) a été converti en GLB, puis segmenté en zones de livrée (carrosserie, couleur secondaire, dessous de caisse, carbone, pneus, jantes).
  - **Allègement** : le modèle a été simplifié à environ 530 000 triangles et compressé avec meshopt (1,4 Mo).
  - **Peinture** : chaque écurie reçoit sa **livrée 2026** (couleurs, dégradés, découpes et filets d'après l'affiche officielle des monoplaces, sans les logos de sponsors). Ce sont les fonctions `LIVERY3D` de `js/visuals.js`, qui colorent chaque sommet selon sa position sur la voiture (avant/arrière, hauteur, côté).
  - **Affichage** : le bandeau d'accueil et le garage montrent une voiture interactive, qu'on fait pivoter à la souris ou au doigt. Ailleurs, le site affiche des images 3D générées dans le navigateur.
  - **Repli** : si WebGL est indisponible, des illustrations vectorielles prennent le relais.
  - ⚠️ Vérifiez la licence du modèle sur sa page d'origine. Si c'est une licence Creative Commons BY, ajoutez le crédit de l'auteur dans le pied de page.
- Elles apparaissent à plusieurs endroits :
  - sur les cartes des favoris ;
  - dans les duels, le podium, le tiercé et les classements ;
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
| `js/car3d.js` | Rendu 3D des monoplaces (Three.js, modèle GLB) |
| `assets/f1-2026.glb` | Modèle 3D de la monoplace |
| `assets/f1/*.glb` | Monoplaces dédiées (toutes les écuries sauf Haas) avec leur livrée d'origine |
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
| `js/wec.js` | Championnat WEC : calendrier, plateau Hypercar, lecture des résultats (`data/wec/<année>.json`) |
| `js/circuits.js` | Tracés réels des circuits (données f1-circuits, licence MIT) |
| `js/racemap.js` | Course manager en vue 2D : tracé du circuit et un point par voiture (canvas) |
| `js/fx.js` | Effets course auto : drapeau à damier entre les onglets, traces de pneus dans les marges au défilement, lignes de vitesse, apparitions en cascade, vibreur de navigation |

Pour ajuster le modèle : `TEAM_PRIOR` (niveau supposé des écuries en début de saison) se trouve dans `data.js`, et les exposants et l'effet de la grille dans `model.js`. La marge du « bookmaker » se règle par marché dans `markets.js` (`margin`).

## Championnat WEC (endurance)

Un sélecteur en haut de l'accueil bascule tout le site entre la **Formule 1** et le **WEC**. Le moteur de cotes, le ticket, les combinés, le tiercé et le règlement automatique sont les mêmes ; en WEC on parie sur une **voiture Hypercar** (son équipage) au lieu d'un pilote.

- **Marchés** : vainqueur, podium, top 6, top 10, meilleur tour, abandon, Hyperpole, constructeur vainqueur, doublé, duels entre voitures, nombre d'Hypercars classées, écart du vainqueur (10, 30, 60 s), marque victorieuse en LMGT3, titres pilotes et constructeurs.
- **Barème** : points doublés au Mans, ×1,5 au Qatar et à Bahreïn, +1 point pour la pole ; le titre constructeurs compte la meilleure voiture de chaque marque.
- **Données** : le WEC n'a pas d'API publique gratuite. Le calendrier 2027 et le plateau (provisoire tant que la liste officielle des engagés n'est pas publiée) sont dans `js/wec.js`.
- **Résultats** : après chaque course, complétez `data/wec/2027.json` (le format est décrit dans le fichier). Les paris se règlent alors automatiquement à la prochaine visite. Exemple :

```json
"rounds": { "1": { "hypercar": ["8", "51", "7"], "dnf": ["12"], "pole": "50", "fastest": "8", "margin": 12.4, "lmgt3": "bmw" } }
```

- Les jetons, les succès et le classement entre amis sont communs aux deux championnats. Le mode manager reste basé sur la F1.
- **Prototypes 3D** : `assets/wec/*.glb` (Ferrari 499P, Cadillac V-Series.R, Peugeot 9X8, BMW M Hybrid V8, Toyota GR010 Hybrid, Aston Martin Valkyrie, Genesis GMR-001, Porsche 963), convertis depuis les modèles fournis, sans leurs textures (donc sans livrée d'origine ni sponsor) et peints aux couleurs du constructeur. Les constructeurs sans modèle (McLaren, Ford) utilisent la Porsche 963 à leurs couleurs. Correspondance dans `WEC_MODEL` (`js/car3d.js`). Vérifiez la licence de chaque modèle avant diffusion.
- Les pictogrammes du sélecteur sont des dessins originaux, pas les logos officiels (marques déposées).

## Avertissement
Ce jeu est gratuit, sans argent réel ni gain matériel. C'est un site de fans non officiel, sans lien avec la Formula One Group, la FIA ou les écuries.

### Mes ligues : pronostics podium entre amis

L'onglet **Mes ligues** (à côté de Paris) permet de créer une ligue privée (code d'invitation unique `PIT-XXXX`, lien de partage)
ou d'en rejoindre une avec un code. Chaque week-end, chaque joueur pronostique le **podium des qualifications et de la course** ;
ses pronostics valent pour toutes ses ligues et se verrouillent au début de chaque session.

- Points de ligue uniquement (aucune monnaie du jeu) : course 25 / 18 / 15 pour la bonne marche, +5 pour un pilote sur le podium
  à une autre marche, +15 pour le podium parfait ; qualifications 10 / 8 / 6, +3, +5. Barème dans `PODIUM` (`js/app.js`).
- Classement de la ligue : total de la saison, points du dernier GP, et comparaison des pronostics de chacun une fois la session verrouillée.
- Sans base de données, les pronostics restent sur l'appareil (localStorage `pitwall:podium`).

Activation (une seule fois, dans Supabase → SQL Editor → New query → Run), dans cet ordre :
1. `supabase/migration-bet-leagues.sql` (ligues et codes d'invitation) ;
2. `supabase/migration-podium.sql` (pronostics). Le serveur horodate chaque pronostic, refuse toute modification après le début
   de la session, et ne montre les pronostics des autres qu'aux membres d'une même ligue, une fois la session commencée.
   Le site ne compte pas un pronostic modifié après l'heure officielle de la session.

### Grand Prix Hebdomadaire (F1 Manager en ligne)

Onglet **GP Hebdo** du QG, en parallèle de la campagne et avec le même garage (pilote, châssis, R&D, livrée sponsor).
- Chaque semaine (lundi 00 h 00 → dimanche 23 h 59, heure de Paris), un seul Grand Prix pour tout le monde : la semaine ISO sert de graine
  (`weeklyEvent` dans `js/manager.js`) pour le circuit, la météo tour par tour, les managers IA (tirés de tables fixes) et les dilemmes radio.
  Bandeau avec le Grand Prix, la météo prévue et le compte à rebours de clôture.
- 2 tentatives par semaine ; la course se joue comme en campagne (muret, arrêts, radio). Le temps total de course est enregistré au
  millième (ex. `1 h 25 m 14,382 s`) avec la position et la configuration ; abandon ou règle des 2 composés non respectée = DNF / non classé.
  Seul le meilleur temps compte.
- Ne consomme pas les courses gratuites de la campagne ; les contrats sponsors sont en pause ; petit bonus d'XP de participation.
- Classement général et filtre par ligue privée (ligues de « Mes ligues ») avec les écarts au leader.
- Récompenses : +50 PC au premier chrono de la semaine ; à la clôture, prime selon le rang (1er 600, 2e 450, 3e 350, top 10 200,
  top 25 % 120, classé 60) et trophée pour un top 10, versés à la visite suivante du F1 Manager.
- Sauvegarde : `manager.weeklyGP` = { weekId, attemptsUsed, bestTime, bestPosition, bestConfig, rewardClaimed, firstPrime },
  `manager.weeklyPast` (semaine en attente de prime) et `manager.trophies`. Les anciennes sauvegardes ne sont pas modifiées.

Activation du classement : exécuter une fois `supabase/migration-weekly.sql` dans Supabase (SQL Editor → New query → Run).
Le serveur compte les tentatives, n'accepte que la semaine en cours et garde le meilleur temps.


## Paddock Wire (actualité F1 et moteur d'impact)

Page `#/paddock`, accessible par le bouton « Paddock Wire » de l'en-tête et par le bloc de l'accueil.

- **Relevé toutes les 30 min** : `.github/workflows/news.yml` tourne à :11 et :41 et lance `scripts/update-news.mjs`, qui relève si le dernier relevé date d'environ 30 min ou plus. Lancement manuel (Actions → Paddock Wire → Run workflow) pour relever tout de suite.
- **Sources** : flux RSS francophones (Motorsport.com, Nextgen-Auto, F1i, AutoHebdo) ; Motorsport.com en anglais seulement en secours. Seuls le titre, un extrait court et le lien vers l'article sont repris.
- **Analyse** (`scripts/news-analyze.mjs`, règles par mots-clés FR/EN) : écuries, motoristes et pilotes cités, sujet (moteur, aéro, fiabilité, pilote, règlement, météo) et tonalité → catégorie `TECHNIQUE | PADDOCK | RÈGLEMENT | MÉTÉO` et `impact { targetType, targetIds, managerModifiers { powerUnit, aero, reliability }, bettingOddsMultiplier, impactLabel }`. Transferts, contrats et rumeurs n'ont pas d'impact.
- **Effets** (`js/news.js`) : moteur → vitesse de pointe, aéro → appui, fiabilité → risque de casse, pour l'écurie visée dans les courses de campagne F1 Manager ; cotes des pilotes et écuries visés multipliées dans les Paris (inversé pour le marché « Abandon »). Plein effet 48 h, puis dégressif jusqu'à 7 jours ; une même info reprise par plusieurs médias ne compte qu'une fois. Le GP Hebdomadaire n'est pas affecté (même course pour tous).
- **Synchro** : le site recharge `data/news.json` dès qu'un relevé est attendu ; le bouton « Forcer la synchro » le recharge immédiatement et réapplique les impacts.

## F1 Manager : télémétrie de course (carburant, ERS, températures)

Écran de course en plein écran (API Fullscreen si le navigateur l'accepte, sinon toute la fenêtre), avec une fine barre supérieure.

- **Grille** : charge de carburant choisie avant les feux (Sous-chargé 95 % de la consommation standard, Standard 102 %, Surchargé 106 %). Le poids coûte 3 s par tour réservoir plein (`FUEL_W`).
- **Mélange** Économie / Standard / Attaque (consommation ×0,88 / ×1 / ×1,1, rythme +0,3 / 0 / −0,28 s). Jauge en kg et marge en tours (`fuelDelta`). Réservoir vide : mode dégradé (+14 s par tour), puis panne sèche.
- **ERS** Recharge / Équilibré / Dépassement / Tour de qualif : batterie 0–100 %, le déploiement donne du rythme et un bonus en duel ; sans charge, plus d'effet.
- **Températures** : pneus (fenêtre 90–105 °C ; au-delà usure et chrono dégradés) et moteur (critique au-delà de 115 °C : perte de puissance, puis risque de casse qui grandit avec la durée). Elles montent avec les modes agressifs et l'air sale (moins d'1 s derrière une voiture).
- **Consignes** : Tenter un dépassement (écart < 1,0 s ; batterie −18 %, chauffe, risque de blocage si la batterie ou les pneus ne sont pas prêts), Défendre la position, Air propre / Refroidir.
- **IA** : chaque voiture gère aussi son carburant, sa batterie et ses températures. Tous les débits sont ramenés à la longueur de la course (÷ K) comme le reste du moteur.
- **Classement** : écarts au leader ou intervalles, interpolés toutes les 250 ms ; nombre d'arrêts de chaque voiture.
- **Radio du pilote** : messages tirés de l'état réel de la voiture (surchauffe, batterie vide, carburant, issue d'une attaque ou d'une défense), dans un encart aux couleurs de l'écurie.
