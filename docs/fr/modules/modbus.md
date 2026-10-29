# Module Modbus

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/modbus.md) · **Français**

- **Transports** : Modbus TCP (en-tête MBAP), Modbus/TCP Security (TLS), **RTU over TCP** (trames RTU
  avec CRC dans une connexion TCP, comme celles des passerelles série / Ethernet en mode
  transparent), et **Modbus RTU** / **Modbus ASCII** sur liaison série (port RS-232 / RS-485,
  vitesse, bits de données, parité, bits de stop ; ports détectés listés). Les ports série passent
  par la bibliothèque `serialport`.
  - Sur une liaison série et en RTU over TCP, les Unit ID vont de 1 à 247 : le serveur ignore les
    requêtes destinées à un autre Unit ID, comme sur un bus partagé, et applique les écritures en
    diffusion (Unit ID 0) à tous les équipements sans répondre. Le client envoie une requête à la
    fois et respecte le silence de 3,5 caractères entre les trames ; le Unit ID 0 envoie des
    écritures en diffusion.
  - Les trames RTU sont délimitées par le code fonction (et le nombre d'octets annoncé), puis par un
    silence pour une fonction inconnue ; les trames invalides (CRC, LRC, parasites) sont comptées
    dans le journal du serveur. Une erreur de CRC ferme une connexion RTU over TCP ; sur une liaison
    série, le lecteur se resynchronise.
- **Serveur** : les quatre tables (coils, discrete inputs, input registers, holding registers),
  fonctions 1 à 6, 15, 16, 23 (lecture / écriture multiple) et 43 / 14 (identification de
  l'équipement). Points simulés typés (Boolean, UInt16/Int16, UInt32/Int32, Float32, Float64, ordre
  des mots ABCD / CDAB / BADC / DCBA), modifiables serveur démarré. Liste des clients connectés (ou
  du port série ouvert) et journal des événements de sécurité.
  - **Plusieurs équipements** sur un même serveur (simulation de passerelle) : chacun répond à son
    Unit ID avec sa propre mémoire, ses points et son identification ; un Unit ID non configuré
    reçoit l'exception 0B, ou est servi par le premier équipement si l'option est cochée.
    Équipements ajoutés, modifiés ou retirés serveur démarré.
  - **Identification** (fonction 43 / 14) : objets 00 à 06 (fabricant, code produit, révision, URL,
    produit, modèle, application) par équipement ; lecture basique, régulière (par flux, réponses
    découpées si besoin) et par objet ; niveau de conformité 0x82.
  - **Explorateur de registres** : mémoire brute d'un équipement par pages (UInt16, Int16,
    hexadécimal, binaire, bits), rafraîchie en continu ; les adresses occupées par un point sont
    repérées et chaque valeur est modifiable.
- **Client** : lecture / écriture de toutes les tables avec décodage (UInt16 → Float64, hexadécimal,
  binaire), écriture puis lecture en une requête (fonction 23), lecture de l'identification de
  l'équipement et surveillance périodique.
- **Sécurité** :
  - **Modbus/TCP Security** (TLS ≥ 1.2, port standard 802) avec authentification mutuelle par
    certificats X.509 épinglés (magasins approuvés / rejetés, approbation depuis l'interface) ;
  - **autorisation par rôle** : rôle lu dans le certificat client (extension
    `1.3.6.1.4.1.50316.802.1`), droits lecture / écriture par rôle, rôle par défaut ou refus ;
  - liste blanche d'adresses IP (CIDR), nombre maximal de connexions, limite de requêtes par
    seconde (exception 06), mode lecture seule, points protégés en écriture, filtrage du Unit ID
    (exception 11), fermeture des connexions envoyant des trames invalides (transports TCP) ;
  - certificat serveur `MODBUS@Sulfur`, certificat client régénéré avec le rôle choisi ;
    emplacement : `<userData>/modules/modbus/pki/{server,client}`.
- Ports par défaut 5020 (TCP) / 8020 (TLS) : les ports standards 502 / 802 nécessitent des droits
  administrateur sous Linux.
