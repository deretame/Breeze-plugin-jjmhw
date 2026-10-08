import type {
  ActionItem,
  ComicListItem,
  CreatorPageAction,
  ImageItem,
  MetadataListItem,
  PagingInfo,
  RecommendItem,
  StringMap,
} from "breeze-plugin-kit";

export const PLUGIN_ID = "d6f2f13a-b4d0-4f6c-9c6d-8a9f1a2b7c31";
export const BASE_URL = "https://www.jjmhw.cc";
export const FALLBACK_IMAGE_URL = BASE_URL + "/favicon.ico";
export const PLACEHOLDER_IMAGE_PATH = "placeholder/jjmhw.jpg";

export function toStringMap(value: unknown): StringMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as StringMap) : {};
}

export function readString(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function readNumber(value: unknown, fallback = 0): number {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function safePathSegment(value: unknown, fallback: string): string {
  const normalized = readString(value)
    // oxlint-disable-next-line no-control-regex -- intentional: strip control chars from path segments
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, "_")
    .trim();
  return normalized || fallback;
}

export function normalizeUrl(value: unknown, baseUrl = BASE_URL): string {
  const raw = readString(value);
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return "";
  }
}

export function parseStyleUrl(value: unknown): string {
  return readString(value).match(/url\((['"]?)(.*?)\1\)/iu)?.[2] ?? "";
}

export function parseBookId(value: unknown): string {
  return readString(value).match(/(?:^|\/)book\/(\d+)/u)?.[1] ?? "";
}

export function parseChapterId(value: unknown): string {
  return readString(value).match(/(?:^|\/)chapter\/(\d+)/u)?.[1] ?? "";
}

export function createSearchAction(keyword = ""): CreatorPageAction {
  return {
    type: "openSearch",
    payload: {
      source: PLUGIN_ID,
      ...(keyword ? { keyword } : {}),
    },
  };
}

export function createActionItem(
  name: unknown,
  onTap: ActionItem["onTap"] = createSearchAction(),
  extern: StringMap = {},
): ActionItem {
  return { name: readString(name), onTap, extern };
}

export function createImage(
  input: {
    id?: unknown;
    url?: unknown;
    name?: unknown;
    path?: unknown;
    extern?: StringMap;
  } = {},
): ImageItem {
  return {
    id: readString(input.id),
    url: normalizeUrl(input.url) || FALLBACK_IMAGE_URL,
    name: readString(input.name),
    path: readString(input.path) || PLACEHOLDER_IMAGE_PATH,
    extern: input.extern ?? {},
  };
}

export function createMetadata(type: string, name: string, values: string[]): MetadataListItem {
  return {
    type,
    name,
    value: values
      .map((value) => readString(value))
      .filter(Boolean)
      .map((value) => createActionItem(value, createSearchAction(value))),
  };
}

export function createComicItem(input: {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  author?: string;
  status?: string;
  updatedAt?: string;
  finished?: boolean;
  viewsCount?: number;
  raw?: StringMap;
  extern?: StringMap;
}): ComicListItem {
  return {
    source: PLUGIN_ID,
    id: input.id,
    title: input.title,
    subtitle: input.subtitle ?? "",
    finished: input.finished ?? false,
    likesCount: 0,
    viewsCount: input.viewsCount ?? 0,
    updatedAt: input.updatedAt ?? "",
    cover: createImage({
      id: input.id,
      url: input.coverUrl,
      name: `${input.title}.jpg`,
      path: `comic/${safePathSegment(input.id, "unknown")}/cover-v2.jpg`,
      extern: { remoteUrl: input.coverUrl ?? "" },
    }),
    metadata: [
      createMetadata("author", "作者", input.author ? [input.author] : []),
      createMetadata("status", "状态", input.status ? [input.status] : []),
    ].filter((item) => item.value.length > 0),
    raw: input.raw ?? {},
    extern: input.extern ?? {},
  };
}

export function createRecommendItem(input: {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  raw?: StringMap;
}): RecommendItem {
  return {
    source: PLUGIN_ID,
    id: input.id,
    title: input.title,
    subtitle: input.subtitle ?? "",
    finished: /完結|完结/iu.test(input.subtitle ?? ""),
    likesCount: 0,
    viewsCount: 0,
    updatedAt: "",
    cover: createImage({
      id: input.id,
      url: input.coverUrl,
      name: `${input.title}.jpg`,
      path: `comic/${safePathSegment(input.id, "unknown")}/recommend-cover-v2.jpg`,
      extern: { remoteUrl: input.coverUrl ?? "" },
    }),
    metadata: [],
    raw: input.raw ?? {},
    extern: {},
  };
}

export function createPaging(
  page: number,
  total: number,
  itemCount: number,
  pageSize: number,
): PagingInfo {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pages,
    total,
    hasReachedMax: page >= pages || itemCount < pageSize,
  };
}
