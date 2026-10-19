# Contribuer à Sulfur

[English](CONTRIBUTING.md) · **Français**

Merci de votre intérêt pour Sulfur ! Les signalements de bugs, les idées et les pull requests sont
les bienvenus.

## Licence et CLA

Sulfur est distribué sous [licence Apache 2.0](LICENSE). En plus de l'édition gratuite (standard),
des modules premium sous licence commerciale sont prévus (voir la [roadmap](ROADMAP.fr.md)).

Pour que les contributions puissent être utilisées dans les deux éditions, chaque contributeur
signe une fois le [Contributor License Agreement](CLA.md) (CLA, accord de licence du contributeur) :

- vous conservez le droit d'auteur sur vos contributions ;
- vous autorisez le mainteneur à les distribuer sous Apache-2.0 et sous d'autres licences, y compris
  commerciales ;
- en contrepartie, toute contribution intégrée à l'édition open source reste disponible sous
  Apache-2.0 (ou une autre licence approuvée par l'OSI).

Le texte de référence du CLA est la version anglaise ([CLA.md](CLA.md)). À l'ouverture de votre
première pull request, un bot vous demande de le signer : publiez le commentaire
`I have read the CLA Document and I hereby sign the CLA` sur la pull request. Si vous contribuez
pour le compte de votre employeur, assurez-vous d'y être autorisé.

## Avant d'ouvrir une pull request

```bash
npm ci
npm run lint && npm run format:check && npm test && npm run build
```

- Respectez le contrat de module décrit dans le [README](README.fr.md#ajouter-un-module).
- Fournissez les textes en anglais et en français (`shared/locales/en.js` et `fr.js`).
- Ajoutez ou mettez à jour les tests dans `tests/`.
- Une pull request par sujet, avec une description claire du changement.
