# Releases

Use the npm package page for published `@averyso/alpha` versions:

https://www.npmjs.com/package/@averyso/alpha

Use GitHub Releases and tags for repository release history:

https://github.com/avery-so/alpha/releases

The `latest` npm dist-tag is the stable default install target:

```sh
pnpm add @averyso/alpha
```

When an `alpha` npm dist-tag is present, treat it as a prerelease or testing
channel:

```sh
pnpm add @averyso/alpha@alpha
```

Breaking changes are called out in release notes and Changesets version bumps.
Review the release notes before upgrading across major versions.

## For maintainers

Release notes are generated from Changesets. Before publishing a package
version, run:

```sh
pnpm changeset
pnpm version
pnpm release
```
