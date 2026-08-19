import type {
  ChapterContentContract,
  ChapterPage,
  ChapterPayload,
  ChapterSummary,
  ComicDetailContract,
  ComicDetailPayload,
  FetchImageBytesPayload,
  InfoContract,
  ReadSnapshotContract,
  ReadSnapshotPayload,
  SearchComicPayload,
  SearchResultContract,
  SettingsBundleContract,
  CapabilitiesBundleContract,
  StringMap,
} from "breeze-plugin-kit";
import { runtime } from "breeze-plugin-kit";
import {
  BASE_URL,
  PLUGIN_ID,
  readString,
  safePathSegment,
  toStringMap,
} from "./common";
import {
  buildBookUrl,
  buildChapterUrl,
  buildImageHeaders,
  buildSearchUrl,
  fetchHtml,
} from "./site";
import {
  createChapterPages,
  parseChapterPage,
  parseComicDetail,
  parseSearchResult,
  type ParsedChapterPage,
} from "./parser";
import { buildPluginInfo } from "./get-info";

function requireValue(value: unknown, name: string): string {
  const result = readString(value);
  if (!result) throw new Error(name + " 不能为空");
  return result;
}

async function getInfo(): Promise<InfoContract> {
  return buildPluginInfo();
}

async function searchComic(
  payload: SearchComicPayload = {},
): Promise<SearchResultContract> {
  const page = Math.max(1, Math.floor(Number(payload.page ?? 1) || 1));
  const keyword = readString(payload.keyword ?? toStringMap(payload.extern).keyword);
  if (!keyword) {
    const emptyPaging = {
      page,
      pages: 1,
      total: 0,
      hasReachedMax: true,
    };
    return {
      source: PLUGIN_ID,
      extern: payload.extern ?? null,
      scheme: {
        version: "1.0.0",
        type: "searchResult",
        source: PLUGIN_ID,
        list: "comicGrid",
      },
      data: { paging: emptyPaging, items: [] },
      paging: emptyPaging,
      items: [],
    };
  }

  const url = buildSearchUrl(keyword, page);
  const html = await fetchHtml(url);
  const result = parseSearchResult(html, page, url);
  result.extern = {
    ...toStringMap(payload.extern),
    keyword,
    page,
  };
  return result;
}

async function getComicDetail(
  payload: ComicDetailPayload = {},
): Promise<ComicDetailContract> {
  const bookId = requireValue(payload.comicId, "comicId");
  const url = buildBookUrl(bookId);
  const html = await fetchHtml(url);
  const result = parseComicDetail(html, bookId, url);
  result.extern = payload.extern ?? result.extern;
  return result;
}

type LoadedChapterData = {
  detail: ComicDetailContract;
  pageData: ParsedChapterPage;
  chapter: ChapterSummary;
  pages: ChapterPage[];
};

function createFallbackChapter(
  bookId: string,
  chapterId: string,
  name: string,
  order: number,
): ChapterSummary {
  return {
    id: chapterId,
    requestId: chapterId,
    logicalKey: bookId + ":" + chapterId,
    storageChapterId: chapterId,
    name: name || "章节 " + chapterId,
    order,
    extern: { bookId, chapterId },
  };
}

async function loadChapterData(
  bookId: string,
  chapterId: string,
): Promise<LoadedChapterData> {
  const bookUrl = buildBookUrl(bookId);
  const chapterUrl = buildChapterUrl(chapterId);
  const [bookHtml, chapterHtml] = await Promise.all([
    fetchHtml(bookUrl),
    fetchHtml(chapterUrl, bookUrl),
  ]);
  const detail = parseComicDetail(bookHtml, bookId, bookUrl);
  const pageData = parseChapterPage(chapterHtml, chapterId, chapterUrl);
  const chapters = detail.data.normal.eps;
  const current =
    chapters.find(
      (item) =>
        item.id === chapterId ||
        item.requestId === chapterId ||
        item.logicalKey === chapterId ||
        item.storageChapterId === chapterId,
    ) ??
    createFallbackChapter(
      bookId,
      chapterId,
      pageData.title,
      chapters.length + 1,
    );
  const pages = createChapterPages(
    bookId,
    chapterId,
    pageData.imageUrls,
    chapterUrl,
  );
  if (pages.length === 0) {
    throw new Error("章节没有返回图片：" + chapterId);
  }
  return {
    detail,
    pageData,
    chapter: {
      ...current,
      name: current.name || pageData.title,
      extern: {
        ...current.extern,
        imageCount: pages.length,
        chapterUrl,
        previousChapterId: pageData.previousChapterId,
        nextChapterId: pageData.nextChapterId,
      },
    },
    pages,
  };
}

async function getChapter(
  payload: ChapterPayload = {},
): Promise<ChapterContentContract> {
  const bookId = requireValue(payload.comicId, "comicId");
  const chapterId = requireValue(payload.chapterId, "chapterId");
  const loaded = await loadChapterData(bookId, chapterId);
  const normal = loaded.detail.data.normal;
  const chapters = normal.eps.some((item) => item.id === loaded.chapter.id)
    ? normal.eps
    : [...normal.eps, loaded.chapter];

  return {
    source: PLUGIN_ID,
    comicId: bookId,
    chapterId: loaded.chapter.id,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "chapterContent",
      source: PLUGIN_ID,
    },
    data: {
      comic: {
        id: bookId,
        source: PLUGIN_ID,
        title: normal.comicInfo.title,
        extern: normal.comicInfo.extern,
      },
      chapter: {
        ...loaded.chapter,
        pages: loaded.pages,
      },
      chapters,
    },
  };
}

async function getReadSnapshot(
  payload: ReadSnapshotPayload = {},
): Promise<ReadSnapshotContract> {
  const bookId = requireValue(payload.comicId, "comicId");
  const chapterId = requireValue(payload.chapterId, "chapterId");
  const loaded = await loadChapterData(bookId, chapterId);
  const normal = loaded.detail.data.normal;
  const chapters = normal.eps.some((item) => item.id === loaded.chapter.id)
    ? normal.eps
    : [...normal.eps, loaded.chapter];

  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    data: {
      comic: {
        id: bookId,
        source: PLUGIN_ID,
        title: normal.comicInfo.title,
        extern: normal.comicInfo.extern,
      },
      chapter: {
        ...loaded.chapter,
        pages: loaded.pages,
      },
      chapters: chapters.map((item) => ({
        id: item.id,
        name: item.name,
        order: item.order,
        extern: item.extern,
      })),
    },
  };
}

async function getSettingsBundle(): Promise<SettingsBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [],
    },
    data: {
      canShowUserInfo: false,
      values: {},
    },
  };
}

async function getCapabilitiesBundle(): Promise<CapabilitiesBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "capabilities",
      actions: [],
    },
    data: {},
  };
}

async function fetchImageBytes(
  payload: FetchImageBytesPayload = {},
): Promise<Uint8Array<ArrayBufferLike>> {
  const url = requireValue(payload.url, "图片 URL");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("图片 URL 格式无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("图片 URL 必须使用 HTTP 或 HTTPS");
  }

  const taskGroupKey = readString(payload.taskGroupKey);
  if (taskGroupKey && (await runtime.isTaskGroupCancelled(taskGroupKey))) {
    return new Uint8Array(new ArrayBuffer(0));
  }

  const extern = toStringMap(payload.extern);
  const referer = readString(extern.referer) || BASE_URL + "/";
  const timeoutMs = Math.max(1_000, Number(payload.timeoutMs ?? 30_000) || 30_000);
  const response = await fetch(parsed.href, {
    method: "GET",
    headers: buildImageHeaders(referer),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(
      "图片下载失败：HTTP " +
        response.status +
        " " +
        response.statusText +
        "（" +
        parsed.href +
        "）",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!looksLikeImage(bytes)) {
    throw new Error(
      "图片响应不是有效的图像数据（可能是站点错误页）：" + parsed.href,
    );
  }
  return bytes;
}

function looksLikeImage(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return true;
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return true;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return true;
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return true;
  }
  return bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00;
}

export default {
  getInfo,
  searchComic,
  getComicDetail,
  getChapter,
  getReadSnapshot,
  getSettingsBundle,
  getCapabilitiesBundle,
  fetchImageBytes,
};
