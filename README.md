# Breeze Plugin JJ漫画

这是 [jjmhw.cc](https://www.jjmhw.cc/) 的 Breeze 漫画源插件，当前实现阅读/下载主链路、排行榜与分类：

- 关键词搜索：searchComic
- 漫画详情、作者/标签/状态/简介、章节总数和章节列表：getComicDetail
- 在线阅读快照：getReadSnapshot
- 章节详情和图片清单：getChapter
- 图片二进制获取：fetchImageBytes
- 排行榜（新书榜/人气榜/完结榜/推荐榜）与榜单筛选：getRankingData + getRankingFilterBundle，发现页默认场景：getComicListSceneBundle
- 分类（进度/地区/题材三组筛选，默认 全部进度 + 全部地区 + 全部题材）：getCategoryData + getCategoryFilterBundle

getChapter + fetchImageBytes 是 Breeze 的标准章节下载链路：插件返回章节页中的图片 URL，宿主按顺序调用 fetchImageBytes 获取图片字节并保存到本地。

本版本暂不实现首页、最近更新、登录、历史、书架、收藏、评论等功能。

## 站点解析要点

- 搜索：/search?keyword=...
- 漫画详情：/book/{bookId}
- 排行榜：/rank（单页含新书/人气/完结/推荐四个榜单，无翻页，page>1 直接返回空页）
- 分类：/booklist?tag=&area=&end=&page=（题材 全部/青春/性感… + 地区 全部/台湾/日本/韩国 + 进度 全部/完结/未完结，默认 tag=全部&area=-1&end=-1；单结果页无分页 DOM，按 page>=pages 截断）
- 搜索结果和相关推荐同时兼容 .mh-list 与 .manga-list-2 卡片模板。
- 章节图片优先读取 img[data-original]，因为站点的 img[src] 通常只是懒加载占位图。
- 详情页章节从 #detail-list-select a[href*="/chapter/"] 提取。
- 详情页相关推荐从“相关推荐”标题后的 .index-manga 提取，并兼容移动模板 #recommand。

## 构建

在 D:\Project\web\Breeze-plugin\Breeze-plugin-jjmhw 目录执行：

pnpm install
pnpm run typecheck
pnpm run build

构建产物位于 dist/，包含 .bundle.cjs 和 Brotli 压缩文件；manifest.json 由构建脚本自动生成。

开发调试：

    pnpm run dev

默认监听 7878 端口，启动后会输出 bundle 地址和远程日志地址。也可以通过 BUNDLE_PORT 和 BUNDLE_HOST 环境变量修改监听配置。
