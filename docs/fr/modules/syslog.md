# Module Syslog

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/syslog.md) · **Français**

- **Serveur** : reçoit les messages Syslog en UDP et TCP (port par défaut 1514 ; le port standard
  514 demande des droits administrateur sous Linux) et TLS (port 6514, certificat auto-signé
  `Syslog@Sulfur`). En TCP / TLS, chaque message est lu selon sa propre délimitation (RFC 6587) :
  longueur en tête (octet counting) ou fin de ligne. Les messages sont analysés au format RFC 5424
  (horodatage, hôte, application, processus, identifiant, données structurées) ou RFC 3164 (BSD),
  en texte libre sinon ; les 2 000 derniers sont conservés. Compteurs par gravité, filtre par gravité
  minimale et par texte, détail de chaque message (données structurées, message brut), pause de
  l'affichage.
- **Émetteur** : messages au format RFC 5424 ou RFC 3164 en UDP, TCP (longueur en tête ou fin de
  ligne) ou TLS ; facilité, gravité, nom d'hôte, application, processus, identifiant, données
  structurées ; texte avec `{n}` (numéro du message) et `{time}` ; rafale de plusieurs messages par
  envoi, envoi périodique, aperçu du message brut, historique.
- Points pour le simulateur et les courbes : nombre de messages, erreurs (gravité ≤ 3), dernière
  gravité et dernier message reçus, connexions ouvertes ; messages envoyés, et un point
  `send message` : écrire un texte envoie un message avec les réglages de l'émetteur.
- Défaut du simulateur : coupure (connexions TCP / TLS fermées et refusées).
