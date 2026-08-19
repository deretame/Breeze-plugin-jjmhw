import type { InfoContract } from "breeze-plugin-kit";
import { BASE_URL, PLUGIN_ID } from "./common";

export function buildPluginInfo(): InfoContract {
  return {
    name: "JJ漫画",
    uuid: PLUGIN_ID,
    iconUrl: BASE_URL + "/favicon.ico",
    creator: {
      name: "Breeze",
      describe: "jjmhw.cc 漫画源适配",
    },
    describe:
      "JJ漫画源插件，支持搜索、漫画详情、章节阅读、图片获取和章节下载。",
    version: "0.0.1",
    home: "https://github.com/deretame/jjmhw",
    updateUrl:
      "https://api.github.com/repos/deretame/Breeze-plugin-jjmhw/releases/latest",
    npmName: "breeze-plugin-jjmhw",
    function: [],
  };
}

export function buildManifestInfo(): InfoContract {
  return buildPluginInfo();
}
