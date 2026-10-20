export default {
  explorer: {
    name: 'Explorateur réseau',
    description: 'Recherche et identification des équipements industriels et informatiques du réseau',
    targets: {
      title: 'Cibles',
      label: 'Adresses, réseaux ou noms d’hôte',
      local: 'Réseaux privés de ce PC :',
      noLocal: 'aucun',
      hint: 'Réseaux privés uniquement ({networks}). Exemples : 192.168.1.0/24, 10.0.0.10-50, automate1.local — {max} adresses au maximum.',
      later: 'La recherche et l’identification des équipements de ces adresses sont prévues dans une prochaine version.'
    },
    preview: {
      title: 'Adresses ({count})',
      range: 'De {first} à {last}',
      more: '… et {count} de plus',
      empty: 'Saisissez une cible pour voir les adresses qu’elle désigne.'
    },
    errors: {
      noTarget: 'Saisissez au moins une adresse, un réseau ou un nom d’hôte',
      tooManyHosts: 'Trop d’adresses : {max} au maximum',
      invalidTarget: 'Cible invalide : {value}',
      ipv6: 'Les adresses IPv6 ne sont pas prises en charge : {value}',
      unknownHost: 'Nom d’hôte inconnu : {value}',
      notPrivate: 'Cible hors des réseaux privés refusée : {value} (réseaux autorisés : {networks})'
    }
  }
}
