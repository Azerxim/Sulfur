# Module Explorateur réseau

[Documentation](../README.md) · [Tous les modules](../README.md#modules) · [English](../../en/modules/explorer.md) · **Français**

Prépare l'exploration d'un réseau de test, **limitée aux réseaux privés** (RFC 1918) :
10.0.0.0/8, 172.16.0.0/12 et 192.168.0.0/16.

- **Cibles** : adresses (`192.168.1.10`), réseaux CIDR (`192.168.1.0/24`, sans les adresses de
  réseau et de diffusion), plages (`10.0.0.10-50` ou `10.0.0.10-10.0.0.50`) et noms d'hôte, séparés
  par des virgules, des espaces ou des retours à la ligne ; 4 096 adresses au maximum. Le process
  principal vérifie chaque saisie : une saisie qui sort des réseaux privés, même en partie, est
  refusée en entier, tout comme un nom d'hôte qui se résout en dehors (`localhost` compris).
- Les réseaux privés du PC sont proposés (limités à leur /24) ; les adresses désignées par la
  saisie sont listées au fil de la frappe.
- La recherche et l'identification des équipements de ces adresses sont prévues dans une prochaine
  version (voir la [roadmap](../../../ROADMAP.fr.md#plus-tard)).
