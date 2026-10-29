# Module Autorité de certification

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/ca.md) · **Français**

PKI de test pour équiper un banc sans OpenSSL : certificats pour OPC UA, Modbus/TCP Security, MQTT,
HTTPS, Syslog TLS, ou pour des équipements réels.

- **Autorités** : racine auto-signée, ou intermédiaire signée par une racine (longueur de chemin 0) ;
  clés ECDSA P-256 / P-384 ou RSA 2048 à 4096. Import d'une autorité existante (certificat + clé
  privée, PEM ou DER, clé chiffrée avec son mot de passe).
- **Émission** avec une nouvelle clé, par profil : serveur TLS, client TLS, serveur et client,
  **application OPC UA** (URI d'application obligatoire, usages de clé exigés par les politiques de
  sécurité OPC UA) et **Modbus/TCP Security** (rôle du client dans l'extension
  `1.3.6.1.4.1.50316.802.1`, lu par le serveur Modbus). Noms alternatifs DNS, IP et URI (noms de ce
  PC ajoutés en un clic) ; validité bornée par celle de l'autorité.
- **Signature d'une demande (CSR PKCS#10)** générée par un équipement : sujet, clé et noms
  alternatifs de la demande (complétés par ceux saisis) ; la clé privée reste sur l'équipement.
- **Révocation** avec motif et **liste de révocation** (CRL v2 avec numéro de CRL, valable 30 jours,
  régénérée à chaque révocation ou à la demande).
- **Export** : certificat (PEM, DER), certificat et chaîne jusqu'à la racine (PEM), clé privée (PEM
  PKCS#8), **PKCS#12** (.p12 / .pfx) protégé par mot de passe avec les paramètres d'OpenSSL 3
  (PBES2 AES-256-CBC / PBKDF2-SHA256, HMAC-SHA256), CRL (PEM, DER). Détail de chaque certificat
  (champs décodés, empreintes SHA-256 / SHA-1, PEM à copier).
- Stockage : `<userData>/modules/ca/authorities/<id>` (clés privées en droits 600). Les autorités ne
  font pas partie de la configuration exportée.
