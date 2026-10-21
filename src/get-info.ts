import type { ComicListScene, InfoContract } from "breeze-plugin-kit";
import { BASE_URL, PLUGIN_ID } from "./common";

export function buildRankingScene(): ComicListScene {
  return {
    title: "排行榜",
    source: PLUGIN_ID,
    body: {
      type: "pluginPagedComicList" as const,
      request: { fnPath: "getRankingData", core: {}, extern: { source: "ranking" } },
    },
    filter: { fnPath: "getRankingFilterBundle", extern: { source: "ranking" } },
  };
}

export function buildCategoryScene(): ComicListScene {
  return {
    title: "分类",
    source: PLUGIN_ID,
    body: {
      type: "pluginPagedComicList" as const,
      request: {
        fnPath: "getCategoryData",
        core: {},
        extern: { source: "category", tag: "全部", area: "-1", end: "-1" },
      },
    },
    filter: {
      fnPath: "getCategoryFilterBundle",
      extern: { source: "category", tag: "全部", area: "-1", end: "-1" },
    },
  };
}

export function buildCloudFavoriteScene(): ComicListScene {
  return {
    title: "云端收藏",
    source: PLUGIN_ID,
    body: {
      type: "pluginPagedComicList" as const,
      request: { fnPath: "getCloudFavoriteData", core: {}, extern: { source: "cloudFavorite" } },
    },
    filter: { fnPath: "getCloudFavoriteFilterBundle", core: {}, extern: { source: "cloudFavorite" } },
  };
}

export function buildPluginInfo(): InfoContract {
  return {
    name: "JJ漫画",
    uuid: PLUGIN_ID,
    iconUrl: BASE_URL + "/favicon.ico",
    describe: "JJ漫画源插件",
    version: "0.4.0",
    home: "https://github.com/deretame/Breeze-plugin-jjmhw",
    updateUrl: "https://api.github.com/repos/deretame/Breeze-plugin-jjmhw/releases/latest",
    npmName: "breeze-plugin-jjmhw",
    haveHome: true,
    haveCloudFavorite: true,
    function: [
      {
        id: "ranking",
        title: "排行榜",
        action: { type: "openComicList" as const, payload: { scene: buildRankingScene() } },
      },
      {
        id: "category",
        title: "分类",
        action: { type: "openComicList" as const, payload: { scene: buildCategoryScene() } },
      },
      {
        id: "cloudFavorite",
        title: "云端收藏",
        action: { type: "openComicList" as const, payload: { scene: buildCloudFavoriteScene() } },
      },
    ],
  };
}

export function buildManifestInfo(): InfoContract {
  return buildPluginInfo();
}
