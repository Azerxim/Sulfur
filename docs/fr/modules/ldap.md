# Module LDAP / RADIUS

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/ldap.md) · **Français**

Quatre onglets : serveur et client LDAP, serveur et client RADIUS.

## LDAP

- **Serveur** LDAP v3, **LDAPS par défaut** (port 1636 ; LDAP simple sur 1389 ; ports standards
  389 / 636 avec droits administrateur sous Linux) sur un annuaire de test en lecture seule, pour vérifier
  l'authentification centralisée de switchs, pare-feux, IHM ou applications :
  - annuaire saisi en **LDIF** (annuaire d'exemple avec utilisateurs et groupes), modifiable serveur
    démarré ; `userPassword` en clair ou haché ({SSHA}, {SHA}, {SSHA256}, {SSHA512}) ; `memberOf`
    déduit des groupes (`member`, `uniqueMember`) ;
  - liaison simple (DN et mot de passe) ou anonyme (désactivable), recherche avec portées base / un
    niveau / sous-arbre et filtres RFC 4515 (et, ou, non, égalité, sous-chaînes, ≥, ≤, présence),
    limite de taille, comparaison, rootDSE (contextes de nommage), opération étendue « Who am I » ;
    les mots de passe ne sont jamais renvoyés et les écritures sont refusées (unwillingToPerform) ;
  - **LDAPS** ou **StartTLS** avec le certificat auto-signé `LDAP@Sulfur`
    (`<userData>/modules/ldap/pki/own`) ;
  - journal des événements (liaisons et motif d'échec, recherches avec leur filtre) et compteurs ;
    défauts injectés par le simulateur (délai, absence de réponse, code de résultat forcé).
- **Client** (bibliothèque ldapts) : URL `ldap://` ou `ldaps://`, StartTLS, DN et mot de passe de
  liaison (mot de passe non enregistré), test d'authentification avec « Who am I », recherche (base,
  portée, filtre, attributs, limite) et historique.
- Le serveur implémente lui-même le codage BER et le protocole LDAP (la bibliothèque ldapjs a été
  abandonnée).

## RADIUS

- **Serveur** RADIUS sur UDP (RFC 2865, 2866), authentification sur le port 1812 et accounting sur
  le 1813 (sans droits administrateur), pour tester l'authentification centralisée de switchs,
  pare-feux, bornes Wi-Fi ou IHM :
  - **clients (NAS)** déclarés par adresse ou réseau CIDR avec leur secret partagé ; les requêtes
    des autres adresses sont ignorées ;
  - authentification **PAP** et **CHAP** des **comptes locaux** (mot de passe en clair, nécessaire
    à CHAP) et des **comptes de l'annuaire LDAP** de l'onglet Serveur LDAP (annuaire en marche ou
    celui enregistré, retrouvés par `uid` ou un autre attribut, vérifiés avec `userPassword` ; CHAP
    seulement avec un `userPassword` en clair) ; EAP n'est pas pris en charge ;
  - **attributs de la réponse** par compte (et pour les comptes de l'annuaire), un `Nom = valeur`
    par ligne : Service-Type, Session-Timeout, Filter-Id, Class, Framed-IP-Address,
    Reply-Message…, `Cisco-AVPair = shell:priv-lvl=15` ou `Vendor-Specific = <constructeur>:<type>:<valeur>` ;
  - **Message-Authenticator** (RFC 3579) vérifié s'il est présent et ajouté à toutes les réponses ;
    il peut être exigé dans les Access-Request (protection contre Blast-RADIUS) ;
  - **accounting** : Start / Interim-Update / Stop (authentificateur vérifié), sessions ouvertes
    listées, Accounting-On / Off ferment les sessions de l'équipement ; **Status-Server**
    (RFC 5997) sur les deux ports ;
  - une requête répétée reçoit la même réponse ; clients, comptes et attributs modifiables serveur
    démarré ; journal (acceptations avec les attributs renvoyés, refus avec leur motif, requêtes
    ignorées) et compteurs ; défauts injectés par le simulateur (délai, absence de réponse ; une
    réponse forcée est un Access-Reject).
- **Client** : serveur, ports, secret partagé, délai et renvois, NAS-Identifier / NAS-IP-Address,
  Access-Request PAP ou CHAP (mot de passe non enregistré) avec attributs supplémentaires,
  Status-Server, accounting Start / Interim-Update / Stop d'une session ; réponses vérifiées
  (authentificateur, Message-Authenticator), attributs décodés et historique.
- Le protocole RADIUS est implémenté dans le module (vérifié avec les exemples de la RFC 2865).
