# 发布

请通过 npm 包页面查看已发布的 `@averyso/alpha` 版本：

https://www.npmjs.com/package/@averyso/alpha

请通过 GitHub Releases 和 tags 查看仓库发布历史：

https://github.com/avery-so/alpha/releases

`latest` npm dist-tag 是稳定版本的默认安装目标：

```sh
pnpm add @averyso/alpha
```

当 `alpha` npm dist-tag 存在时，请将它视为预发布或测试渠道：

```sh
pnpm add @averyso/alpha@alpha
```

破坏性变更会在 release notes 和 Changesets 版本号变更中说明。跨 major
版本升级前，请先阅读对应 release notes。

## 维护者说明

发布说明通过 Changesets 生成。发布新版本前运行：

```sh
pnpm changeset
pnpm version
pnpm release
```
