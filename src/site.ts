import { BASE_URL } from "./common";

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
};

export function buildSearchUrl(keyword: string, page = 1): string {
  const params = new URLSearchParams({ keyword });
  if (page > 1) params.set("page", String(page));
  return `${BASE_URL}/search?${params.toString()}`;
}

export function buildBookUrl(bookId: string): string {
  return `${BASE_URL}/book/${encodeURIComponent(bookId)}`;
}

export function buildChapterUrl(chapterId: string): string {
  return `${BASE_URL}/chapter/${encodeURIComponent(chapterId)}`;
}
export function buildRankUrl(): string {
  return `${BASE_URL}/rank`;
}

export function buildBooklistUrl(tag: string, area: string, end: string, page = 1): string {
  const params = new URLSearchParams({
    tag: tag || "全部",
    area: area || "-1",
    end: end || "-1",
  });
  if (page > 1) params.set("page", String(page));
  return `${BASE_URL}/booklist?${params.toString()}`;
}

export async function fetchHtml(url: string, referer = `${BASE_URL}/`): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    headers: { ...DEFAULT_HEADERS, Referer: referer },
  });
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status} ${response.statusText}（${url}）`);
  }
  return response.text();
}

export function buildImageHeaders(referer: string): Record<string, string> {
  return {
    ...DEFAULT_HEADERS,
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    Referer: referer,
    "x-rquickjs-host-offload-binary-v1": "1",
  };
}
