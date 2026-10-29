# Module SNMP

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/snmp.md) · **Français**

- **Agent** (net-snmp, UDP, port par défaut 1161 ; le port standard 161 demande des droits
  administrateur sous Linux) : SNMPv1, v2c et v3. Communauté en lecture et communauté en lecture /
  écriture, utilisateurs SNMPv3 (USM : authentification MD5 ou SHA-1 / SHA-2, chiffrement DES ou
  AES), identifiant de moteur choisi ou généré. Groupe système de la MIB-II (sysDescr, sysObjectID,
  sysUpTime, sysContact, sysName, sysLocation, sysServices) et **objets simulés** (Integer,
  Counter32, Gauge32, TimeTicks, OctetString, IpAddress, OID ; générateur sinus, rampe, aléatoire
  ou bascule), modifiables par SetRequest s'ils sont déclarés en écriture. Requêtes Get, GetNext,
  GetBulk et Set, journal des requêtes.
- **Notifications** : l'agent envoie une notification (OID choisi, objets choisis joints) à des
  destinataires en SNMPv1 (trap), SNMPv2c ou SNMPv3 (trap ou inform acquitté) ; une notification
  SNMPv3 utilise l'un des utilisateurs de l'agent et l'identifiant de moteur de l'agent.
- **Manager** : requêtes Get, GetNext, GetBulk, Walk et Set en v1, v2c ou v3 (plusieurs OID à la
  fois, valeurs typées pour Set) ; OID surveillés lus périodiquement ; **récepteur de
  notifications** (port par défaut 1162 ; toutes les communautés acceptées, traps et informs SNMPv3 avec
  l'utilisateur du manager) avec la liste des traps et informs reçus.
- Points pour le simulateur et les courbes : objets simulés (modifiables), nombre de requêtes,
  notifications envoyées (l'écrire envoie la notification) ; OID surveillés (modifiables : envoie un
  SetRequest avec le type de la dernière lecture), notifications reçues.
- Défauts du simulateur : délai, absence de réponse, erreur forcée (genErr, tooBig, noSuchName,
  badValue, noAccess, resourceUnavailable, authorizationError — sur toutes les requêtes, les
  lectures ou les écritures), valeurs figées.
