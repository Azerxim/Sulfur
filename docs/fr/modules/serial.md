# Module Terminal série

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/serial.md) · **Français**

Dialogue avec un équipement sur une liaison RS-232 ou RS-485 (adaptateur USB, port intégré), pour
le tester ou observer ce qu'il envoie.

- **Port** : ports détectés proposés (saisie libre acceptée), vitesse, 5 à 8 bits de données, parité
  (aucune, paire, impaire, marque, espace), 1, 1,5 (Windows uniquement) ou 2 bits de stop, contrôle
  de flux matériel (RTS / CTS) ou logiciel (XON / XOFF). Le RS-485 demande un adaptateur qui commute
  seul le sens d'émission, comme la plupart des adaptateurs USB. Un port déjà utilisé par une autre
  application, ou par le module Modbus, est refusé.
- **Lignes de contrôle** : DTR et RTS positionnés à l'ouverture et commutés port ouvert, CTS, DSR et
  DCD lus toutes les 250 ms, BREAK (ligne TX maintenue à l'état bas pendant 250 ms).
- **Envoi** : texte (UTF-8, avec les séquences `\r`, `\n`, `\t`, `\0`, `\e`, `\\` et `\xNN`)
  suivi de la fin de ligne choisie, ou octets en hexadécimal (`01 03 00 00 00 0A`, `01030000000A` ou
  `0x01, 0x03…`) ; aperçu des octets, historique des 20 dernières saisies, envoi en continu
  (10 ms minimum).
- **Journal** des échanges (5 000 entrées) : octets reçus regroupés en trames après un silence
  (20 ms par défaut) et au choix à chaque fin de ligne, trames envoyées avec leur origine (client de
  la passerelle, point de données) ; affichage hexadécimal et / ou texte (caractères de contrôle
  écrits `\r`, `\xNN`…), heure à la milliseconde, pause, export dans un fichier texte ; compteurs
  d'octets et de trames.
- **Passerelle série ↔ TCP** : serveur TCP brut (port 4001 par défaut, comme ser2net ou un serveur
  de ports série en mode serveur TCP) qui relaie le port série vers ses clients (un par défaut,
  jusqu'à 16) : ce qu'ils envoient est écrit sur le port, ce que reçoit le port est envoyé à tous les
  clients. Les échanges apparaissent dans le journal ; la passerelle s'arrête avec le port.
- **Points de données** pour le simulateur et les courbes : port ouvert, compteurs, dernière trame
  reçue (texte et hexadécimal), lignes de contrôle ; écrire `send text`, `send hex`, `DTR` ou `RTS`
  depuis un flux envoie des données ou commute une ligne.
