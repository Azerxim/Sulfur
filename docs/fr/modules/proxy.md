# Module Proxy TCP / UDP

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/proxy.md) · **Français**

Se place entre un client et un équipement réels pour observer leurs échanges et les perturber, sans
modifier ni l'un ni l'autre : le client se connecte au port local du proxy au lieu de l'équipement,
et le proxy relaie tout le trafic dans les deux sens.

- **Redirections** : autant que nécessaire, chacune en TCP ou en UDP, d'une adresse et d'un port
  locaux vers un hôte:port distant ; démarrées une par une ou toutes ensemble. Les adresses se
  modifient redirection arrêtée ; une redirection vers son propre port local est refusée.
  - **TCP** : une connexion vers l'équipement par connexion du client ; les données du client sont
    retenues jusqu'à ce que l'équipement accepte la connexion. Un équipement qui refuse la
    connexion est signalé dans le journal.
  - **UDP** : une session par adresse:port du client, avec son propre socket vers l'équipement, pour
    que les réponses reviennent au bon client ; fermée après 60 s sans datagramme.
- **Défauts sur le trafic**, propres à chaque redirection et modifiables à chaud :
  - latence et gigue (retard aléatoire de 0 à la valeur choisie), sans changer l'ordre des envois ;
  - perte de datagrammes (UDP seulement : en TCP, une perte rendrait le flux incohérent) ;
  - altération : un bit d'un octet pris au hasard est inversé dans la part choisie des envois ;
  - sens concerné : les deux, client → équipement ou équipement → client ;
  - blocage du trafic : données ignorées ; dans les deux sens, les nouvelles connexions sont aussi
    refusées ;
  - coupure immédiate de toutes les connexions en cours (sessions UDP comprises).
- **Connexions en cours** : client, heure de connexion et octets relayés dans chaque sens.
- **Journal** des échanges : données relayées en hexadécimal et en texte (1 024 premiers octets de
  chaque envoi), sens, connexion, défaut appliqué (bloqué, perdu, altéré, retard), connexions,
  coupures et erreurs ; filtrable par redirection, figeable, exportable en texte. La capture des
  données peut être désactivée pour un trafic important : seuls les événements sont alors
  enregistrés.
- **Simulateur** : compteurs publiés comme points de données (redirections démarrées, connexions,
  octets dans chaque sens, envois ignorés et altérés) ; défauts injectables sur toutes les
  redirections : retard, absence de réponse (données ignorées) et coupure (connexions coupées et
  refusées).
