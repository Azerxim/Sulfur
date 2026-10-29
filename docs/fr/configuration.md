# Configurations enregistrées

[Documentation](README.md) · [English](../en/configuration.md) · **Français**

## Ce qui est enregistré

Les réglages des serveurs et clients de chaque module (port, sécurité, variables et points, endpoint,
requête préparée…) sont enregistrés au fil des modifications et restaurés au lancement suivant. Les
serveurs ne sont **pas** démarrés automatiquement.

Chaque module a son propre fichier, `<userData>/modules/<id>/config.json` (voir
[Emplacement des données](getting-started.md#emplacement-des-données)), organisé en **sections** :

```json
{
  "server": { "port": 5020, "points": [ … ] },
  "client": { "host": "127.0.0.1", "port": 5020 }
}
```

Le fichier est écrit de façon synchrone et atomique (fichier temporaire puis renommage) : une
modification n'est pas perdue si l'application se ferme juste après, et le fichier n'est jamais à moitié
écrit.

Les secrets restent hors de ces fichiers : les mots de passe, jetons et clés des clients (OPC UA, HTTP,
LDAP, RADIUS, FTP / SFTP…) ne sont pas enregistrés, et les mots de passe des utilisateurs des serveurs ne
sont conservés que sous forme d'empreinte scrypt.

## Dans un module

Dans l'interface d'un module, `usePersistentState` (SDK, `/ui`) remplace `useState` :

```jsx
const [server, setServer] = usePersistentState('modbus', 'server', DEFAULT_SERVER, {
  persist: ({ password, ...rest }) => rest // facultatif : ce qui est réellement enregistré
})
```

- la valeur enregistrée est **complétée par les valeurs par défaut** (`withDefaults`) : les clés absentes
  reprennent leur valeur par défaut, les objets sont complétés récursivement, les tableaux enregistrés
  remplacent ceux par défaut. Un réglage ajouté dans une version ultérieure garde donc sa valeur par
  défaut ;
- les modifications sont enregistrées 300 ms après la dernière saisie, et immédiatement à la fermeture
  de la fenêtre ;
- toutes les configurations sont chargées une fois avant le premier rendu : les panneaux s'ouvrent sans
  attente.

Dans le process principal, `ctx.config()` lit la configuration et `ctx.setConfig(section, value)`
remplace une section, pour un état propre au process principal (par exemple les flux déployés du
simulateur).

### Migrations

Un module peut exporter `migrateConfig(config)` dans sa partie main. Cette fonction convertit une
configuration écrite par une version antérieure, au chargement comme à l'import. Exemple : le simulateur
convertit en flux les scénarios des versions précédentes.

### Réinitialisation

Si l'interface d'un module ne peut pas s'afficher (configuration incohérente par exemple), sa page
d'erreur propose un bouton qui rétablit la configuration par défaut (`<id>:config:reset`).

## Import / export

*Paramètres → Général → Configurations* exporte la configuration de tous les modules dans un seul fichier
JSON, pour partager ou archiver un banc de test :

```json
{
  "format": "sulfur-config",
  "version": 1,
  "appVersion": "0.4.0",
  "exportedAt": "2026-10-29T10:00:00.000Z",
  "modules": {
    "opcua": { "server": { … } },
    "modbus": { "client": { … } }
  }
}
```

L'import d'un fichier :

- remplace la configuration des modules présents dans le fichier, après leur `migrateConfig` ;
- **conserve les sections des modules non chargés** (module externe non installé ou non chargé, module
  d'une autre version de Sulfur) dans leur `config.json`, et les liste : le module les retrouve une fois
  installé et chargé, et l'export suivant les inclut à nouveau ;
- ignore et liste les sections inutilisables (identifiant invalide ou réservé, contenu qui n'est pas un
  objet) ;
- est **refusé tant qu'un serveur tourne ou qu'un client est connecté** : un module le signale par
  `busy()` dans sa partie main.

Un fichier d'un autre `format`, un JSON invalide ou une `version` plus récente est refusé avec un message
explicite.

## Préférences de l'application

Les préférences qui ne dépendent pas d'un module sont conservées par le process principal dans
`<userData>/preferences.json` : langue, thème, modules désactivés, chargement des modules externes et
mises à jour automatiques. Elles ne font pas partie de la configuration exportée.
