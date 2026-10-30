# Module FTP / SFTP

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/ftp.md) · **Français**

Un seul module pour les deux protocoles de transfert de fichiers, en quatre onglets (serveur et
client FTP, serveur et client SFTP). Les deux serveurs servent par défaut le même dossier
(`<userData>/modules/ftp/files`) et peuvent fonctionner en même temps ; les défauts du simulateur
s'appliquent aux deux. Le module s'ouvre sur l'onglet du serveur SFTP.

## FTP / FTPS

- **Serveur** FTP (port 2121 par défaut) servant un dossier, pour tester les sauvegardes, recettes et
  journaux d'automates :
  - FTP en clair, FTPS explicite (AUTH TLS, exigé au choix) ou FTPS implicite, avec le certificat
    auto-signé du serveur ;
  - mode passif (plage de ports et adresse annoncée configurables) et mode actif, qui ne se
    connecte qu'à l'adresse du client ; reprise (REST), ajout, MLSD / MLST, SIZE, MDTM, types
    ASCII et binaire ;
  - utilisateurs authentifiés par mot de passe (seule l'empreinte scrypt est conservée),
    utilisateurs en lecture seule, connexion anonyme facultative en lecture seule ; clients
    confinés au dossier servi, liens symboliques compris ;
  - journal des connexions et des transferts, journal des commandes facultatif (mots de passe
    masqués) ; compteurs ; défauts injectés par le simulateur (délai, absence de réponse, coupure,
    réponse forcée sur les transferts).
- **Client** (bibliothèque basic-ftp, mode passif) : FTP en clair ou FTPS, vérification facultative
  du certificat, navigation dans les dossiers, transferts, création de dossier, renommage,
  suppression et affichage du dialogue de commandes. Le mot de passe n'est pas enregistré.

## SFTP

- **Serveur** SFTP (bibliothèque ssh2, port 2222 par défaut) servant un dossier, pour tester les
  mises à jour de firmware et les sauvegardes de configuration des équipements :
  - sous-système SFTP uniquement (ni shell ni commande) ; clients confinés au dossier servi, liens
    symboliques compris ;
  - utilisateurs authentifiés par mot de passe (seule l'empreinte scrypt est conservée) et/ou par
    clés publiques autorisées (format OpenSSH), utilisateurs en lecture seule ; utilisateurs
    modifiables serveur démarré ;
  - clé d'hôte Ed25519 générée au premier démarrage (`<userData>/modules/ftp/hostkey`), empreinte
    SHA256 affichée pour la vérifier ou l'épingler sur les clients ;
  - journal des connexions, transferts (chemin et taille), créations de dossiers, suppressions et
    renommages ; compteurs ; défauts injectés par le simulateur (délai, coupure de connexion).
- **Client** : mot de passe ou clé privée (OpenSSH / PEM, phrase secrète), empreinte attendue de la
  clé d'hôte (connexion refusée si elle a changé), navigation dans les dossiers, téléchargement et
  envoi avec choix du fichier, création de dossier, renommage et suppression. Mots de passe et clés
  ne sont pas enregistrés.
