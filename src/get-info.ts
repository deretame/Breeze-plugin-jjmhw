import type { InfoContract } from "breeze-plugin-kit";
import { BASE_URL, PLUGIN_ID } from "./common";

export function buildPluginInfo(): InfoContract {
  return {
    name: "JJ漫画",
    uuid: PLUGIN_ID,
    iconUrl: BASE_URL + "/favicon.ico",
    describe: "JJ漫画源插件",
    version: "0.3.1",
    home: "https://github.com/deretame/Breeze-plugin-jjmhw",
    updateUrl: "https://api.github.com/repos/deretame/Breeze-plugin-jjmhw/releases/latest",
    npmName: "breeze-plugin-jjmhw",
    function: [
      {
        id: "ranking",
        title: "排行榜",
        action: {
          type: "openComicList" as const,
          payload: {
            scene: {
              title: "排行榜",
              source: PLUGIN_ID,
              body: {
                type: "pluginPagedComicList" as const,
                request: {
                  fnPath: "getRankingData",
                  core: {},
                  extern: { source: "ranking" },
                },
              },
              filter: {
                fnPath: "getRankingFilterBundle",
                extern: { source: "ranking" },
              },
            },
          },
        },
      },
      {
        id: "category",
        title: "分类",
        action: {
          type: "openComicList" as const,
          payload: {
            scene: {
              title: "分类",
              source: PLUGIN_ID,
              body: {
                type: "pluginPagedComicList" as const,
                request: {
                  fnPath: "getCategoryData",
                  core: {},
                  extern: {
                    source: "category",
                    tag: "全部",
                    area: "-1",
                    end: "-1",
                  },
                },
              },
              filter: {
                fnPath: "getCategoryFilterBundle",
                extern: {
                  source: "category",
                  tag: "全部",
                  area: "-1",
                  end: "-1",
                },
              },
            },
          },
        },
      },
    ],
  };
}

export function buildManifestInfo(): InfoContract {
  return buildPluginInfo();
}
