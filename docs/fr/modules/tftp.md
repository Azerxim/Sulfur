# Module TFTP

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/tftp.md) · **Français**

- **Serveur** TFTP (port 6969 par défaut) servant un dossier, pour tester les téléchargements de
  firmware et les sauvegardes de configuration des équipements réseau :
  - modes octet et netascii, options blksize, tsize et timeout (RFC 2347 à 2349), retour à zéro du
    numéro de bloc au-delà de 65535 blocs ;
  - envois autorisés ou non, fichiers existants remplacés ou non ; fichiers écrits d'un bloc avant
    le dernier acquittement ; chemins confinés au dossier servi ;
  - délai d'attente, retransmissions et taille de bloc maximale modifiables serveur démarré ;
    journal des transferts (taille, débit, retransmissions) ; défauts injectés par le simulateur
    (délai, absence de réponse, erreur forcée).
- **Client** : téléchargement (GET) et envoi (PUT) avec choix du fichier, négociation de la taille
  de bloc et de la taille du fichier, progression, interruption et historique.
