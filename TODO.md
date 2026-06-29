# BetBot Simulator — Checklist des problèmes connus

## Bugs

- [x] Tableau des paris combinés ne se met pas à jour après un cycle
      → Cause : cache statique Next.js sur les routes GET (`force-dynamic` manquant)
      → Fix : `export const dynamic = "force-dynamic"` ajouté sur /api/combined-bets, /api/bots, /api/bets

- [x] Suppression d'un bot ne supprimait pas ses paris combinés et leurs jambes
      → Causait des références orphelines en base et des erreurs Prisma

- [ ] Bots combinés placent peu ou pas de paris
      → Cause : chaque jambe doit passer le minEdge individuellement, très rare d'en avoir 2+ simultanément
      → Atténuation : minEdge abaissé à 3% pour COMBI-SAFE et ACCUMULATOR
      → À surveiller sur plusieurs cycles

## Limitations connues

- [ ] Pool de matchs limité (~20 matchs par cycle)
      → Seulement 9 ligues configurées (7 foot, 2 basket, 0 tennis actif hors Grand Chelems)
      → Fenêtre de 5 jours seulement
      → À faire : élargir les ligues et/ou la fenêtre quand le quota API le permet

- [ ] Quota Odds API (500 req/mois)
      → Avec 9 ligues + cache 6h : environ 9 req toutes les 6h max
      → Ajouter des ligues = plus de consommation
      → À faire : monitorer et ajuster le TTL cache si besoin

- [ ] Tennis quasi-inexistant
      → Seuls les 4 Grands Chelems sont configurés (4 fois par an)
      → À faire : ajouter les tournois ATP/WTA hebdomadaires (ATP 250, 500, Masters)

- [ ] Pas de test framework configuré
      → Aucun test unitaire ni d'intégration
      → À faire si le projet grossit

## Améliorations futures

- [ ] Modifier les bots combinés pour accepter des jambes partielles
      → Actuellement : si N jambes requises et N-1 disponibles → pas de combiné
      → Idée : placer un combiné plus court si pas assez de sélections

- [ ] Dashboard : fenêtre temporelle configurable sur le graphe (7j / 30j / tout)

- [ ] Notifications quand un pari est résolu (won/lost)

- [ ] Résolution automatique des paris (actuellement manuel via "Résoudre tous")

- [ ] Élargir les ligues disponibles par sport (Ligue 2, Championship, MLS, ATP hebdo...)

## Infrastructure & Collaboration

- [ ] Migration base de données SQLite → Supabase (PostgreSQL)
      → Permet à plusieurs personnes de travailler sur la même base en temps réel
      PLAN :
        1. Créer un projet sur supabase.com (free tier : 500 MB, 2 projets)
        2. Récupérer la DATABASE_URL (format postgres://...) dans Settings > Database
        3. Dans prisma/schema.prisma : changer provider "sqlite" → "postgresql"
        4. Supprimer les migrations SQLite (prisma/migrations/) et relancer :
              npx prisma migrate dev --name init
        5. Mettre à jour .env.local avec la nouvelle DATABASE_URL
        6. Important : ajouter ?pgbouncer=true&connection_limit=1 à l'URL pour Next.js serverless
        7. Partager DATABASE_URL + clés API via canal sécurisé (pas git)
        → Attention : ODDS_API_KEY partagée = quota commun

## Données de cotes — Remplacement / Optimisation The Odds API

Situation actuelle : 11 sport keys × 4 refreshes/jour (TTL 6h) ≈ 1 300 req/mois.
Free tier = 500 req/mois → quota déjà dépassé avec la config actuelle.

### Réponse à la question "MCP + calculs maison peut-il remplacer les cotes ?"
NON pour les cotes bookmaker. L'edge se calcule : prob_estimée − (1 / cote_bookmaker).
Sans cote réelle, pas de ligne de référence → impossible de savoir s'il y a de la valeur.
MCP peut enrichir les probabilités de Claude (voir section MCP) mais pas remplacer la source de cotes.

### Options (par ordre de priorité)

- [ ] Option A — Optimiser The Odds API (court terme, 0€)
      → TTL passer de 6h à 12h → divise le quota par 2 (~660 req/mois)
      → Réduire à 5-6 ligues prioritaires (EPL, Ligue 1, La Liga, Bundesliga, NBA) → ~400/mois
      → Supprimer les appels /scores redondants (factoriser par sport key)
      → Résultat attendu : rentrer sous les 500 req/mois gratuites

- [ ] Option B — The Odds API plan payant (~5$/mois) ← OPTION RECOMMANDÉE
      → Même API, même code, aucun refactoring
      → Plan Starter : ~10 000 req/mois (20× le free tier)
      → Avec 11 ligues + TTL 6h : ~1 300 req/mois → largement suffisant avec de la marge
      → La solution la plus simple et la plus durable
      PLAN :
        1. Se connecter sur the-odds-api.com → Upgrade plan
        2. Rien d'autre à faire côté code

- [ ] ~~Option Betfair Exchange~~ — NON DISPONIBLE EN FRANCE
      → Betfair Exchange (paris en bourse P2P) n'est pas couvert par la licence ANJ
      → betfair.fr = cotes fixes uniquement, API Exchange non accessible depuis France
      → À exclure

- [ ] Option C — Scraper API interne Winamax ← EN COURS (quota The Odds API épuisé)
      → Winamax charge ses cotes via des endpoints JSON internes non authentifiés
      → Données publiques (visibles sans compte), pas de limite connue
      → Cotes réelles françaises, couverture : foot européen, NBA, tennis ATP/WTA
      → Risque principal : si Winamax change la structure de leur site, à maintenir

      PLAN D'IMPLÉMENTATION :

      Étape 1 — Discovery des endpoints (à faire manuellement)
        · Ouvrir winamax.fr dans Chrome → F12 → onglet Réseau → filtre "Fetch/XHR"
        · Naviguer sur Football → Ligue 1 → un match → capturer les appels réseau
        · Chercher les URLs contenant "apifeed", "api", "sports", "events"
        · Noter : URL exacte, structure JSON de réponse (event, odds, teams, date)
        · Répéter pour Basketball (NBA) et Tennis
        · Partager les URLs trouvées pour coder l'adaptateur

      Étape 2 — Créer lib/winamax.ts
        · Fonction getUpcomingMatchesWinamax(sports) → OddsMatch[]
        · Même interface que lib/odds.ts, transparent pour le reste du code
        · Mapping : sportId Winamax → "soccer"/"basketball"/"tennis"
        · Mapping : compétitionId → label de ligue (ex: Ligue 1, EPL, NBA...)
        · Filtrer les matchs dans la fenêtre 5 jours
        · Réutiliser le cache OddsCache existant (même modèle Prisma)

      Étape 3 — Résolution des scores
        · Winamax ne fournit pas forcément les scores post-match
        · Option A : garder The Odds API uniquement pour /scores (très peu de req)
          → Les scores ne consomment que ~50 req/mois si on résout rarement
        · Option B : football-data.org pour les résultats foot (gratuit, 10 ligues)
          → Nécessite un adaptateur séparé pour les scores
        · Option C : stocker le résultat depuis les cotes en direct (odds bougent fort si 1 équipe gagne)
          → Trop approximatif, à éviter

      Étape 4 — Swap dans lib/odds.ts
        · Remplacer fetchFromApi par l'appel Winamax
        · Garder ODDS_API_KEY uniquement pour getScoresBySportKey
        · Variable d'env : WINAMAX_ENABLED=true pour basculer facilement

- [ ] Option D — API-Football (RapidAPI) pour les fixtures + The Odds API pour les cotes
      → API-Football free tier : 100 req/jour, fixtures + stats détaillées
      → Permettrait de dissocier : fixtures/stats via API-Football, cotes via The Odds API
      → Réduit les appels The Odds API (on sait quand les matchs ont lieu avant de demander les cotes)
      → Pas une vraie solution au quota mais optimise les appels

## MCP (Model Context Protocol)

- [ ] MCP stats sportives pour enrichir l'analyse Claude
      → Objectif : améliorer les estimations de probabilité de Claude (pas remplacer les cotes)
      → Données à injecter avant l'analyse :
         · Forme récente des équipes (5 derniers matchs : V/N/D, buts)
         · Blessés / absents clés (API-Football free tier ou football-data.org)
         · Confrontations directes (H2H : 5 dernières rencontres)
         · Classement en temps réel + domicile/extérieur séparé
         · xG moyen sur les 5 derniers matchs (Understat pour les top 5 ligues)
      → Source recommandée : football-data.org (gratuit, 10 ligues, pas de limite stricte)
      → Claude pourrait appeler ces outils avant d'estimer sa probabilité
      → Impact attendu : meilleures estimations de prob → meilleur edge → plus de valeur
      PLAN :
        1. Créer un serveur MCP Node.js dans /mcp/sports-stats/
        2. Outils exposés : get_team_form(team, league), get_h2h(team1, team2), get_standings(league)
        3. Brancher football-data.org (clé gratuite sur football-data.org/client)
        4. Modifier lib/claude.ts : passer les stats en contexte additionnel au prompt
        5. Tester sur quelques matchs → comparer edge avant/après

- [ ] MCP serveur projet (usage développement)
      → Exposer la DB et les routes du projet directement à Claude Code (l'IA de dev)
      → Permettrait d'interroger les bots/paris/stats sans passer par l'interface web
      → Exemples d'outils : get_bots, get_recent_bets, run_bot, get_bankroll_history
      → Utile pour débugger, analyser les performances, faire des ajustements en direct
