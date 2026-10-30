# Module CoAP / LwM2M

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/coap.md) · **Français**

Protocoles des capteurs et objets connectés contraints, en complément de MQTT : CoAP (RFC 7252) sur UDP
et LwM2M (OMA), qui s'appuie sur CoAP pour gérer des appareils à distance. Quatre onglets.

- **Serveur CoAP** simulé (port 5683 par défaut) :
  - ressources simulées comme les topics MQTT (nombre, entier, booléen ou texte ; valeur fixe ou
    générée), servies en texte ou en JSON `{ "value": …, "timestamp": … }` ;
  - lecture (GET), modification (PUT) des ressources qui l'autorisent, réponse 4.04, 4.05, 4.06 ou
    4.15 sinon ;
  - observation (RFC 7641) : notifications confirmables, au plus toutes les N ms par ressource ;
    un observateur qui refuse une notification (RST) ou ne l'acquitte plus est oublié ;
  - découverte par `/.well-known/core` (RFC 6690) ;
  - ressources modifiables serveur démarré ; défauts injectés par le simulateur (délai, absence de
    réponse, code de réponse forcé) ; journal des requêtes.
- **Client CoAP** : requêtes GET / POST / PUT / DELETE, confirmables (retransmises jusqu'à
  l'acquittement) ou non, avec paramètres (Uri-Query), format du contenu et format demandé
  (Accept) ; découverte des ressources d'un serveur, observation avec ses notifications ;
  historique des échanges (code, format, temps de réponse, contenu).
- **Serveur LwM2M** (port 5690 par défaut, pour pouvoir lancer aussi le serveur CoAP ; 5683 convient
  s'il est libre) :
  - interface d'enregistrement : enregistrement (`POST /rd`), mise à jour, désenregistrement,
    expiration d'un enregistrement non mis à jour ; objets annoncés par chaque appareil ;
  - opérations sur un appareil enregistré : lecture (TLV, SenML JSON ou texte), écriture, exécution,
    découverte et observation ; valeurs décodées et nommées pour les objets connus (Device,
    Temperature, Light Control…).
- **Appareil LwM2M** simulé : s'enregistre auprès d'un serveur LwM2M (celui de Sulfur ou un autre),
  met son enregistrement à jour avant son expiration et se réenregistre au besoin ; objets Device (3),
  Temperature (3303, température simulée, minimum et maximum mesurés) et Light Control (3311) ;
  lecture en texte, TLV ou SenML JSON, écriture, exécution (redémarrage, remise à zéro du minimum et
  du maximum), observation.
- **Points de données** : ressources du serveur CoAP (modifiables), requêtes reçues, appareils
  enregistrés, température et éclairage de l'appareil simulé.

Non pris en charge pour l'instant : CoAP sur DTLS (`coaps`), transfert par blocs (RFC 7959) et
bootstrap LwM2M.
