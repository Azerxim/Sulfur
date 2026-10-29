# Module HTTP / REST

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/http.md) · **Français**

- **Serveur** HTTP ou HTTPS (certificat auto-signé `HTTP@Sulfur`, généré au premier démarrage), port
  par défaut 8080 :
  - **variables simulées** (nombre, entier, booléen, texte, JSON ; sinus, rampe, aléatoire,
    bascule), modifiables serveur démarré, exposées par une API REST intégrée :
    `GET <base>/variables`, `GET <base>/variables/<nom>`, `PUT | PATCH | POST <base>/variables/<nom>`
    (corps `{ "value": … }` ou valeur seule) pour les variables modifiables ;
  - **routes** vérifiées dans l'ordre : méthode, chemin à paramètres (`/api/devices/:id`, `*` en
    fin), code, en-têtes, délai et gabarit de réponse (`{{var.<nom>}}`, `{{params.<nom>}}`,
    `{{query.<nom>}}`, `{{headers.<nom>}}`, `{{body.<champ>}}`, `{{now}}`, `{{uuid}}`…) ; une route
    peut affecter une variable à partir de la requête (ex. `body.value`) ;
  - **authentification** : Basic (utilisateurs, mots de passe hachés en scrypt dès la saisie), jeton
    Bearer ou clé d'API dans un en-tête ; en-têtes CORS ;
  - **webhooks** : appels sortants en JSON à chaque changement des variables choisies (avec un
    espacement minimal) ou périodiques ;
  - journal des requêtes reçues et des appels de webhooks, avec leurs corps.
- **Client** : requêtes de toutes méthodes vers une adresse de base ou une URL complète
  (authentification, en-têtes communs, certificats non vérifiés acceptés sur demande), réponse
  lisible (code, durée, en-têtes, JSON indenté) et historique ; **surveillance** d'une valeur JSON
  (chemin comme `data.value`) interrogée périodiquement et publiée comme point ; avec une méthode
  d'écriture, le simulateur peut l'écrire. Les mots de passe, jetons et clés du client ne sont pas
  enregistrés.
- Défauts du simulateur : délai de réponse, absence de réponse, coupure de connexion, code HTTP forcé
  (toutes les requêtes ou celles qui concernent les variables choisies), valeurs figées.
