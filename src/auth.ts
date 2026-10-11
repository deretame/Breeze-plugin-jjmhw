import { pluginConfig } from "breeze-plugin-kit";
import { BASE_URL } from "./common";

export const AUTH_ACCOUNT_CONFIG_KEY = "auth.account";
export const AUTH_PASSWORD_CONFIG_KEY = "auth.password";
const AUTH_COOKIE_CONFIG_KEY = "auth.cookie";

const REQUEST_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
};

async function loadConfig(key: string, fallback = ""): Promise<string> {
  try {
    const raw = await pluginConfig.load(key, fallback);
    if (raw === undefined || raw === null) return fallback;
    if (typeof raw === "object") {
      const map = raw as Record<string, unknown>;
      if (map.ok === true && "value" in map) {
        const value = map.value;
        return typeof value === "string" ? value : fallback;
      }
      return fallback;
    }
    const text = String(raw);
    if (!text.trim()) return fallback;
    if (text.startsWith("{") || text.startsWith('"')) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object") {
          const value = (parsed as Record<string, unknown>).value;
          return typeof value === "string" ? value : fallback;
        }
        return typeof parsed === "string" ? parsed : text;
      } catch {
        return text;
      }
    }
    return text;
  } catch {
    return fallback;
  }
}

async function saveConfig(key: string, value: string): Promise<void> {
  await pluginConfig.save(key, value);
}

export async function loadAuthCredentials(): Promise<{ account: string; password: string }> {
  const [account, password] = await Promise.all([
    loadConfig(AUTH_ACCOUNT_CONFIG_KEY),
    loadConfig(AUTH_PASSWORD_CONFIG_KEY),
  ]);
  return { account, password };
}

export async function saveAuthCredentials(account: string, password: string): Promise<void> {
  await Promise.all([
    saveConfig(AUTH_ACCOUNT_CONFIG_KEY, account),
    saveConfig(AUTH_PASSWORD_CONFIG_KEY, password),
  ]);
}

export async function loadAuthCookie(): Promise<string> {
  return loadConfig(AUTH_COOKIE_CONFIG_KEY);
}

export async function clearAuthState(): Promise<void> {
  await saveConfig(AUTH_COOKIE_CONFIG_KEY, "");
}

async function cookieHeader(): Promise<Record<string, string>> {
  const cookie = await loadAuthCookie();
  return cookie ? { Cookie: cookie } : {};
}
function readSetCookie(headers: Headers): string {
  // fetch 语义下 set-cookie 可能被隐藏；尽力读，能读到就存。
  const pairs: string[] = [];
  try {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof getSetCookie === "function") {
      for (const item of getSetCookie.call(headers)) {
        const pair = item.split(";", 1)[0].trim();
        if (pair) pairs.push(pair);
      }
      if (pairs.length > 0) return pairs.join("; ");
    }
  } catch {
    // ignore
  }
  const single = headers.get("set-cookie");
  if (single) {
    const pair = single.split(";", 1)[0].trim();
    if (pair) pairs.push(pair);
  }
  return pairs.join("; ");
}

type LoginResponse = { err?: number | string; msg?: string };

/**
 * 登录：POST /login（form 编码 username/password）。
 * 服务端实测不校验 captcha（真账密+错码照样 err:0），所以不发该字段。
 * 成功 err == 0；失败抛错（msg 原文，如“用户名或密码错误”）。
 * 登录态为 cookie，会话持久化供后续登录接口复用。
 */
export async function login(payload: { account?: string; password?: string }): Promise<void> {
  const account = String(payload.account ?? "").trim();
  const password = String(payload.password ?? "");
  if (!account) throw new Error("账号不能为空");
  if (!password) throw new Error("密码不能为空");

  const params = new URLSearchParams({ username: account, password });
  const response = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: {
      ...REQUEST_HEADERS,
      ...(await cookieHeader()),
      Referer: `${BASE_URL}/login`,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: params.toString(),
  });
  if (!response.ok) {
    throw new Error(`登录失败：HTTP ${response.status}`);
  }
  const data = (await response.json()) as LoginResponse;
  if (data.err !== 0 && data.err !== "0") {
    throw new Error(String(data.msg ?? "登录失败"));
  }
  const cookie = readSetCookie(response.headers);
  await saveAuthCredentials(account, password);
  if (cookie) {
    await saveConfig(AUTH_COOKIE_CONFIG_KEY, cookie);
  }
}
/**
 * 取书架 HTML（GET /bookshelf?page=N，需登录 cookie）。
 * 未登录会被 302/200 到登录页，调用方以内容判定（见 parser）。
 */
export async function fetchFavoriteShelfHtml(page: number): Promise<string> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const url = safePage > 1 ? `${BASE_URL}/bookshelf?page=${safePage}` : `${BASE_URL}/bookshelf`;
  const response = await fetch(url, {
    headers: {
      ...REQUEST_HEADERS,
      ...(await cookieHeader()),
      Referer: `${BASE_URL}/`,
    },
  });
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }
  return response.text();
}
async function authedFormPost(path: string, data: Record<string, string>): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...REQUEST_HEADERS,
      ...(await cookieHeader()),
      Referer: `${BASE_URL}/`,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams(data).toString(),
  });
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

/**
 * 设置收藏状态：POST /addfavor（book_id + val，详情页官方用法）。
 * val 取当前态：0 未收藏→收藏，1 已收藏→取消；返回 isfavor 新态。
 * 限流时报“操作太频繁”。
 */
export async function setFavoriteRemote(
  comicId: string,
  favored: boolean,
): Promise<{ favored: boolean }> {
  const id = comicId.trim();
  if (!id) throw new Error("漫画 ID 不能为空");
  const data = (await authedFormPost("/addfavor", {
    book_id: id,
    val: favored ? "0" : "1",
  })) as {
    err?: number | string;
    msg?: string;
    isfavor?: number | string;
  };
  if (data.err !== 0 && data.err !== "0") {
    throw new Error(String(data.msg ?? "收藏操作失败"));
  }
  return { favored: String(data.isfavor ?? "1") !== "0" };
}

/**
 * 删除收藏：POST /delfavors（ids 逗号分隔）。
 */
export async function removeFavoritesRemote(ids: string[]): Promise<void> {
  const list = ids.map((id) => id.trim()).filter((id) => id);
  if (list.length === 0) return;
  const data = (await authedFormPost("/delfavors", { ids: list.join(",") })) as {
    err?: number | string;
    msg?: string;
  };
  if (data.err !== 0 && data.err !== "0") {
    throw new Error(String(data.msg ?? "删除收藏失败"));
  }
}

export async function logout(): Promise<void> {
  await clearAuthState();
}
