import type {
  BreezeApi,
  BreezeSelection,
  ChapterPage,
  ChapterSummary,
  ComicDetailContract,
  ComicDetailNormal,
  ComicListItem,
  MetadataListItem,
  RecommendItem,
  SearchResultContract,
} from "breeze-plugin-kit";
import {
  BASE_URL,
  PLUGIN_ID,
  createActionItem,
  createComicItem,
  createImage,
  createMetadata,
  createRecommendItem,
  createPaging,
  normalizeUrl,
  parseBookId,
  parseChapterId,
  parseStyleUrl,
  readNumber,
  readString,
  safePathSegment,
} from "./common";

function loadHtml(html: string): BreezeApi {
  return BreezeHtml.load(html);
}

function text(selection: BreezeSelection): string {
  return selection.text().replace(/\s+/gu, " ").trim();
}

function attr(selection: BreezeSelection, name: string): string {
  return (selection.attr(name) ?? "").trim();
}

function firstText(root: BreezeSelection, selector: string): string {
  return text(root.find(selector).first());
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function getImageUrl(scope: BreezeSelection, baseUrl: string): string {
  const image = scope.find("img").first();
  const cover = scope.find(".mh-cover").first();
  const raw =
    parseStyleUrl(attr(cover, "style")) ||
    attr(image, "data-original") ||
    attr(image, "data-src") ||
    attr(image, "src");
  return normalizeUrl(raw, baseUrl);
}

function parseDate(value: string): string {
  return value.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2})?/u)?.[0] ?? "";
}

function itemScope(anchor: BreezeSelection): BreezeSelection {
  const card = anchor.closest(".mh-item");
  if (card.length > 0) return card;
  const listItem = anchor.closest("li");
  return listItem.length > 0 ? listItem : anchor;
}

function parseComicItem(
  _root: BreezeApi,
  anchor: BreezeSelection,
  baseUrl: string,
): ComicListItem | null {
  const href = attr(anchor, "href");
  const id = parseBookId(href);
  if (!id) return null;

  const scope = itemScope(anchor);
  const title =
    attr(anchor, "title") || firstText(scope, "h2.title a, .manga-list-2-title a") || text(anchor);
  if (!title) return null;

  const itemText = text(scope);
  const author = firstText(scope, ".author, .zl")
    .replace(/^作者\s*[:：]?\s*/u, "")
    .trim();
  const status = /完結|完结/iu.test(itemText) ? "完结" : "";
  const updatedAt = parseDate(itemText);
  const subtitle = firstText(scope, ".chapter, .manga-list-2-tip, .update-time, .mh-list-2-tip");
  const coverUrl = getImageUrl(scope, baseUrl);

  return createComicItem({
    id,
    title,
    subtitle,
    coverUrl,
    author,
    status,
    updatedAt,
    finished: Boolean(status),
    raw: {
      id,
      href: normalizeUrl(href, baseUrl),
      title,
      subtitle,
      author,
      status,
      updatedAt,
      coverUrl,
    },
    extern: { bookId: id, remoteUrl: coverUrl },
  });
}

function parseComicItems(
  root: BreezeApi,
  scope: BreezeSelection,
  baseUrl: string,
): ComicListItem[] {
  const result: ComicListItem[] = [];
  const seen = new Set<string>();
  scope
    .find('a[href*="/book/"], a[href^="book/"]')
    .each((_index: number, element: BreezeSelection) => {
      const item = parseComicItem(root, root(element), baseUrl);
      if (!item || seen.has(item.id)) return;
      seen.add(item.id);
      result.push(item);
    });
  return result;
}

export function parseSearchResult(
  html: string,
  page: number,
  sourceUrl = BASE_URL,
): SearchResultContract {
  const root = loadHtml(html);
  const body = text(root("body"));
  const parsedTotal = readNumber(body.match(/共找\s*([\d,]+)\s*个相关内容/iu)?.[1]);
  const items = parseComicItems(root, root("body"), sourceUrl);
  const total = parsedTotal > 0 ? parsedTotal : (page - 1) * 20 + items.length;
  const paging = createPaging(page, total, items.length, 20);
  return {
    source: PLUGIN_ID,
    extern: { page, total },
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: { paging, items },
    paging,
    items,
  };
}
export type ParsedFavoriteShelfPage = {
  page: number;
  hasReachedMax: boolean;
  loggedOut: boolean;
  items: ComicListItem[];
};

/**
 * 解析书架页（GET /bookshelf）：服务端直出 ul.mh-list，无 Vue。
 * 未登录会被踢到登录页（title 含“用户登录”），此时 loggedOut 为 true，
 * index 层抛 unauthorized 引导登录。
 * 分页：.page-pagination 无页码时缺省单页；hidCount 恒 0 不可用，
 * 尾页按“本页条数 < 页大小”判定（站内列表页大小 20）。
 */
export function parseFavoriteShelfPage(html: string, page: number): ParsedFavoriteShelfPage {
  const root = loadHtml(html);
  const title = text(root("title"));
  if (/用户登录/u.test(title)) {
    return { page, hasReachedMax: true, loggedOut: true, items: [] };
  }
  const list = root("ul.mh-list").first();
  const scope = list.length > 0 ? list : root("body");
  const items = parseComicItems(root, scope, BASE_URL);
  const pageNumbers: number[] = [];
  root(".page-pagination a").each((_index: number, element: BreezeSelection) => {
    const label = readNumber(text(root(element)));
    if (label > 0) pageNumbers.push(label);
  });
  const pages = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
  return { page, hasReachedMax: page >= pages || items.length < 20, loggedOut: false, items };
}

export const BOOKLIST_TAGS = [
  "全部",
  "青春",
  "性感",
  "长腿",
  "多人",
  "御姐",
  "巨乳",
  "新婚",
  "媳妇",
  "暧昧",
  "清纯",
  "调教",
  "少妇",
  "风骚",
  "同居",
  "淫乱",
  "好友",
  "女神",
  "诱惑",
  "偷情",
  "出轨",
  "正妹",
  "家教",
] as const;

export const BOOKLIST_AREAS = [
  { label: "全部", value: "-1" },
  { label: "台湾", value: "3" },
  { label: "日本", value: "2" },
  { label: "韩国", value: "1" },
] as const;

export const BOOKLIST_ENDS = [
  { label: "全部", value: "-1" },
  { label: "完结", value: "1" },
  { label: "未完结", value: "0" },
] as const;

export const DEFAULT_BOOKLIST_TAG = "全部";
export const DEFAULT_BOOKLIST_AREA = "-1";
export const DEFAULT_BOOKLIST_END = "-1";

export function normalizeBooklistTag(value: unknown): string {
  const raw = readString(value);
  if (raw && (BOOKLIST_TAGS as readonly string[]).includes(raw)) return raw;
  return DEFAULT_BOOKLIST_TAG;
}

export function normalizeBooklistArea(value: unknown): string {
  const raw = readString(value);
  if (BOOKLIST_AREAS.some((option) => option.value === raw)) return raw;
  return DEFAULT_BOOKLIST_AREA;
}

export function normalizeBooklistEnd(value: unknown): string {
  const raw = readString(value);
  if (BOOKLIST_ENDS.some((option) => option.value === raw)) return raw;
  return DEFAULT_BOOKLIST_END;
}

export type ParsedBooklistPage = {
  tag: string;
  area: string;
  end: string;
  page: number;
  pages: number;
  hasReachedMax: boolean;
  items: ComicListItem[];
};

export function parseBooklistPage(
  html: string,
  tagValue: unknown,
  areaValue: unknown,
  endValue: unknown,
  page: number,
  sourceUrl = BASE_URL,
): ParsedBooklistPage {
  const tag = normalizeBooklistTag(tagValue);
  const area = normalizeBooklistArea(areaValue);
  const end = normalizeBooklistEnd(endValue);
  const root = loadHtml(html);
  const list = root("ul.mh-list").first();
  const scope = list.length > 0 ? list : root("body");
  const items = parseComicItems(root, scope, sourceUrl);
  const pageNumbers: number[] = [];
  root(".pagination a").each((_index: number, element: BreezeSelection) => {
    const link = root(element);
    const label = readNumber(text(link));
    if (label > 0) pageNumbers.push(label);
    const href = attr(link, "href");
    if (!href) return;
    const pageParam = href.match(/[?&]page=(\d+)/u)?.[1];
    if (pageParam) pageNumbers.push(readNumber(pageParam));
  });
  const pages = pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
  return { tag, area, end, page, pages, hasReachedMax: page >= pages, items };
}

function parseLabeledFields(scope: BreezeSelection): Record<string, string> {
  const fields: Record<string, string> = {};
  scope.find("span.block").each((_index: number, element: BreezeSelection) => {
    const value = text(element);
    const match = value.match(/^([^:：]+)\s*[:：]\s*(.*)$/u);
    if (match) fields[match[1].trim()] = match[2].trim();
  });
  return fields;
}

function readSubtitle(scope: BreezeSelection, label: string): string {
  let result = "";
  scope.find("p.subtitle").each((_index: number, element: BreezeSelection) => {
    const value = text(element);
    const match = value.match(new RegExp("^" + label + "\\s*[:：]?\\s*(.*)$", "u"));
    if (match && !result) result = match[1].trim();
  });
  return result;
}

function parseTags(scope: BreezeSelection): string[] {
  const values: string[] = [];
  scope.find('p.tip a[href*="tag="]').each((_index: number, element: BreezeSelection) => {
    const value = text(element);
    if (value) values.push(value);
  });
  return uniqueStrings(values);
}

function parseChapters(scope: BreezeSelection, bookId: string): ChapterSummary[] {
  const result: ChapterSummary[] = [];
  const seen = new Set<string>();
  let chapterLinks = scope.find('#detail-list-select a[href*="/chapter/"]');
  if (chapterLinks.length === 0) {
    chapterLinks = scope.find('a[href*="/chapter/"]');
  }

  chapterLinks.each((_index: number, element: BreezeSelection) => {
    const link = element;
    const chapterId = parseChapterId(attr(link, "href"));
    if (!chapterId || seen.has(chapterId)) return;
    seen.add(chapterId);
    result.push({
      id: chapterId,
      requestId: chapterId,
      logicalKey: bookId + ":" + chapterId,
      storageChapterId: chapterId,
      name: attr(link, "title") || text(link) || "章节 " + chapterId,
      order: result.length + 1,
      extern: { bookId, chapterId },
    });
  });
  return result;
}

function parseRelatedItems(
  root: BreezeApi,
  scope: BreezeSelection,
  baseUrl: string,
): RecommendItem[] {
  const result: RecommendItem[] = [];
  const seen = new Set<string>();
  scope
    .find('a[href*="/book/"], a[href^="book/"]')
    .each((_index: number, element: BreezeSelection) => {
      const anchor = root(element);
      const id = parseBookId(attr(anchor, "href"));
      if (!id || seen.has(id)) return;
      const card = itemScope(anchor);
      const title =
        attr(anchor, "title") ||
        firstText(card, ".buy-manga-title a, h2.title a, .manga-list-2-title a") ||
        text(anchor);
      if (!title) return;
      const subtitle = firstText(card, ".chapter, .zl, .buy-manga-new, .buy-manga-author");
      const coverUrl = getImageUrl(card, baseUrl);
      seen.add(id);
      result.push(
        createRecommendItem({
          id,
          title,
          subtitle,
          coverUrl,
          raw: {
            id,
            href: normalizeUrl(attr(anchor, "href"), baseUrl),
            title,
            subtitle,
            coverUrl,
          },
        }),
      );
    });
  return result;
}

function parseRecommendations(root: BreezeApi, baseUrl: string): RecommendItem[] {
  let result: RecommendItem[] = [];
  root("div.index-title").each((_index: number, element: BreezeSelection) => {
    const title = text(element.find("h2").first());
    if (!/相关推荐|相关推荐/iu.test(title)) return;
    const next = element.next(".index-manga");
    if (next.length > 0) result = parseRelatedItems(root, next, baseUrl);
  });
  if (result.length === 0) {
    result = parseRelatedItems(root, root("#recommand"), baseUrl);
  }
  return result;
}

export function parseComicDetail(
  html: string,
  bookId: string,
  sourceUrl = BASE_URL,
): ComicDetailContract {
  const root = loadHtml(html);
  const detail = root("section.banner_detail").first();
  const scope = detail.length > 0 ? detail : root("body");
  const title = firstText(scope, "h1") || "漫画 " + bookId;
  const coverUrl = normalizeUrl(attr(scope.find(".cover img").first(), "src"), sourceUrl);
  const alias = readSubtitle(scope, "别名");
  const author = readSubtitle(scope, "作者");
  const tags = parseTags(scope);
  const fields = parseLabeledFields(scope.find("p.tip").first());
  const region = firstText(scope, "p.tip .ticai a") || fields["地区"] || fields["地域"] || "";
  const description = firstText(scope, "p.content");
  const chapters = parseChapters(root("body"), bookId);
  const recommendations = parseRecommendations(root, sourceUrl);
  const status = fields["状态"] || "";
  const updatedAt = fields["更新时间"] || "";
  const views = readNumber(fields["点击"] || fields["浏览"]);
  const metadata: MetadataListItem[] = [
    createMetadata("author", "作者", author ? [author] : []),
    createMetadata("tags", "标签", tags),
    createMetadata("status", "状态", status ? [status] : []),
    createMetadata("region", "地区", region ? [region] : []),
  ].filter((item) => item.value.length > 0);

  const normal: ComicDetailNormal = {
    comicInfo: {
      id: bookId,
      title,
      titleMeta: [
        createActionItem("章节数：" + chapters.length),
        createActionItem("状态：" + (status || "未知")),
        createActionItem("更新时间：" + (updatedAt || "未知")),
        createActionItem("地区：" + (region || "未知")),
        ...(alias ? [createActionItem("别名：" + alias)] : []),
      ],
      creator: {
        id: "",
        name: "",
        avatar: createImage({ id: "", url: "", path: "" }),
        onTap: null,
        extern: {},
      },
      description,
      cover: createImage({
        id: bookId,
        url: coverUrl,
        name: title + ".jpg",
        path: "comic/" + safePathSegment(bookId, "unknown") + "/cover-v2.jpg",
        extern: { bookId, remoteUrl: coverUrl },
      }),
      metadata,
      extern: {
        bookId,
        alias,
        author,
        status,
        region,
        updatedAt,
        sourceUrl,
      },
    },
    eps: chapters,
    recommend: recommendations,
    totalViews: views,
    totalLikes: 0,
    totalComments: 0,
    isFavourite: false,
    isLiked: false,
    allowComments: false,
    allowCommentsReason: "JJ漫画暂不支持评论",
    allowLike: false,
    allowLikeReason: "JJ漫画暂不支持点赞",
    allowCollected: false,
    allowCollectedReason: "JJ漫画暂不支持收藏",
    allowDownload: chapters.length > 0,
    extern: { bookId, sourceUrl },
  };

  return {
    source: PLUGIN_ID,
    comicId: bookId,
    extern: { bookId, sourceUrl },
    scheme: {
      version: "1.0.0",
      type: "comicDetail",
      source: PLUGIN_ID,
    },
    data: {
      normal,
      raw: {
        bookId,
        title,
        coverUrl,
        alias,
        author,
        tags,
        status,
        region,
        updatedAt,
        views,
        description,
        chapters,
        recommendations,
      },
    },
  };
}

export type ParsedChapterPage = {
  chapterId: string;
  title: string;
  bookId: string;
  bookTitle: string;
  chapterCount: number;
  previousChapterId: string;
  nextChapterId: string;
  imageUrls: string[];
};

export function parseChapterPage(
  html: string,
  chapterId: string,
  sourceUrl: string,
): ParsedChapterPage {
  const root = loadHtml(html);
  const bookLink = root('a.comic-name[href*="/book/"]').first();
  const imageUrls: string[] = [];
  const seen = new Set<string>();
  root(".comiclist img").each((_index: number, element: BreezeSelection) => {
    const image = element;
    const raw = attr(image, "data-original") || attr(image, "data-src") || attr(image, "src");
    const imageUrl = normalizeUrl(raw, sourceUrl);
    if (!imageUrl || imageUrl.startsWith("data:") || seen.has(imageUrl)) return;
    seen.add(imageUrl);
    imageUrls.push(imageUrl);
  });

  let previousChapterId = "";
  let nextChapterId = "";
  root('.fanye a[href*="/chapter/"]').each((_index: number, element: BreezeSelection) => {
    const value = text(element);
    const id = parseChapterId(attr(element, "href"));
    if (!id) return;
    if (/上一章|上一话/iu.test(value)) previousChapterId = id;
    if (/下一章|下一话/iu.test(value)) nextChapterId = id;
  });

  const countText = text(root(".sidebar-header-r").first());
  return {
    chapterId,
    title: firstText(root("body"), "h1") || "章节 " + chapterId,
    bookId: parseBookId(attr(bookLink, "href")),
    bookTitle: text(bookLink),
    chapterCount: readNumber(countText.match(/\d+/u)?.[0]),
    previousChapterId,
    nextChapterId,
    imageUrls,
  };
}

export function createChapterPages(
  bookId: string,
  chapterId: string,
  imageUrls: string[],
  referer: string,
): ChapterPage[] {
  return imageUrls.map((url, index) => {
    let extension = ".jpg";
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.(jpg|jpeg|png|webp|gif)$/iu);
      if (match) extension = "." + match[1].toLowerCase();
    } catch {
      // Keep the jpg fallback for malformed remote paths.
    }
    const number = String(index + 1);
    return {
      id: chapterId + "-page-" + number,
      name: number + extension,
      path:
        "comic/" +
        safePathSegment(bookId, "unknown") +
        "/" +
        safePathSegment(chapterId, "chapter") +
        "/" +
        number +
        extension,
      url,
      extern: {
        bookId,
        chapterId,
        index,
        remoteUrl: url,
        referer,
      },
    };
  });
}

export type RankType = "new" | "hot" | "completed" | "recommended";

export const RANK_TITLES: Record<RankType, string> = {
  new: "新书榜",
  hot: "人气榜",
  completed: "完结榜",
  recommended: "推荐榜",
};

const RANK_ORDER: RankType[] = ["new", "hot", "completed", "recommended"];

export function normalizeRankType(value: unknown): RankType {
  const raw = readString(value);
  if (/新书|新番/iu.test(raw) || raw === "new") return "new";
  if (/完结/iu.test(raw) || raw === "completed") return "completed";
  if (/推荐/iu.test(raw) || raw === "recommended") return "recommended";
  return "hot";
}

function readAuthorLabel(value: string): string {
  return value.replace(/^作者\s*[:：]?\s*/u, "").trim();
}

function collectTagLabels(root: BreezeApi, scope: BreezeSelection): string[] {
  const values: string[] = [];
  scope.find(".mh-label a").each((_index: number, element: BreezeSelection) => {
    const value = text(root(element));
    if (value) values.push(value);
  });
  return uniqueStrings(values);
}

function parseRankHeadItem(
  root: BreezeApi,
  item: BreezeSelection,
  rankType: RankType,
  baseUrl: string,
): ComicListItem | null {
  const anchor = item.find("h2.title a").first();
  const id = parseBookId(attr(anchor, "href"));
  const title = attr(anchor, "title") || text(anchor);
  if (!id || !title) return null;
  const coverUrl = normalizeUrl(
    parseStyleUrl(attr(item.find(".mh-cover").first(), "style")),
    baseUrl,
  );
  const author = readAuthorLabel(firstText(item, "p.zl"));
  const subtitle = firstText(item, "p.chapter") || firstText(item, "div.desc");
  const tags = collectTagLabels(root, item);
  return createComicItem({
    id,
    title,
    subtitle,
    coverUrl,
    author,
    raw: {
      id,
      rank: 1,
      rankType,
      tags: tags.join(","),
      href: normalizeUrl(attr(anchor, "href"), baseUrl),
      title,
      subtitle,
      author,
      coverUrl,
    },
    extern: { bookId: id, rankType, rank: "1", remoteUrl: coverUrl },
  });
}

function parseRankRestItems(
  root: BreezeApi,
  section: BreezeSelection,
  rankType: RankType,
  baseUrl: string,
): ComicListItem[] {
  const result: ComicListItem[] = [];
  section.find("div.mh-itme-top").each((_index: number, element: BreezeSelection) => {
    const entry = root(element);
    const anchor = entry.find('a[href*="/book/"]').first();
    const id = parseBookId(attr(anchor, "href"));
    const title = attr(anchor, "title") || text(anchor).replace(/^\d+\s*/u, "");
    if (!id || !title) return;
    const tip = entry.find(".mh-tip-wrap").first();
    const scope = tip.length > 0 ? tip : entry;
    const coverUrl = normalizeUrl(
      parseStyleUrl(attr(scope.find(".mh-cover").first(), "style")),
      baseUrl,
    );
    const author = readAuthorLabel(firstText(scope, ".author"));
    const subtitle = firstText(scope, "p.chapter") || firstText(scope, "div.desc");
    const rank = result.length + 2;
    const item = createComicItem({
      id,
      title,
      subtitle,
      coverUrl,
      author,
      raw: {
        id,
        rank,
        rankType,
        href: normalizeUrl(attr(anchor, "href"), baseUrl),
        title,
        subtitle,
        author,
        coverUrl,
      },
      extern: { bookId: id, rankType, rank: String(rank), remoteUrl: coverUrl },
    });
    if (item) result.push(item);
  });
  return result;
}

export type ParsedRankPage = {
  rankType: RankType;
  title: string;
  items: ComicListItem[];
};

export function parseRankPage(
  html: string,
  rankTypeValue: unknown,
  sourceUrl = BASE_URL,
): ParsedRankPage {
  const rankType = normalizeRankType(rankTypeValue);
  const wantTitle = RANK_TITLES[rankType];
  const root = loadHtml(html);
  const sections = root("ul.top-cat > li");
  const sectionCount = sections.length;
  let target: BreezeSelection | null = null;
  let fallback: BreezeSelection | null = null;
  for (let index = 0; index < sectionCount; index += 1) {
    const candidate = sections.eq(index);
    if (text(candidate.find("div.title").first()).includes(wantTitle)) {
      target = candidate;
      break;
    }
    if (index === RANK_ORDER.indexOf(rankType)) fallback = candidate;
  }
  const current = target ?? fallback;
  if (current === null) return { rankType, title: wantTitle, items: [] };
  const title = text(current.find("div.title").first()) || wantTitle;
  const items: ComicListItem[] = [];
  const head = current.find("div.mh-item.horizontal").first();
  if (head.length > 0) {
    const headItem = parseRankHeadItem(root, head, rankType, sourceUrl);
    if (headItem) items.push(headItem);
  }
  for (const item of parseRankRestItems(root, current, rankType, sourceUrl)) {
    items.push(item);
  }
  return { rankType, title, items };
}
