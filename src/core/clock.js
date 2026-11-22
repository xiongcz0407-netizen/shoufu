// 游戏时间：服务器时间 + 调试快进的偏移（毫秒）。所有逻辑都用 now()，不直接用 Date.now()
// 服务器时间（设计22 第三节「细节」）：开局 syncTime() 取一次，跟手机差 1 分钟以上就按服务器的走（改手机时钟没用）；
// 取不到时用手机时间，但不让时间倒退（floor = 上次存档的时间）
let offset = 0;
let srv = 0, floor = 0;
export const now = () => Math.max(Date.now() + srv, floor) + offset;
export const skip = (ms) => { offset += ms; };
export const getOffset = () => offset;
export const setOffset = (ms) => { offset = ms || 0; };
export const server = { synced: false };
export const getServerOffset = () => srv;
export const setServerOffset = (ms) => { srv = ms || 0; };
/** 不让时间倒退：读档后用上次存档的时间垫底（服务器时间取到了就不用） */
export const setFloor = (t) => { floor = server.synced ? 0 : Math.max(0, (t || 0) - offset); };
/** 取服务器时间：HEAD version.json 看响应头 Date。f 测试时换成假的 */
export async function syncTime(f = (u, o) => fetch(u, o), realNow = () => Date.now()) {
  if (typeof location !== 'undefined' && location.protocol === 'file:') return false;
  try {
    const t0 = realNow();
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ac && setTimeout(() => ac.abort(), 5000);
    let r; try { r = await f('version.json?t=' + t0, { method: 'HEAD', cache: 'no-store', signal: ac ? ac.signal : undefined }); } finally { to && clearTimeout(to); }
    const d = Date.parse((r.headers && r.headers.get && r.headers.get('date')) || ''); if (!d) return false;
    const s = d + (realNow() - t0) / 2; server.synced = true; floor = 0;
    srv = Math.abs(s - realNow()) > 60000 ? s - realNow() : 0;   // Date 头只到秒，差 1 分钟以内当成准的
    return true;
  } catch (e) { return false; }
}
