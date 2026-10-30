# Module OPC UA

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/opcua.md) · **Français**

- **Serveur** : variables simulées (sinus, rampe, aléatoire, bascule, statique) exposées sous
  `Objects/<dossier racine>` avec des NodeId `ns=1;s=<dossier>.<variable>`. Endpoint par défaut :
  `opc.tcp://localhost:4840/UA/Sulfur`. Une variable String reçoit la valeur générée sous forme de texte.
  - **Tableaux** (taille fixe, éléments simulés avec un déphasage) et **types structurés**
    (ExtensionObject, champs `Nom:Type`, `[]` pour un tableau) ;
  - **méthodes** avec arguments d'entrée / sortie : écho, lecture / écriture des variables du même nom
    ou échec avec un code d'erreur choisi ;
  - **alarmes à seuils** (ExclusiveLimitAlarmType : très haut, haut, bas, très bas) acquittables, et
    émission d'**événements** à la demande ;
  - **historique** : les variables historisées conservent leurs 10 000 dernières valeurs (HistoryRead) ;
  - **import NodeSet2 XML** : les types et nœuds du fichier sont ajoutés à l'espace d'adressage ; les
    modèles compagnons requis fournis avec node-opcua (DI, Machinery…) sont chargés automatiquement.
    Les fichiers importés sont enregistrés avec la configuration.

  Variables, méthodes et alarmes se modifient serveur démarré ; les types structurés et les modèles
  importés sont chargés au démarrage.
- **Client** : connexion à n'importe quel serveur OPC UA, navigation dans l'espace d'adressage,
  lecture/écriture (y compris tableaux et structures, en JSON) et surveillance temps réel
  (abonnements), appel de méthodes, lecture d'historique, réception des événements et alarmes avec
  acquittement.
- **Sécurité** (serveur et client) :
  - modes `None`, `Sign`, `SignAndEncrypt` et politiques Basic256Sha256, Aes128-Sha256-RsaOaep,
    Aes256-Sha256-RsaPss (+ Basic256 / Basic128Rsa15 obsolètes) ;
  - authentification anonyme et/ou par identifiant / mot de passe (utilisateurs définis côté serveur) ;
    les mots de passe sont hachés (scrypt + sel) dès la saisie, seule l'empreinte est conservée ;
  - certificat du serveur `OPCUA@Sulfur` (généré au premier démarrage) ;
  - magasins de certificats séparés serveur / client, avec approbation des certificats rejetés depuis
    l'interface. Emplacement : `<userData>/modules/opcua/pki/{server,client}`
    (Linux : `~/.config/sulfur/…`, Windows : `%APPDATA%\sulfur\…`).
  - côté client, « Découvrir les endpoints » liste les couples mode / politique proposés par le serveur.
