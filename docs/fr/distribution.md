# Signer les installeurs et publier Sulfur sur les stores

[Documentation](README.md) · [English](../en/distribution.md) · **Français**

Aujourd'hui, la CI produit des installeurs **non signés** (`CSC_IDENTITY_AUTO_DISCOVERY: 'false'`
dans `.github/workflows/ci.yml`) et les joint à une release GitHub. Conséquences :

- Windows affiche l'avertissement SmartScreen « Windows a protégé votre ordinateur » ;
- macOS bloque le premier lancement (clic droit → *Ouvrir*, ou `xattr -cr`) et Squirrel.Mac refuse
  d'installer les mises à jour : `src/main/updater.js` se contente de signaler la nouvelle version.

Ce document décrit comment **signer** les paquets Windows et macOS, puis comment publier Sulfur sur
le **Microsoft Store**, le **Mac App Store**, **Flathub** (Flatpak) et le **Snap Store**. Les règles
des éditeurs changent souvent : vérifiez les pages citées dans [Sources](#sources) avant de vous
engager.

## Vue d'ensemble

| Canal               | Compte                          | Coût (oct. 2026)             | Signature                                  | Mises à jour            |
| ------------------- | ------------------------------- | ---------------------------- | ------------------------------------------ | ----------------------- |
| Installeur Windows  | Azure ou autorité de certification | ~10 $/mois (Artifact Signing) ou certificat OV / EV | Authenticode (la vôtre)            | electron-updater        |
| DMG / zip macOS     | Apple Developer Program          | 99 $/an                      | Developer ID + notarisation                | electron-updater        |
| Microsoft Store     | Partner Center                   | gratuit                      | MSIX signé par Microsoft                   | le Store                |
| Mac App Store       | Apple Developer Program (le même) | compris                     | Apple Distribution + bac à sable           | le Store                |
| Flathub             | compte GitHub                    | gratuit                      | dépôt Flathub (construit depuis les sources) | Flathub              |
| Snap Store          | compte Ubuntu One                | gratuit                      | Snap Store                                 | snapd                   |

Dans les quatre stores, c'est le store qui met l'application à jour : l'updater intégré doit être
désactivé (voir [Mises à jour selon le canal](#mises-à-jour-selon-le-canal)).

## 1. Signer l'installeur Windows

Depuis 2023, la clé privée d'un certificat de signature de code doit être conservée dans un module
matériel (HSM, jeton USB ou HSM cloud) : on ne peut plus signer en CI avec un simple fichier `.pfx`.
Depuis le 1er mars 2026, un certificat de signature de code (OV ou EV) dure **460 jours au plus**.
Deux solutions :

### Option A — Azure Artifact Signing (recommandée)

Service géré de Microsoft (anciennement *Trusted Signing*) : pas de certificat à acheter ni de HSM à
gérer, certificats renouvelés automatiquement, signatures reconnues par SmartScreen. Formule Basic
autour de 10 $/mois (5 000 signatures). Vérifiez l'éligibilité (organisation ou développeur
individuel, pays) sur la page du service.

1. Dans Azure : créer un compte Artifact Signing, valider l'identité (nom affiché dans la signature),
   créer un profil de certificat *Public Trust*.
2. Créer une inscription d'application (Entra ID) avec un secret, et lui donner le rôle
   *Trusted Signing Certificate Profile Signer* sur le compte.
3. Dans `electron-builder.yml` (option encore marquée *beta* par electron-builder) :

   ```yaml
   win:
     target: nsis
     icon: resources/icon.ico
     azureSignOptions:
       publisherName: Maxime MALLET # exactement le CN du certificat
       endpoint: https://weu.codesigning.azure.net # région du compte
       codeSigningAccountName: sulfur-signing
       certificateProfileName: sulfur-public
   ```

4. Secrets GitHub du job Windows : `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   (lus directement par le module PowerShell de signature, pas par electron-builder).

### Option B — Certificat OV ou EV d'une autorité de certification

Certificat acheté chez une autorité (DigiCert, Sectigo, SSL.com, GlobalSign…), livré sur jeton USB ou
dans leur HSM cloud. En CI, utiliser le service de signature cloud de l'autorité (ex. SSL.com
eSigner, DigiCert KeyLocker) via `win.signtoolOptions` ou un script `win.signtoolOptions.sign`
personnalisé. Depuis 2024, un certificat EV ne donne plus de réputation SmartScreen immédiate : elle
s'acquiert avec le nombre de téléchargements, quel que soit le type de certificat.

### Vérifier

```powershell
signtool verify /pa /v dist\Sulfur-Setup-<version>.exe
Get-AuthenticodeSignature dist\Sulfur-Setup-<version>.exe
```

Signer aussi les exécutables contenus (electron-builder le fait par défaut : `Sulfur.exe`,
désinstalleur, modules natifs). Le contrôle `signtool verify` doit afficher l'horodatage (une
signature horodatée reste valide après l'expiration du certificat).

## 2. Signer et notariser macOS

Il faut un compte **Apple Developer Program** (99 $/an, au nom d'une personne ou d'une organisation
avec un numéro D-U-N-S).

1. Dans *Certificates, Identifiers & Profiles* : créer un certificat **Developer ID Application**,
   l'exporter en `.p12` avec son mot de passe.
2. Pour la notarisation, créer une clé d'API App Store Connect (*Users and Access → Integrations*,
   rôle *Developer*) : fichier `.p8`, *Key ID* et *Issuer ID*.
3. `electron-builder.yml` :

   ```yaml
   mac:
     # … cibles dmg et zip existantes
     hardenedRuntime: true
     gatekeeperAssess: false
     entitlements: build/entitlements.mac.plist
     entitlementsInherit: build/entitlements.mac.plist
     notarize: true
   ```

   `build/entitlements.mac.plist`, droits nécessaires à Electron avec le runtime renforcé :

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
     <dict>
       <key>com.apple.security.cs.allow-jit</key>
       <true/>
       <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
       <true/>
     </dict>
   </plist>
   ```

4. Secrets GitHub du job macOS, et retirer `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` pour ce job :

   | Secret                        | Contenu                                         |
   | ----------------------------- | ----------------------------------------------- |
   | `CSC_LINK`                    | le `.p12` encodé en base64                      |
   | `CSC_KEY_PASSWORD`            | son mot de passe                                |
   | `APPLE_API_KEY`               | chemin du `.p8` (écrit depuis un secret base64) |
   | `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | identifiants de la clé d'API           |

### Vérifier

```sh
codesign --verify --deep --strict --verbose=2 /Applications/Sulfur.app
spctl --assess --type execute --verbose /Applications/Sulfur.app   # « source=Notarized Developer ID »
xcrun stapler validate dist/Sulfur-<version>-arm64.dmg
```

Une fois l'application signée, Squirrel.Mac accepte les mises à jour : dans `updateSupport`
(`src/main/updater.js`), `canInstall` peut devenir vrai sous macOS (le zip et `latest-mac.yml` sont
déjà produits).

## Mises à jour selon le canal

Dans un store, l'updater intégré ne doit ni proposer ni installer de version : c'est le store qui le
fait, et Flathub comme le Mac App Store refusent une application qui se met à jour seule. À ajouter à
`updateSupport` avant la première publication :

| Canal           | Détection dans le process principal       |
| --------------- | ----------------------------------------- |
| Microsoft Store | `process.windowsStore === true`           |
| Mac App Store   | `process.mas === true`                    |
| Snap            | `process.env.SNAP` défini                 |
| Flatpak         | `process.env.FLATPAK_ID` défini           |

Dans ces cas : `supported: false` (onglet *Mises à jour* qui indique que le store gère les mises à
jour, pas de recherche automatique). Les notes de version peuvent rester affichées.

## 3. Microsoft Store

L'inscription est **gratuite** pour les développeurs individuels et, depuis mai 2026, pour les
entreprises ([storedeveloper.microsoft.com](https://storedeveloper.microsoft.com)).

Deux façons de publier :

- **MSIX (recommandée)** : paquet construit par electron-builder (cible `appx`), **signé par
  Microsoft** à la publication (pas de certificat à acheter), installation et mises à jour gérées
  par le Store.
- **Installeur Win32** : soumettre l'installeur NSIS par une URL HTTPS stable ; il doit alors être
  signé (section 1) et Sulfur garde son propre updater.

Avec MSIX :

1. Dans Partner Center, réserver le nom *Sulfur*, puis relever dans *Product identity* :
   `Package/Identity/Name`, `Package/Identity/Publisher` (`CN=…`) et `PublisherDisplayName`.
2. `electron-builder.yml` :

   ```yaml
   appx:
     identityName: 12345Topazdev.Sulfur # Package/Identity/Name
     publisher: CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX # Package/Identity/Publisher
     publisherDisplayName: Maxime MALLET
     applicationId: Sulfur
     backgroundColor: '#0b0f14'
     languages: [en-US, fr-FR]
   ```

   Construire sous Windows : `npx electron-builder --win appx --publish never`. Les visuels du Store
   (tuiles) se placent dans `build/appx/` (`StoreLogo.png`, `Square150x150Logo.png`,
   `Square44x44Logo.png`, `Wide310x150Logo.png`).
3. Soumettre le `.appx` / `.msix` dans Partner Center : description EN / FR, captures d'écran,
   classification d'âge, politique de confidentialité (URL obligatoire même sans collecte de données),
   catégorie *Developer tools*. Automatisable en CI avec la CLI
   [`msstore`](https://learn.microsoft.com/windows/apps/publish/msstore-dev-cli/overview).

Points propres à Sulfur : une application MSIX tourne en *full trust* (ports, port série, PowerShell
pour PLCSim Advanced fonctionnent), mais son dossier d'installation est en lecture seule et ses
écritures dans `%APPDATA%` sont virtualisées (les chemins restent ceux d'Electron, sans changement
de code). Décrivez clairement les modules externes dans la fiche : la politique du Store encadre le
code chargé dynamiquement, et c'est la revue qui tranche.

## 4. Mac App Store

Compte Apple Developer Program (le même que pour Developer ID). L'application doit tourner dans le
**bac à sable** d'Apple, ce qui demande des adaptations :

1. Certificats **Apple Distribution** (application) et **Mac Installer Distribution** (paquet `.pkg`),
   identifiant d'application `fr.topazdev.sulfur`, profil de provisionnement *Mac App Store* qui
   reprend les droits ci-dessous.
2. `electron-builder.yml` :

   ```yaml
   mas:
     entitlements: build/entitlements.mas.plist
     entitlementsInherit: build/entitlements.mas.inherit.plist
     provisioningProfile: build/sulfur.provisionprofile
     hardenedRuntime: false
   ```

   `build/entitlements.mas.plist` (droits de Sulfur ; `inherit` ne contient que `app-sandbox` et
   `inherit`) :

   ```xml
   <dict>
     <key>com.apple.security.app-sandbox</key><true/>
     <key>com.apple.security.application-groups</key>
     <array><string>TEAMID.fr.topazdev.sulfur</string></array>
     <key>com.apple.security.network.client</key><true/>
     <key>com.apple.security.network.server</key><true/>
     <key>com.apple.security.files.user-selected.read-write</key><true/>
     <key>com.apple.security.device.serial</key><true/>
   </dict>
   ```

3. Construire avec `npx electron-builder --mac mas` (et `mas-dev` pour essayer en local avec un
   profil de développement), puis envoyer le `.pkg` avec l'application **Transporter** (ou les
   outils en ligne de commande d'Xcode), et soumettre la version dans App Store Connect. La
   notarisation n'est pas nécessaire : Apple s'en charge.

Points propres à Sulfur :

- **Modules externes** : la règle 2.5.2 des *App Review Guidelines* interdit de télécharger ou
  d'exécuter du code qui ajoute des fonctions. Dans la version Mac App Store
  (`process.mas`), désactiver le chargement et l'installation des modules externes.
- **Fichiers** : dans le bac à sable, l'application ne voit que son conteneur et les fichiers choisis
  par l'utilisateur. Les dossiers servis (FTP, TFTP, HTTP) et les magasins de certificats doivent être
  choisis par une boîte de dialogue, et mémorisés avec des *security-scoped bookmarks* pour être
  retrouvés au démarrage suivant.
- **Réseau** : `network.server` couvre les serveurs simulés. Les ports inférieurs à 1024 (DHCP 67,
  Syslog 514, TFTP 69…) sont autorisés sans droits administrateur sur les macOS récents.
- **PLCSim Advanced** est propre à Windows : sans effet ici.

## 5. Flathub (Flatpak)

Flathub construit l'application **depuis les sources**, sans accès réseau pendant le build : on ne
soumet pas l'AppImage ou le .deb.

1. **Identifiant** : `fr.topazdev.sulfur`. Pour obtenir le badge *vérifié*, il faut contrôler le
   domaine `topazdev.fr` (fichier `/.well-known/org.flathub.VerifiedApps.txt` en HTTPS). Sans
   domaine, l'identifiant serait `io.github.azerxim.Sulfur`.
2. **Fichiers à ajouter dans le dépôt de Sulfur** (Flathub les veut en amont) :
   - `fr.topazdev.sulfur.metainfo.xml` (AppStream) : nom, résumé, description EN, licence
     `Apache-2.0`, captures d'écran (URL stables), `<releases>` à jour à chaque version, catégorie
     `Development` ; validé par `flatpak run --command=flatpak-builder-lint org.flatpak.Builder appstream …` ;
   - `fr.topazdev.sulfur.desktop` et une icône SVG (ou PNG 256 px minimum).
3. **Manifeste** `fr.topazdev.sulfur.yml` (dans le dépôt Flathub de l'application) :

   ```yaml
   id: fr.topazdev.sulfur
   runtime: org.freedesktop.Platform
   runtime-version: '25.08' # prendre la dernière version disponible au moment de la soumission
   sdk: org.freedesktop.Sdk
   base: org.electronjs.Electron2.BaseApp
   base-version: '25.08'
   sdk-extensions: [org.freedesktop.Sdk.Extension.node24]
   command: run.sh
   separate-locales: false
   finish-args:
     - --share=ipc
     - --socket=x11 # ou --socket=wayland avec --ozone-platform-hint=auto
     - --device=dri
     - --share=network # serveurs et clients simulés
     - --device=all # ports série (à justifier auprès des relecteurs)
   modules:
     - name: sulfur
       buildsystem: simple
       build-options:
         append-path: /usr/lib/sdk/node24/bin
         env: { XDG_CACHE_HOME: /run/build/sulfur/flatpak-node/cache, npm_config_offline: 'true' }
       build-commands:
         - npm ci --offline
         - npm run build
         - npx electron-builder --linux --dir --publish never
         - cp -a dist/linux-unpacked /app/main
         - install -Dm755 run.sh /app/bin/run.sh
         # + desktop, metainfo et icône dans /app/share/…
       sources:
         - type: git
           url: https://github.com/Azerxim/Sulfur.git
           tag: v0.5.0
           commit: <sha du tag>
         - generated-sources.json # dépendances npm, produit par flatpak-node-generator
         - type: script
           dest-filename: run.sh
           commands: ['exec zypak-wrapper /app/main/sulfur "$@"']
   ```

   `generated-sources.json` est produit par `flatpak-node-generator npm package-lock.json`
   ([flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools)). Les modules natifs
   (`serialport`) sont recompilés pendant le build ; `electron` lui-même vient des sources générées
   (variables `ELECTRON_CACHE` / `electron_config_cache`, voir la documentation de l'outil).
4. Essayer en local : `flatpak run org.flatpak.Builder --user --install --force-clean build fr.topazdev.sulfur.yml`.
5. **Soumission** : forker [flathub/flathub](https://github.com/flathub/flathub), créer une branche
   depuis `new-pr`, y ajouter le manifeste et `generated-sources.json`, ouvrir la pull request.
   Une fois acceptée, Flathub crée le dépôt `flathub/fr.topazdev.sulfur` ; chaque version est une
   pull request sur ce dépôt (automatisable avec `x-checker-data` et le bot de Flathub).

Points propres à Sulfur : comme avec l'AppImage ou le .deb, les ports inférieurs à 1024 (DHCP 67,
Syslog 514, TFTP 69) ne sont accessibles que si la distribution les ouvre aux utilisateurs
(`net.ipv4.ip_unprivileged_port_start`) ; dans un Flatpak, impossible en revanche de lancer Sulfur
avec des droits élevés : les serveurs doivent alors utiliser un port élevé. L'updater intégré doit être désactivé (voir plus haut). Flathub demande les permissions statiques
minimales : `--device=all` et `--share=network` sont justifiés par le rôle de l'application, à
expliquer dans la pull request.

## 6. Snap Store

1. Compte Ubuntu One sur [snapcraft.io](https://snapcraft.io), puis `snapcraft login` et
   `snapcraft register sulfur` (vérifier que le nom est libre).
2. `electron-builder.yml`, cible `snap` (clé `snap`, base par défaut d'electron-builder ; la clé
   `snapcraft` avec `base: core24` est encore en *beta* dans electron-builder) :

   ```yaml
   linux:
     target: [AppImage, deb, snap]
   snap:
     summary: Modular industrial protocol simulator
     grade: stable
     confinement: strict
     plugs:
       - default
       - network
       - network-bind
       - home
       - removable-media
       - raw-usb # adaptateurs USB-série (/dev/ttyUSB*, /dev/ttyACM*)
       - serial-port # connexion manuelle ou demande d'auto-connexion au Snap Store
   ```

3. Publier : `snapcraft upload --release=edge dist/sulfur_<version>_amd64.snap`, essayer
   (`snap install sulfur --edge`), puis promouvoir vers `beta` ou `stable` depuis le tableau de bord
   ou avec `snapcraft release`.
4. CI : `snapcraft export-login --snaps=sulfur --acls=package_upload,package_release - | base64 -w0`
   et stocker le résultat dans le secret `SNAPCRAFT_STORE_CREDENTIALS` (electron-builder le
   transmet à snapcraft).

Points propres à Sulfur : en confinement strict, l'accès au port série n'est pas garanti sur toutes
les distributions (`serial-port` dépend du *hotplug* de snapd, `raw-usb` ne couvre que l'USB) ; une
demande d'auto-connexion se fait sur le [forum Snapcraft](https://forum.snapcraft.io). Comme pour
Flatpak, les ports inférieurs à 1024 dépendent de la distribution et Sulfur ne peut pas être lancé
avec des droits élevés. Désactiver l'updater intégré (`process.env.SNAP`).

## 7. Intégration dans la CI

Ordre conseillé : signer d'abord (Windows et macOS, sans changer les canaux de distribution),
puis ajouter les stores un par un.

| Étape                      | Job                     | Secrets                                                              |
| -------------------------- | ----------------------- | -------------------------------------------------------------------- |
| Signature Windows          | `package` (Windows)     | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`          |
| Signature macOS            | `package` (macOS)       | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| Microsoft Store            | nouveau job Windows     | identifiants Partner Center (CLI `msstore`)                          |
| Mac App Store              | nouveau job macOS       | certificats de distribution, profil, clé d'API App Store Connect     |
| Snap Store                 | `package` (Linux)       | `SNAPCRAFT_STORE_CREDENTIALS`                                        |
| Flathub                    | hors CI de Sulfur       | — (pull request sur `flathub/fr.topazdev.sulfur`)                    |

Les secrets de signature ne doivent être disponibles que sur les tags `v*` (pas sur les pull
requests venant de forks).

## Liste de contrôle d'une version

- [ ] `signtool verify /pa` sur l'installeur et `Sulfur.exe` ; installation sans avertissement
      « éditeur inconnu ».
- [ ] `spctl --assess` et `stapler validate` sur le DMG ; premier lancement sans blocage Gatekeeper ;
      mise à jour automatique depuis la version précédente.
- [ ] Builds des stores : updater intégré désactivé, onglet *Mises à jour* cohérent.
- [ ] Mac App Store : modules externes désactivés, dossiers choisis retrouvés après redémarrage.
- [ ] Flatpak et Snap : serveurs simulés lancés (ports élevés si besoin), port série accessible.
- [ ] Fiches des stores : version, notes de version EN / FR, captures d'écran à jour.

## Sources

- electron-builder : [signature Windows](https://www.electron.build/docs/features/code-signing/code-signing-win),
  [Mac App Store](https://www.electron.build/docs/mas), [Snap](https://www.electron.build/docs/snap/)
- [Azure Artifact Signing](https://azure.microsoft.com/products/artifact-signing) et
  [tarifs](https://azure.microsoft.com/fr-fr/pricing/details/artifact-signing/)
- Durée des certificats de signature de code (460 jours) : [GlobalSign](https://www.globalsign.com/en/blog/code-signing-validity-changes)
- Microsoft Store : [inscription gratuite (individus)](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/),
  [inscription gratuite (entreprises)](https://blogs.windows.com/windowsdeveloper/2026/05/07/publish-to-microsoft-store-as-a-company-now-with-free-registration-and-faster-onboarding/)
- Flathub : [exigences](https://docs.flathub.org/docs/for-app-authors/requirements),
  [soumission](https://docs.flathub.org/docs/for-app-authors/submission)
- Apple : [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Snap et port série : [forum Snapcraft](https://forum.snapcraft.io/t/need-help-with-access-to-usb-serial-ports-was-classic-confinement-request-zworkbench/11188)
