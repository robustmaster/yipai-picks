# 一派 Picks

一个极简的个人精选作者名录，用来展示值得关注的创作者、博客作者和内容源。

[![Deploy template to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/robustmaster/yipai-picks)

## 技术栈

- React + Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2

## 数据模型

推荐数据保存在 `picks` 表：

```sql
create table picks (
  id text primary key,
  name text not null,
  avatar_image text,
  intro text,
  platform text not null default '',
  link_type text not null default '',
  link_value text,
  tags text not null default '[]',
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null
);
```

字段约定：

- `name`: 作者名或账号名
- `avatar_image`: R2 里的头像 key
- `intro`: 简介
- `platform`: 主要平台，例如 B站、抖音、微信公众号、博客
- `link_type`: 链接类型，空值表示不设置；可选 `url`、`image`、`text`
- `link_value`: 链接内容。`url` 存 URL，`image` 存 R2 图片 key，`text` 存普通文本
- `tags`: 领域标签，只用于筛选，例如政治、体育、心理
- `sort_order`: 排序，数字越小越靠前

`site_settings` 是固定 `id = 1` 的单例设置表，用来保存网站名称、署名文字和署名链接。登录后台后，可从右上角账户菜单进入“网站设置”修改。

## 本地开发

安装依赖：

```bash
npm install
```

准备本地 D1：

```bash
npm run db:migrate:local
```

构建前端并启动 Worker：

```bash
npm run build
npm run dev
```

复制 `.dev.vars.example` 为 `.dev.vars`，并修改 `ADMIN_PASSWORD`。打开 `/admin` 后使用账号密码登录；`ADMIN_USERNAME` 不设置时默认为 `admin`。

## 部署当前仓库

如果你要部署当前这个 GitHub 仓库，不要使用下面的 Deploy Button。Cloudflare 的 Deploy Button 会把源仓库当作模板，clone 到你选择的 GitHub/GitLab 账号里并创建一个新仓库。

部署当前仓库更适合走 Cloudflare Dashboard 的 Git 集成：

1. 打开 Cloudflare Dashboard。
2. 进入 Workers & Pages，创建 Worker 应用。
3. 选择连接 Git 仓库，并选择 `robustmaster/yipai-picks`。
4. 确认构建命令使用 `npm run build`，部署命令使用 `npm run deploy`。
5. 在 Worker 的 `Settings` -> `Variables and Secrets` 里添加运行时 Secret `ADMIN_PASSWORD`。`ADMIN_USERNAME` 可选，不填时默认为 `admin`。

Cloudflare 会在首次部署时根据 `wrangler.jsonc` 自动创建并绑定 D1 和 R2。后续 push 到生产分支时会自动部署。

图片会随推荐项自动清理：更新或删除推荐项后，Worker 会删除不再被任何记录引用的旧图片；每天北京时间 03:00 还会扫描一次 R2，删除上传超过 24 小时且仍未被引用的孤儿图片。这样也能处理上传后取消编辑、保存失败或浏览器意外关闭产生的残留文件。

注意：`Settings` -> `Build` 里的 `Build variables and secrets` 只在构建和部署命令执行时可用，Worker 运行时读不到。后台登录必须配置在 Worker 的 `Settings` -> `Variables and Secrets`。

## 模板一键部署

如果你想把这个项目作为模板部署成一个新项目，可以使用 Cloudflare 的 Deploy Button：

[Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/robustmaster/yipai-picks)

这个流程会创建一个新的 Git 仓库，并连接到新的 Cloudflare Worker 应用。部署时 Cloudflare 会读取 `wrangler.jsonc`，自动创建并绑定需要的 D1 数据库和 R2 bucket。`database_id` 这类值会由 Cloudflare 在部署流程里处理，不需要手动复制。

部署页面里只需要重点确认几项：

- Worker 名称，可以保持 `yipai-picks`
- D1 绑定 `DB`，用于保存推荐列表
- R2 绑定 `IMAGES`，用于保存头像
- Secret `ADMIN_PASSWORD`，用于保护 `/admin` 后台
- `ADMIN_USERNAME` 可选，不填时后台账号默认为 `admin`

部署完成后，打开站点的 `/admin`，使用账号密码登录即可管理数据。

这个一键部署方式要求源仓库是公开仓库。Cloudflare 官方的 Deploy Button 目前只支持 Workers 应用，不支持 Pages 应用。

## 命令行部署

如果不用网页部署，也可以手动部署。首次部署会自动创建 D1 和 R2：

```bash
npm run build
npm run deploy
```

如果你想提前手动创建 D1，也可以执行：

```bash
npx wrangler d1 create yipai-picks
```

然后把输出里的 `database_id` 填到 `wrangler.jsonc`。手动创建 R2：

```bash
npx wrangler r2 bucket create yipai-picks-images
```

设置后台密码：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

后台账号默认是 `admin`。如果你想改账号名，可以再设置：

```bash
npx wrangler secret put ADMIN_USERNAME
```

## API

- `GET /api/picks`: 获取公开列表
- `GET /api/settings`: 获取公开网站设置
- `POST /api/admin/login`: 后台登录
- `POST /api/admin/logout`: 后台退出
- `GET /api/admin/session`: 检查后台登录状态
- `POST /api/admin/picks`: 新增
- `PUT /api/admin/picks/:id`: 更新
- `DELETE /api/admin/picks/:id`: 删除
- `PUT /api/admin/settings`: 更新网站设置
- `POST /api/admin/avatar`: 上传头像
- `POST /api/admin/link-image`: 上传链接图片
- `GET /media/:key`: 读取头像或链接图片

后台 API 通过 HttpOnly Cookie 会话保护。必须配置运行时 Secret `ADMIN_PASSWORD` 后才能登录和写入数据；未配置时后台写接口会拒绝请求。
