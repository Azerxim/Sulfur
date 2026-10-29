# Module NTP

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/ntp.md) · **Français**

- **Serveur** (UDP, port par défaut 1123 ; le port standard 123 demande des droits administrateur
  sous Linux) : répond aux requêtes client NTP v1 à v4 avec une **horloge simulée** : décalage par
  rapport à l'heure réelle (sauts de ±1 min à ±1 an en un clic) ou heure de départ fixée, dérive en
  ppm ; strate (1 à 16), indicateur de seconde intercalaire, identifiant de référence et précision
  annoncés. Tout s'applique à chaud. Utile pour tester l'horodatage des équipements et la validité
  de leurs certificats. Liste des clients récents et journal.
- **Client** : interrogation unique ou périodique d'un serveur ; écart d'horloge, délai aller-retour,
  strate, indicateur de seconde intercalaire, référence, précision, délai et dispersion racine ;
  historique. Une réponse dont le champ Origin ne correspond pas à la requête est ignorée.
- Points pour le simulateur et les courbes : heure du serveur, décalage (modifiable : un flux peut
  provoquer des sauts d'heure), dérive, strate et indicateur de seconde intercalaire (modifiables),
  nombre de requêtes ; écart, délai et strate mesurés par le client.
- Défauts du simulateur : délai (latence réseau simulée, comptée dans le délai aller-retour),
  absence de réponse, Kiss-o'-Death (DENY, RSTR, RATE), horloge figée.
