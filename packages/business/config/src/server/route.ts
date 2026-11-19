// set timeout to about 5 minutes, and give 2s padding time
export const ASYNC_TASK_TIMEOUT = (60 * 5 - 2) * 1000;

/**
 * Video generation runs much longer than chat/image/file tasks: gufo's fast preset
 * takes about 232s for a 5s clip, exact 5s about 19 minutes, and a shared ai07
 * deployment queues several requests. Keep the generic async timeout short and let
 * deployments widen this one via `VIDEO_TASK_TIMEOUT_MS`.
 */
export const VIDEO_TASK_TIMEOUT = (() => {
  const configured = Number(process.env.VIDEO_TASK_TIMEOUT_MS);

  return Number.isFinite(configured) && configured > 0 ? configured : (60 * 60 - 2) * 1000;
})();

// // trpc routes max duration
// export const TRPC_ASYNC_MAX_DURATION: number | undefined = undefined;
// export const TRPC_TOOLS_MAX_DURATION: number | undefined = undefined;

// export const WEBAPI_CHAT_MAX_DURATION: number = 300;
// export const WEBAPI_PLUGIN_GATEWAY_MAX_DURATION: number | undefined = undefined;
