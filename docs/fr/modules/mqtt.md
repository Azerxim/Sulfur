# Module MQTT

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/mqtt.md) · **Français**

- **Broker** (MQTT 3.1, 3.1.1 et 5.0, port par défaut 1883 ; TLS sur 8883 avec un certificat
  auto-signé `MQTT@Sulfur` généré au premier démarrage) : sessions persistantes et expiration de
  session, QoS 0 / 1 / 2, messages retenus, dernière volonté (avec délai en 5.0), alias de topic,
  options d'abonnement 5.0 (no local, retain as published, retain handling, identifiants
  d'abonnement) et propriétés des messages transmises aux clients 5.0 ; abonnements partagés et
  authentification étendue non pris en charge. **topics simulés** publiés par le broker
  lui-même (valeur nombre, entier, booléen ou texte ; générateur sinus, rampe, aléatoire ou
  bascule), périodiquement ou à chaque changement, en valeur seule ou en JSON
  `{"value": …, "timestamp": …}`, avec QoS et indicateur « retenu » choisis. Un topic modifiable
  accepte une nouvelle valeur publiée sur `<topic>/set`. Authentification facultative (utilisateurs
  avec mots de passe hachés ; les connexions anonymes peuvent être refusées). Liste des clients
  connectés et de leurs abonnements, explorateur de topics (dernier contenu de chaque topic), journal
  des messages avec filtre de topic (jokers `+` et `#`) et événements de connexion.
- **Client** (mqtt.js, MQTT 3.1, 3.1.1 ou 5.0, TCP ou TLS) : identifiant, utilisateur, session
  propre, keep alive, reconnexion automatique, message de dernière volonté ; abonnements avec QoS et
  champ JSON facultatif (`value`, `data.temp`…) dont la dernière valeur est affichée ; publication
  (topic, contenu, QoS, retenu) ; journal des messages reçus.
- Points pour le simulateur et les courbes : topics simulés (modifiables : publie la nouvelle
  valeur), nombres de clients et de messages du broker ; dernière valeur de chaque abonnement du
  client (un abonnement sans joker est modifiable : la valeur est publiée sur son topic).
- Défauts du simulateur : délai (publications reçues), absence de réponse (CONNECT sans réponse,
  messages plus distribués), coupure (clients déconnectés et refusés), valeurs figées.
