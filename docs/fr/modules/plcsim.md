# Module PLCSim Advanced (Windows)

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/plcsim.md) · **Français**

Pilote les automates virtuels S7-1500 de **S7-PLCSIM Advanced** par son API Simulation Runtime
(assembly .NET `Siemens.Simatic.Simulation.Runtime.Api`), chargée par Windows PowerShell 5.1 dans un
processus d'arrière-plan : aucun module natif à compiler. Le dossier de l'API est détecté
automatiquement (version la plus récente dans
`C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\<version>`) ou indiqué dans le module.

- Connexion à l'API (éventuellement au démarrage de Sulfur) : version de l'API, disponibilité du
  Runtime Manager, mode réseau (Softbus ou TCP/IP).
- **PC distant** : connexion au Runtime Manager d'un autre PC (adresse IP ou nom, port ouvert dans le
  panneau de contrôle de PLCSIM Advanced, 50000 par défaut) ; les instances listées et pilotées sont
  alors celles de ce PC. La perte de connexion est signalée.
- **Sans PLCSIM Advanced installé** : le module demande le dossier qui contient les DLL de l'API
  (copiées depuis un PC où il est installé). L'API est une bibliothèque Windows native (C++/CLI) :
  elle ne peut pas être chargée sous Linux ni macOS, où le module reste indisponible.
- **Instances** : création (type de CPU), mise sous / hors tension, RUN / STOP, effacement général,
  suppression, adresse IP de chaque interface. Le programme se charge depuis TIA Portal.
- **Variables** : table des variables du programme chargé (filtre, tableaux développés), ou adresses
  des entrées, sorties et mémentos ; **surveillance** de plusieurs instances, écriture depuis la liste
  et publication comme points : un flux du simulateur peut piloter les entrées de l'automate virtuel
  pour simuler le procédé. Les variables surveillées sont conservées au redémarrage.
- Test sur l'API réelle : `SULFUR_PLCSIM_LIVE=1 npm test` (crée, met sous tension puis supprime une
  instance de test).
