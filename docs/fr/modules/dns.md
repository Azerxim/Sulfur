# Module DNS

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/dns.md) · **Français**

- **Serveur** faisant autorité sur un domaine de test, en UDP et TCP (port 1053 par défaut, port
  standard 53 avec droits administrateur sous Linux) :
  - enregistrements A, AAAA, CNAME, MX, TXT, SRV, PTR, NS, modifiables serveur démarré ; noms
    relatifs rattachés au domaine, `@` pour le domaine, jokers `*.nom` ; enregistrement SOA généré au
    sommet de la zone et enregistrements inverses (PTR) déduits des A / AAAA ;
  - chaînes de CNAME suivies dans la zone, NXDOMAIN (avec SOA) pour un nom inconnu de la zone,
    réponse vide pour un nom sans enregistrement du type demandé, troncature (TC) des réponses UDP
    plus grandes que la taille acceptée par le client (EDNS) ;
  - noms hors zone relayés vers des serveurs amont, ou refusés (REFUSED) ;
  - journal des requêtes reçues (client, nom, type, réponse, réponses) et compteurs ; défauts
    injectés par le simulateur (délai, absence de réponse, SERVFAIL / NXDOMAIN / REFUSED forcé).
- **Client** : requête de tout type (ANY compris) en UDP ou TCP (nouvel essai automatique en TCP si
  la réponse est tronquée), indicateur de récursion, PTR à partir d'une adresse IP ; code de réponse,
  indicateurs, sections réponse, autorité et additionnelle avec leur TTL, durée et historique.
