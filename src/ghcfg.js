/* 云端存档配置（设计22 第三节）。k 留空 = 只用本机存档（开发测试）。
   放存档的私有仓库是 Saves（原名 fanwang-saves，已改名；跟另外几个游戏同一个），本游戏的文件夹 shoufu/。
   k 是打乱过的令牌（base64 后倒序）：打包时 tools/build.mjs 用 TOKEN=@INJECT 留占位符，在用户电脑上 tools/inject_key.mjs 填进去。不要手改、不进 git。 */
export const GH_SAVE = { owner: 'xiongcz0407-netizen', repo: 'Saves', dir: 'shoufu/', k: 'ThjazUkRtJGNLJVWUplQ1EVZsBFWIdGejJXchFERihzSoBHdJ9UdHhWMlhFdjNTW45WUuNWUrZ1ZZR2XylDTpJld5pkavpHRwkFN3skMRNUMx8FdhB3XiVHa0l2Z' };
