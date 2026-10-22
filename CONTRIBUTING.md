# Contributing to Sulfur

**English** · [Français](CONTRIBUTING.fr.md)

Thank you for your interest in Sulfur! Bug reports, ideas and pull requests are welcome.

## License and CLA

Sulfur is distributed under the [Apache License 2.0](LICENSE). Additional modules, distributed as
separate packages, are planned (see the [roadmap](ROADMAP.md)).

Every contributor signs the
[Contributor License Agreement](CLA.md) (CLA) once:

- you keep the copyright on your contributions;
- you allow the maintainer to distribute them under Apache-2.0 (or another OSI-approved license);
- in return, every contribution included in Sulfur stays available under Apache-2.0 (or another
  OSI-approved license).

When you open your first pull request, a bot asks you to sign: post the comment
`I have read the CLA Document and I hereby sign the CLA` on the pull request. If you contribute on
behalf of your employer, make sure you are allowed to do so.

## Before opening a pull request

```bash
npm ci
npm run lint && npm run format:check && npm test && npm run build
```

- Follow the module contract described in the [README](README.md#adding-a-module).
- Provide the strings in English and French (`shared/locales/en.js` and `fr.js`).
- Add or update the tests in `tests/`.
- Keep one topic per pull request, with a clear description of the change.
