# 一派 Picks

一个极简的个人精选作者名录，用来展示值得关注的创作者、博客作者和内容源。

## 技术栈

- React + Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2

## 数据模型

当前只保留一张表：

```sql
create table picks (
  id text primary key,
  name text not null,
  avatar_image text,
  intro text,
  platform text not null default '',
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
- `tags`: 领域标签，只用于筛选，例如政治、体育、心理
- `sort_order`: 排序，数字越小越靠前

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

如果你设置了 `ADMIN_TOKEN`，复制 `.dev.vars.example` 为 `.dev.vars` 并修改令牌。打开 `/admin` 后在“管理令牌”里填写同一个值。

## Cloudflare 部署

创建 D1：

```bash
npx wrangler d1 create yipai-picks
```

把输出里的 `database_id` 填到 `wrangler.jsonc`。

创建 R2 bucket：

```bash
npx wrangler r2 bucket create yipai-picks-images
```

应用远程数据库迁移：

```bash
npm run db:migrate:remote
```

设置后台令牌：

```bash
npx wrangler secret put ADMIN_TOKEN
```

部署：

```bash
npm run deploy
```

## API

- `GET /api/picks`: 获取公开列表
- `POST /api/admin/picks`: 新增
- `PUT /api/admin/picks/:id`: 更新
- `DELETE /api/admin/picks/:id`: 删除
- `POST /api/admin/avatar`: 上传头像
- `GET /media/:key`: 读取头像

后台 API 通过 `ADMIN_TOKEN` 保护。没有设置 `ADMIN_TOKEN` 时，接口会放行，方便本地开发；正式环境建议必须设置该 secret。
