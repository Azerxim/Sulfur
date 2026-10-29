# Module DHCP

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/dhcp.md) · **Français**

Serveur DHCP de test pour un **réseau isolé, limité aux réseaux privés** (10.0.0.0/8,
172.16.0.0/12, 192.168.0.0/16), pour mettre en service des équipements sur un banc.

- **Serveur** (RFC 2131, ports 67 / 68), avec des garde-fous :
  - **arrêté par défaut**, jamais démarré automatiquement (ni au lancement, ni par une
    configuration importée) ; chaque démarrage affiche un **avertissement** à confirmer (le process
    principal refuse un démarrage sans cette confirmation) ;
  - **interface choisie explicitement** (aucune par défaut, jamais 0.0.0.0) : son sous-réseau doit
    être entièrement privé. Le serveur émet depuis l'adresse de cette interface, ses réponses
    diffusées ne sortent donc que par elle ; sous Linux et macOS, il écoute aussi 255.255.255.255
    pour recevoir les diffusions des clients sans adresse ;
  - **plage contrôlée** par rapport au sous-réseau de l'interface (adresses d'hôte seulement, adresse
    du serveur exclue, 256 adresses au maximum) ; passerelle dans le sous-réseau, serveurs DNS
    annoncés privés ;
  - option **répondre seulement aux adresses MAC listées** ; les requêtes transmises par un relais
    (giaddr) sont ignorées ;
  - **journal** de toutes les requêtes, offres, attributions (ACK), refus (NAK), libérations et
    conflits (DECLINE), écrit aussi dans `<userData>/modules/dhcp/logs/server.log` ; tableau des
    baux (offerts, attribués, refusés) avec leur échéance.
- **Client** : sur une interface à adresse privée, avec l'adresse MAC de l'interface ou une autre
  (bouton aléatoire, adresse administrée localement) : DISCOVER (liste les offres de tous les
  serveurs), bail complet (DISCOVER, OFFER, REQUEST, ACK) et RELEASE. Il ne modifie jamais la
  configuration de l'interface ; les offres hors des réseaux privés sont ignorées.
- Sous Linux, les ports 67 et 68 demandent les droits administrateur ou la capacité
  `CAP_NET_BIND_SERVICE`. Node.js ne permet pas de lier un socket à une interface : sous Linux et
  macOS, les diffusions des autres interfaces parviennent au serveur (et à son journal), mais ses
  réponses ne partent que par l'interface choisie ; activez le filtre MAC sur un PC relié à
  plusieurs réseaux.
